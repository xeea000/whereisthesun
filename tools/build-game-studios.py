#!/usr/bin/env python3
"""Build data/world/gamedev.* for the Game dev studios layer (t436u, t437u, t439u).

Sources (all free, keyless):
  Wikidata (CC0): video game developers and publishers (P31/P279*), companies with
    industry = video game industry, game subsidiaries (P355 / P749), members of the
    English Wikipedia video game company categories, and every developer linked from
    the Wikipedia "List of video game developers".
  Wikipedia list of video game developers: city fallback when Wikidata has no place.
  OpenStreetMap (ODbL): offices whose name says games, game studio or gamedev.
  tools/gamedev-former.json: former offices with a public source and years.
Tiers use stated facts only (see legend in game-studios.js). Raw downloads live in
RAW (default /workspace/t436/raw): base.csv, wd.json, wd2.json, subs.json, classes.csv,
wp_rows.json, wp_cities.json, osm.json, osm2.json.
Usage: python3 tools/build-game-studios.py [RAW]"""
import json, os, re, sys, math, subprocess, collections, csv

RAW = sys.argv[1] if len(sys.argv) > 1 else "/workspace/t436/raw"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "world", "gamedev")
COLS = "name,why,city,country,prec,parent,pq,founded,formerly,games,web,qid,wiki,src,note,emp,empy,rev,revg,revs,revu"
DEV = {"Q210167", "Q1137109", "Q105543609"}  # developer, publisher, indie games publisher
PUBCLS = {"Q1137109", "Q105543609", "Q219577"}  # publisher, indie publisher, holding company
GAME = re.compile(r"video ?games?|computer games?|game (developer|studio|publisher|company|develop|maker)|"
                  r"games? (developer|publisher|studio|company)|gaming company|mobile games?|game engine|"
                  r"visual novel|eroge|arcade game|esports? (game|publisher)|gaming (division|business|arm|subsidiary)", re.I)
NOTGAME = re.compile(r"esports? (team|club|organi[sz]ation)|retail|store chain|shop\b|television|"
                     r"film (studio|production)|animation studio|record label|bank\b|casino|lottery|gambling|"
                     r"slot machine|board game|tabletop|toy (company|manufacturer)|university|school\b|"
                     r"magazine|website|journalist|human\b|person\b|band\b|musician", re.I)
OUTSRC = re.compile(r"outsourc|co-?develop|porting|port(s|ing)? (studio|house|specialist)|art (production|services|outsourc)|"
                    r"external development|work[- ]for[- ]hire|game services|quality assurance|\bQA\b|localization|localisation|"
                    r"support studio|development partner", re.I)
OUT_NAMES = ["certain affinity", "sumo group", "sumo digital", "virtuos", "keywords studios", "room 8 studio", "lakshya",
             "streamline studios", "lionbridge games", "pole to win", "ptw", "testronic", "d3t", "atomhawk", "iron galaxy",
             "panic button", "feral interactive", "aspyr", "shiver entertainment", "liquid development",
             "red hot cg", "kevuru games", "juego studios", "abstraction games", "sperasoft", "globalstep"]
OUT_PARENTS = {"keywords studios", "sumo group", "virtuos", "pole to win", "ptw", "lionbridge", "testronic",
               "room 8 group", "lakshya digital", "globalstep", "sumo digital"}
# Major publishers: owned by one of these (P749, up to three levels) makes a studio AAA / major.
MAJOR = ["electronic arts", "activision", "blizzard entertainment", "microsoft", "xbox", "bethesda softworks", "zenimax",
         "sony interactive entertainment", "playstation studios", "sony computer entertainment", "nintendo", "take-two",
         "rockstar games", "2k", "ubisoft", "square enix", "bandai namco", "sega", "capcom", "konami", "tencent",
         "netease", "warner bros. games", "warner bros. interactive", "epic games", "cd projekt", "krafton", "nexon",
         "ncsoft", "riot games", "valve", "mihoyo", "hoyoverse", "koei tecmo", "amazon games", "netmarble"]
UA = "SunnyBuild/1.0"
HAVEN = {"Cayman Islands", "British Virgin Islands", "Bermuda", "Jersey", "Guernsey", "Isle of Man"}


def qid(u):
    return (u or "").rsplit("/", 1)[-1]


def pt(s):
    m = re.search(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", s or "")
    return (float(m.group(2)), float(m.group(1))) if m else None


def yr(s):
    m = re.match(r"-?(\d{3,4})", s or "")
    return m.group(1) if m else ""


def norm(s):
    s = re.sub(r"\b(inc|ltd|llc|gmbh|s\.?a\.?|co|corp|corporation|limited|ab|oy|kk|srl|bv|plc|pty)\b\.?", "", (s or "").lower())
    return re.sub(r"[^a-z0-9\u3040-\u9fff\uac00-\ud7af]+", "", s)


def km(a, b):
    r = math.pi / 180
    x = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 12742 * math.asin(min(1, math.sqrt(x)))


def has(name, words):
    n = (name or "").lower()
    return any(re.search(r"(^|[^a-z0-9])" + re.escape(w) + r"($|[^a-z0-9])", n) for w in words)


def load():
    wd = collections.defaultdict(list)
    for f in ("wd.json", "wd2.json"):
        p = os.path.join(RAW, f)
        if os.path.exists(p):
            for k, rows in json.load(open(p)).items():
                wd[k] += rows
    return wd


def main():
    wd = load()
    base = {qid(r["item"]) for r in csv.DictReader(open(os.path.join(RAW, "base.csv")))}
    labels = json.load(open(os.path.join(RAW, "labels.json")))
    hq_up = json.load(open(os.path.join(RAW, "hq_up.json")))
    for k, a, b in (("core", "item", "label"), ("par", "p", "pLabel"), ("par", "gp", "gpLabel"), ("par", "ggp", "ggpLabel"),
                    ("hq", "hq", "hqLabel"), ("loc", "loc", "locLabel"), ("repl", "r", "rLabel")):
        for r in wd[k]:
            if r.get(a) and not r.get(b) and qid(r[a]) in labels:
                r[b] = labels[qid(r[a])]
    for r in wd["hq"]:
        if not r.get("hqc") and qid(r["hq"]) in hq_up:
            r["hqc"] = hq_up[qid(r["hq"])][0]
    core = {}
    for r in wd["core"]:
        core.setdefault(qid(r["item"]), r)
    by = lambda k: collections.defaultdict(list, {})
    idx = {}
    for k in ("hq", "loc", "emp", "par", "works", "names", "repl", "subs", "ind"):
        d = collections.defaultdict(list)
        for r in wd[k]:
            d[qid(r["item"])].append(r)
        idx[k] = d
    types = {q: {qid(t) for t in r.get("types", "").split("|") if t} for q, r in core.items()}
    label = {q: r.get("label", "") for q, r in core.items()}

    def gamey(q):
        r = core[q]
        inds = [i for x in idx["ind"][q] for i in x.get("ind", "").split("|") if i]
        # an industry tag counts only for companies that are mostly about games (two industries at most)
        txt = r.get("desc", "") + (" " + " ".join(inds) if len(inds) <= 2 else "")
        if "Q5" in types[q]:
            return False
        if NOTGAME.search(r.get("desc", "")) and not GAME.search(r.get("desc", "")):
            return False
        return bool(types[q] & DEV) or bool(GAME.search(txt)) or has(r.get("label", ""), ["games", "game studio", "gamestudio"])

    # parents: one row per item with up to three levels
    chain = {}
    for q, rows in idx["par"].items():
        c = []
        for r in rows:
            for a, b in (("p", "pLabel"), ("gp", "gpLabel"), ("ggp", "ggpLabel")):
                if r.get(a) and (qid(r[a]), r.get(b, "")) not in c:
                    c.append((qid(r[a]), r.get(b, "")))
        chain[q] = c
    nsubs = {q: int(r[0]["ns"]) for q, r in idx["subs"].items() if r}

    def parent_of(q):
        rows = idx["par"].get(q, [])
        for r in rows:
            if r.get("pLabel"):
                return qid(r["p"]), r["pLabel"]
        return ("", "")

    def tok(lbl):
        t = [x for x in re.sub(r"[^A-Za-z0-9 ]", "", lbl or "").split()
             if len(x) > 2 and x.lower() not in ("the", "games", "studios", "studio", "entertainment", "interactive", "group", "holdings", "inc")]
        return t[0].lower() if t else ""

    def keep(q):
        if q not in core or not core[q].get("label"):
            return False
        if gamey(q):
            return True
        # regional office or branch of a game company (Nintendo of America and so on)
        p, pl = parent_of(q)
        d = core[q].get("desc", "")
        if p in core and gamey(p) and tok(pl) and tok(pl) in core[q]["label"].lower() \
                and re.search(r"subsidiary|division|branch|office|of (america|europe|canada|korea|australia)|regional", d + " " + core[q]["label"], re.I) \
                and not re.search(r"animation|film|pictures|laborator|communications|music", d + " " + core[q]["label"], re.I):
            return True
        return False

    wp = json.load(open(os.path.join(RAW, "wp_rows.json")))
    wpc = json.load(open(os.path.join(RAW, "wp_cities.json")))
    wpby = {}
    for r in wp:
        if r.get("devq"):
            wpby.setdefault(r["devq"], r)

    # holding groups: a company that owns three or more of the kept game companies counts as a game holding
    kept0 = {q for q in core if keep(q)}
    held = collections.Counter(parent_of(q)[0] for q in kept0)
    holding = {q for q, n in held.items() if n >= 3 and q in core and q not in kept0 and core[q].get("label")
               and "Q5" not in types[q]
               and (types[q] & PUBCLS or re.search(r"holding|conglomerate|group|division", core[q].get("desc", "") + " " + core[q]["label"], re.I))}
    keep_ = keep
    keep = lambda q: q in holding or keep_(q)
    items, former = [], []
    stats = collections.Counter()
    for q in sorted(core):
        if not keep(q):
            stats["dropped"] += 1
            continue
        r = core[q]
        name = r["label"]
        # location
        loc = None
        prec = "c"
        city = country = ""
        cur = [h for h in idx["hq"][q] if not h.get("end") and not h.get("rank", "").endswith("Deprecated")]
        # a registered office in a tax haven is not where the studio works
        if any(h.get("hqcn") not in HAVEN for h in cur):
            cur = [h for h in cur if h.get("hqcn") not in HAVEN]
        cur.sort(key=lambda h: (not h.get("rank", "").endswith("Preferred"), h.get("start", "") and -int(yr(h["start"]) or 0) or 0))
        for h in cur:
            if h.get("qc") and pt(h["qc"]):
                loc, prec, city, country = pt(h["qc"]), "o", h.get("hqLabel", ""), h.get("hqcn", "")
                break
        if not loc and r.get("coord") and pt(r["coord"]):
            loc, prec = pt(r["coord"]), "o"
            if cur:
                city, country = cur[0].get("hqLabel", ""), cur[0].get("hqcn", "")
                # item coordinates far from its stated head office city (a registered office elsewhere): use the HQ city
                hc = pt(cur[0].get("hqc", ""))
                if hc and km(loc, hc) > 100:
                    loc, prec = hc, "c"
                    stats["coord_far"] += 1
        if not loc:
            for h in cur:
                if h.get("hqc") and pt(h["hqc"]):
                    loc, city, country = pt(h["hqc"]), h.get("hqLabel", ""), h.get("hqcn", "")
                    break
        if not loc:
            for l in idx["loc"][q]:
                if l.get("locc") and pt(l["locc"]):
                    loc, city = pt(l["locc"]), l.get("locLabel", "")
                    break
        src = ""
        w = wpby.get(q)
        if not loc and w and w.get("cityq") in wpc:
            loc, city = pt(wpc[w["cityq"]][0]), w.get("city", "")
            country = w.get("country", "")
            src = "wplist"
        country = country or r.get("country", "") or (w or {}).get("country", "")
        if re.match(r"^Q\d+$", city or ""):
            city = ""
        # former HQs from statements with an end time
        for h in idx["hq"][q]:
            if not h.get("end"):
                continue
            fl = pt(h.get("qc", "")) or pt(h.get("hqc", ""))
            if not fl:
                continue
            s, e = yr(h.get("start", "")), yr(h["end"])
            yrs = (s + "–" + e) if s else ("until " + e)
            former.append({"lat": fl[0], "lon": fl[1], "code": "former", "row": [
                name, "", h.get("hqLabel", ""), h.get("hqcn", "") or country, "o" if pt(h.get("qc", "")) else "c",
                name, q, "", "", "", "", q, "", "", "Former HQ of %s (%s)" % (name, yrs)]})
        if not loc:
            stats["noloc"] += 1
            continue
        # size facts
        emps = []
        for e in idx["emp"][q]:
            try:
                n = float(e["n"])
            except Exception:
                continue
            emps.append((yr(e.get("when", "")) or "0000", n))
        emps.sort()
        emp = emps[-1] if emps else None
        ch = chain.get(q, [])
        major = next((pl for pq_, pl in ch if pl and has(pl, MAJOR)), "")
        outp = next((pl for pq_, pl in ch if pl and has(pl, list(OUT_PARENTS))), "")
        desc = r.get("desc", "")
        dissolved = r.get("dissolved", "")
        isheld = held[q] >= 3 and (bool(types[q] & PUBCLS) or re.search(r"holding|conglomerate|group|division", desc + " " + name, re.I))
        ispub = q in holding or isheld or (bool(types[q] & DEV) or GAME.search(desc)) and (bool(types[q] & PUBCLS) or re.search(r"publisher|holding|conglomerate|gaming division", desc, re.I)) and (nsubs.get(q, 0) >= 3 or (emp and emp[1] >= 1000))
        if dissolved:
            code, why = "closed", "Closed " + yr(dissolved)
        elif has(name, OUT_NAMES) or OUTSRC.search(desc) or outp:
            code = "out"
            why = (outp and "Part of " + outp) or ("Wikidata: " + desc if OUTSRC.search(desc) else "Known outsourcing and co-development house")
        elif ispub:
            code = "pub"
            if q in holding or (isheld and nsubs.get(q, 0) < 3):
                why = "owns %d of the game companies on this map" % held[q]
            else:
                why = "%d subsidiaries on Wikidata" % nsubs.get(q, 0) if nsubs.get(q, 0) >= 3 else ""
        elif emp and emp[1] >= 250:
            code = "aaa"
        elif major:
            code, why = "aaa", "Owned by " + major
        elif emp and emp[1] >= 50:
            code = "mid"
        elif emp:
            code = "indie"
        else:
            code, why = "unk", ""
        if emp:
            es = "{:,} employees".format(int(emp[1])) + (" (%s)" % emp[0] if emp[0] != "0000" else " (year not stated)")
            if code in ("aaa", "mid", "indie") and not (code == "aaa" and major and emp[1] < 250):
                why = es
            else:
                why = (why + " · " if why else "") + es
        stats[code] += 1
        pq, pl = parent_of(q)
        works = ""
        if idx["works"][q]:
            ws = [x for x in idx["works"][q][0].get("works", "").split("|") if x and not re.match(r"^Q\d+$", x)]
            works = "|".join(sorted(ws, key=len)[:4]) if ws else ""
        if not works and w and w.get("games"):
            gs = []
            for g in w["games"].split("|"):
                if gs and re.match(r"^(series|franchise|games?|trilogy|\(.*\))$", g, re.I):
                    gs[-1] += " " + g
                elif len(g) > 2:
                    gs.append(g)
            works = "|".join(gs[:4])
        fn = []
        for n in idx["names"][q]:
            if n.get("nm") and norm(n["nm"]) != norm(name) and n.get("e"):
                fn.append("%s (until %s)" % (n["nm"], yr(n["e"])))
        for n in idx["repl"][q]:
            if n.get("rLabel") and norm(n["rLabel"]) != norm(name):
                fn.append(n["rLabel"])
        fn = list(dict.fromkeys(fn))[:4]
        wiki = (r.get("enwiki", "") or "").replace("https://en.wikipedia.org/wiki/", "")
        from urllib.parse import unquote
        wiki = unquote(wiki).replace("_", " ")
        founded = r.get("inception", "") or (w or {}).get("est", "")[:4]
        items.append({"lat": loc[0], "lon": loc[1], "code": code, "row": [
            name, why, city, country, prec, pl, pq, founded if re.match(r"^\d{4}$", founded or "") else "",
            "|".join(fn), works, r.get("web", ""), q, wiki, src or "wd", ""]})
        if emp:
            items[-1]["emp"] = (int(emp[1]), emp[0] if emp[0] != "0000" else "")
    cur_json = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "gamedev-former.json")))
    byq0 = {it["row"][11]: it for it in items}
    for f in cur_json["fixes"]:
        it = byq0.get(f["qid"])
        if not it:
            continue
        if "lat" in f:
            it["lat"], it["lon"], it["row"][4] = f["lat"], f["lon"], "o"
            it["row"][2] = f.get("addr", it["row"][2])
        if f.get("formerly") and f["formerly"].split(" (")[0] not in it["row"][8]:
            it["row"][8] = "|".join([f["formerly"]] + [x for x in it["row"][8].split("|") if x])
        if f.get("note"):
            it["row"][14] = f["note"]
    for a in cur_json.get("adds", []):
        items.append({"lat": a["lat"], "lon": a["lon"], "code": a["code"], "row": [
            a["name"], a["why"], a["addr"], a["country"], "o", a["parent"], a["pq"], "", a.get("formerly", ""), "",
            a.get("web", ""), "", "", a["src"], a.get("note", "")]})
        byq0[a["name"]] = items[-1]
    # OpenStreetMap offices
    osm = []
    for f in ("osm.json", "osm2.json"):
        p = os.path.join(RAW, f)
        if os.path.exists(p):
            osm += json.load(open(p))["elements"]
    seen = set()
    OSMOK = re.compile(r"\bgames\b|\bgame ?(studio|studios|dev|development|works|lab)|gameworks|gamedev|ゲーム|游戏|遊戲|게임", re.I)
    OSMBAD = re.compile(r"fish|wildlife|reserve|commission|department|lodge|lotter|casino|betting|\bbet\b|slot|bingo|poker|gambl|"
                        r"indoor games|sports? games|olympic|commonwealth games|highland games|games? (store|shop)|toys?\b|board ?game|"
                        r"escape|tickets|scientific games|999 games|puzzle|cards?\b|bowling|arcade$|club\b|association|federation", re.I)
    byname = collections.defaultdict(list)
    for it in items:
        byname[norm(it["row"][0])].append(it)
    byq = {it["row"][11]: it for it in items}
    for e in osm:
        key = (e["type"], e["id"])
        if key in seen:
            continue
        seen.add(key)
        t = e.get("tags", {})
        nm = t.get("name", "")
        lat = e.get("lat", e.get("center", {}).get("lat"))
        lon = e.get("lon", e.get("center", {}).get("lon"))
        if lat is None or not nm:
            continue
        hit = byq.get(t["wikidata"]) if t.get("wikidata") else None
        if not hit:
            for it in byname.get(norm(nm), []):
                if km((lat, lon), (it["lat"], it["lon"])) < 60:
                    hit = it
                    break
        if hit:
            if hit["row"][4] == "c" and km((lat, lon), (hit["lat"], hit["lon"])) < 60:
                hit["lat"], hit["lon"], hit["row"][4] = lat, lon, "o"
                stats["osm_upgrade"] += 1
            continue
        game = OSMOK.search(nm) or re.search(r"game", t.get("industry", "") + t.get("office", ""), re.I)
        if not game or OSMBAD.search(nm) or t.get("office") in ("government", "association", "ngo", "educational_institution", "forestry", "administrative", "insurance", "estate_agent", "lawyer"):
            continue
        city = t.get("addr:city", "")
        items.append({"lat": lat, "lon": lon, "code": "unk", "row": [
            nm, "Listed in OpenStreetMap as an office", city, t.get("addr:country", ""), "o", "", "", "", "", "",
            t.get("website", "") or t.get("contact:website", ""), "", "", "osm:%s/%d" % (e["type"], e["id"]), ""]})
        stats["osm_only"] += 1
    # curated former offices with a public source
    for f in cur_json["former"]:
        q = f["qid"]
        cur_it = byq0.get(q) or byq0.get(f["name"])
        former.append({"lat": f["lat"], "lon": f["lon"], "code": "former", "row": [
            f["name"] + " (former office)", "", f["addr"], "", f.get("prec", "o"), cur_it["row"][0] if cur_it else f["name"], q, "", "", "", "", "", "", f["src"], f["note"]]})
    # drop Wikidata former pins that sit on the current pin of the same company
    cur_by_q = {it["row"][11]: it for it in items}
    keepf = []
    for f in former:
        c = cur_by_q.get(f["row"][6])
        if c and km((f["lat"], f["lon"]), (c["lat"], c["lon"])) < 0.3:
            continue
        # a town-level former pin in the same town as the current office says nothing new
        if c and f["row"][4] == "c" and f["row"][2] and f["row"][2] == c["row"][2]:
            continue
        if f["row"][4] == "o" and not f["row"][13].startswith("http"):
            near = [it for it in items if it["row"][4] == "o" and it["code"] not in ("former", "closed") and it["row"][11] != f["row"][6]
                    and km((f["lat"], f["lon"]), (it["lat"], it["lon"])) < 0.15]
            if near:
                f["row"][14] += ". Wikidata places %s here today" % near[0]["row"][0]
        keepf.append(f)
    items += keepf
    stats["former"] = len(keepf)
    revenue(items, stats)
    for it in items:
        it["row"] = ["" if v is None else v for v in it["row"]]
        e = it.get("emp")
        rv = it.get("rev")
        it["row"] += [e[0] if e else "", e[1] if e else "", round(rv[0] / 1e6, 1) if rv else "", rv[1] if rv else "",
                      rv[2] if rv else "", rv[3] if rv else ""]
        # map props: log10 of headcount and of game revenue (USD), times 10; 0 = not known
        it["props"] = {"hl": int(round(math.log10(e[0]) * 10)) if e and e[0] >= 1 else 0,
                       "rl": int(round(math.log10(rv[0]) * 10)) if rv and rv[0] >= 1 else 0}
    tmp = OUT + ".items.json"
    json.dump({"items": items, "cols": COLS}, open(tmp, "w"), ensure_ascii=False)
    js = ("const {split}=require('%s/tools/split-points.js');const fs=require('fs');const d=JSON.parse(fs.readFileSync('%s','utf8'));"
          "fs.unlinkSync('%s');console.log(JSON.stringify(split('%s',d.items,d.cols,200)))") % (ROOT, tmp, tmp, OUT)
    print(subprocess.check_output(["node", "-e", js]).decode().strip())
    meta = {"built": "opt310", "counts": dict(stats),
            "countries": collections.Counter(it["row"][3] for it in items if it["code"] != "former").most_common(15)}
    json.dump(meta, open(OUT + ".meta.json", "w"), ensure_ascii=False, indent=1)
    print(json.dumps(meta, ensure_ascii=False))


def root(t):
    t = re.sub(r"\(.*?\)|\bfranchise\b", "", t.lower())
    t = re.split(r"[:–-]", t)[0]
    t = re.sub(r"\b([ivx]+|\d+)\b", "", t)
    return re.sub(r"[^a-z0-9]+", "", t)


def revenue(items, stats):
    """Attach real reported game revenue to studio pins (tools/gamedev-revenue.json). A title's revenue goes to
    the first credited studio that is on the map: developer or creator first, then publisher or owner. The same
    game or franchise counted twice keeps its larger figure; different games add up. A company's reported video
    game revenue is used when it is larger than its titles."""
    d = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "gamedev-revenue.json")))
    pins = {}
    for it in items:
        q = it["row"][11]
        if q and it["code"] not in ("former",) and q not in pins:
            pins[q] = it
    # each game or franchise is credited once, using its largest reported figure: to a credited developer or
    # creator on the map if there is one, else to a publisher or owner on the map
    cands = []
    def add(dev, pub, title, usd, src, url):
        qs = [(0, q) for q in dev if q in pins] + [(1, q) for q in pub if q in pins]
        if qs:
            cands.append([root(title), min(qs), title, usd, src, url])
    for e in d["titles"]:
        add([q for q in e["cq"] if q], [q for q in e["oq"] if q], e["title"].replace(" ( ", " (").replace(" )", ")"), e["usd"], e["src"], e["url"])
    for g in d["wikidata"]:
        add([g["dev"]] if g["dev"] else [], [g["pub"]] if g["pub"] else [], g["title"], g["usd"], "Wikidata " + g["gq"], "https://www.wikidata.org/wiki/" + g["gq"])
    groups = []
    for c in sorted(cands, key=lambda c: len(c[0])):
        g = next((g for g in groups if len(g[0][0]) >= 4 and (c[0].startswith(g[0][0]) or g[0][0].startswith(c[0]))), None)
        if g:
            g.append(c)
        else:
            groups.append([c])
    got = collections.defaultdict(dict)
    for g in groups:
        best = max(g, key=lambda c: (c[3], -c[1][0]))
        who = best[1][1]
        got[who][g[0][0]] = (best[2], best[3], best[4], best[5])
    byname = {norm(it["row"][0]): it for it in items if it["code"] != "former"}
    for q, games in got.items():
        gs = sorted(games.values(), key=lambda x: -x[1])
        tot = sum(x[1] for x in gs)
        srcs = list(dict.fromkeys(x[2] for x in gs))
        pins[q]["rev"] = (tot, "|".join(x[0] for x in gs[:3]), "; ".join(srcs), gs[0][3])
    for c in d["companies"]:
        it = next((pins[q] for q in c["q"] if q in pins), None) or byname.get(norm(c["company"]))
        if not it:
            continue
        if not it.get("rev") or c["usd"] > it["rev"][0]:
            it["rev"] = (c["usd"], "", "Wikipedia: largest video game companies by revenue (%s, all video game revenue)" % c["company"], c["url"])
    stats["rev"] = sum(1 for it in items if it.get("rev"))
    stats["emp_known"] = sum(1 for it in items if it.get("emp"))


if __name__ == "__main__":
    main()
