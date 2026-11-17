# workspace/whereisthesun/tools/osm-canada.py
# SUNNY build step (t397u): Canada places and abandoned railway lines from a local OpenStreetMap extract (ODbL), in one read of the file.
#   python3 tools/osm-canada.py <canada.pbf> <out dir>    (three passes, no node index file)
# Writes <set>.json per place set (fun, fastfood, furniture, adult, farm, ev) as rows [lat, lon, code, name, brand or operator,
# osm ref, extra] (a way or relation placed at the mean of its nodes), and rail.json as [osm ref, kind, name, operator, opened,
# closed, [[lon, lat], ...]] for railways that are abandoned, razed, disused or now trails.
import osmium, json, os, re, sys

def has(v, pat):
    return re.search(pat, v or "") is not None

def climb(t):
    c, sport = t.get("climbing", ""), t.get("sport", "")
    if re.match(r"route", c) or c in ("bolt", "abseil", "no"): return ""
    boulder = has(sport, r"bouldering") or t.get("climbing:boulder") == "yes"
    ropes = any(t.get("climbing:" + k) == "yes" for k in ("toprope", "sport", "trad"))
    if c == "boulder": return "rock"
    if c in ("crag", "area", "crag_summit"): return "crag"
    if not has(sport, r"climbing|bouldering") and t.get("climbing:boulder") != "yes": return ""
    indoor = has(t.get("leisure"), r"^(sports_centre|fitness_centre|sports_hall)$") or "building" in t or t.get("indoor") == "yes" or "shop" in t
    if indoor: return "bgym" if boulder and not ropes and not has(sport, r"(^|;)climbing") else "cgym"
    return "rock" if boulder and not ropes else "crag"

def fun(t):
    if t.get("tourism") in ("zoo", "aquarium"): return "zoo"
    if t.get("tourism") == "theme_park": return "park"
    if t.get("leisure") == "amusement_arcade": return "arcade"
    if has(t.get("sport"), r"paintball") or t.get("shop") == "paintball": return "paint"
    return climb(t)

FOOD = [("burger", r"^(burger|american)"), ("pizza", r"^pizza"), ("chicken", r"^(chicken|fried_chicken|wings)"),
        ("sandwich", r"^(sandwich|sub|bagel|deli)"), ("kebab", r"^(kebab|doner|shawarma|gyros|falafel|lebanese|turkish|greek|middle_eastern)"),
        ("mexican", r"^(mexican|tex-mex|taco|burrito)"), ("chinese", r"^chinese"), ("sushi", r"^(sushi|japanese)"),
        ("noodle", r"^(noodle|ramen|vietnamese|pho|thai|asian|korean)"), ("indian", r"^(indian|curry|pakistani)"), ("fish", r"^(fish|seafood)"),
        ("hotdog", r"^hot_dog"), ("fries", r"^(french_fries|fries|poutine|chips)"), ("coffee", r"^(coffee|donut|doughnut|bakery|breakfast)"),
        ("icecream", r"^(ice_cream|frozen_yogurt)"), ("tea", r"^bubble_tea")]

def fastfood(t):
    if t.get("amenity") != "fast_food": return ""
    c = (t.get("cuisine") or "").lower().split(";")[0].strip()
    return next((k for k, p in FOOD if re.match(p, c)), "other")

def furniture(t):
    if t.get("brand") == "IKEA" or t.get("brand:wikidata") == "Q54078": return "ikea"
    if t.get("brand") in ("HomeSense", "HomeGoods"): return "tjx"
    return {"furniture": "furn", "interior_decoration": "decor", "bed": "bed", "lighting": "light"}.get(t.get("shop"), "")

def adult(t):
    if t.get("amenity") == "stripclub": return "strip"
    if t.get("shop") in ("erotic", "adult"): return "shop"
    if t.get("amenity") in ("swingerclub", "love_hotel") or t.get("leisure") == "swingerclub": return "club"
    if t.get("natural") == "beach" and t.get("nudism") in ("yes", "designated", "customary", "permissive"): return "nude"
    if t.get("naturism") in ("yes", "designated") or (t.get("leisure") == "resort" and t.get("nudism") in ("yes", "designated")): return "nude"
    return ""

CROPS = [("wheat", r"wheat|grain|cereal|oats|barley|rye"), ("corn", r"corn|maize"), ("soy", r"soy"), ("canola", r"canola|rape"),
         ("potato", r"potato"), ("veg", r"vegetable|cabbage|lettuce|carrot|onion|beet|tomato|pepper|squash|pumpkin|bean|pea"),
         ("berry", r"berr|cranberr|strawberr|blueberr"), ("hay", r"hay|grass|alfalfa|clover|forage"), ("tobacco", r"tobacco")]
ANIMAL = [("dairy", r"milk|dairy"), ("beef", r"beef|cattle|cow"), ("poultry", r"chicken|poultry|egg|turkey"), ("pig", r"pig|pork|hog|swine"),
          ("sheep", r"sheep|goat|lamb|wool"), ("horse", r"horse|equine"), ("bees", r"honey|bee")]

def farm(t):
    lu = t.get("landuse")
    if lu == "orchard": return "orchard"
    if lu == "vineyard": return "vine"
    if lu == "greenhouse_horticulture" or t.get("building") == "greenhouse": return "green"
    if lu not in ("farmland", "farmyard", "farm", "meadow", "animal_keeping") and t.get("place") != "farm" and t.get("shop") != "farm": return ""
    words = ";".join(t.get(k, "") for k in ("crop", "produce", "product", "animal", "livestock", "animal_keeping:type")).lower()
    for k, p in ANIMAL + CROPS:
        if re.search(p, words): return k
    return ""

def ev(t):
    tesla = t.get("brand") == "Tesla" or has(t.get("operator"), r"^Tesla") or t.get("brand:wikidata") == "Q478214" or has(t.get("network"), r"^Tesla")
    if t.get("amenity") == "charging_station":
        if tesla and (has(t.get("name"), r"(?i)supercharger") or "socket:tesla_supercharger" in t or has(t.get("network"), r"(?i)supercharger")): return "super"
        if tesla: return "dest"
        return "fast" if any(k.startswith("socket:") and k.endswith(":output") and has(t[k], r"^([5-9]\d|\d{3,})\s*kW") for k in t) or \
            any(t.get("socket:" + s) for s in ("chademo", "type2_combo", "type1_combo")) else "ev"
    if tesla and t.get("shop") == "car": return "store"
    if tesla and (t.get("shop") == "car_repair" or t.get("craft") == "car_repair" or t.get("service") == "repair"): return "service"
    return ""

SETS = [("fun", fun), ("fastfood", fastfood), ("furniture", furniture), ("adult", adult), ("farm", farm), ("ev", ev)]
KEYS = ["tourism", "leisure", "sport", "shop", "climbing", "climbing:boulder", "amenity", "brand", "naturism", "nudism", "landuse", "place",
        "building", "railway", "abandoned:railway", "razed:railway", "disused:railway"]
EXTRA = {"fun": "sport", "fastfood": "cuisine", "furniture": "shop", "adult": "amenity", "farm": "crop", "ev": "capacity"}

def railkind(t):
    if not (t.get("railway") in ("abandoned", "disused", "razed") or any(("%s:railway" % p) in t for p in ("abandoned", "razed", "disused"))): return ""
    if "highway" in t or "route" in t: return "t"
    if t.get("railway") == "disused" or "disused:railway" in t: return "d"
    return "a"

pbf, dst = sys.argv[1], sys.argv[2]
found, rails, ways, need_w, need_n = [], [], {}, set(), set()
for o in osmium.FileProcessor(pbf).with_filter(osmium.filter.KeyFilter(*KEYS)):
    t = {k: v for k, v in o.tags}
    if o.is_way():
        rk = railkind(t)
        if rk:
            refs = [n.ref for n in o.nodes]; ways[o.id] = refs; need_n.update(refs)
            rails.append(["w%d" % o.id, rk, t.get("name", ""), t.get("operator") or t.get("historic:operator") or t.get("abandoned:operator", ""),
                          t.get("start_date", ""), t.get("end_date") or t.get("abandoned:date", ""), o.id])
    for s, fn in SETS:
        c = fn(t)
        if not c: continue
        meta = [s, c, t.get("name", ""), t.get("brand") or t.get("operator", ""), "", t.get(EXTRA[s], "")]
        if o.is_node():
            if o.location.valid(): found.append([round(o.location.lat, 5), round(o.location.lon, 5)] + meta[:4] + ["n%d" % o.id, meta[5]])
        elif o.is_way():
            refs = [n.ref for n in o.nodes]; ways[o.id] = refs; need_n.update(refs); found.append([None, ("w", o.id)] + meta[:4] + ["w%d" % o.id, meta[5]])
        elif o.is_relation():
            ms = [m.ref for m in o.members if m.type == "w"]
            if ms: need_w.update(ms); found.append([None, ("r", ms)] + meta[:4] + ["r%d" % o.id, meta[5]])
        break
print("pass 1", len(found), len(rails), flush=True)
need_w -= set(ways)
for w in osmium.FileProcessor(pbf, osmium.osm.WAY).with_filter(osmium.filter.IdFilter(need_w)):
    refs = [n.ref for n in w.nodes]; ways[w.id] = refs; need_n.update(refs)
print("pass 2", len(ways), len(need_n), flush=True)
loc = {}
for n in osmium.FileProcessor(pbf, osmium.osm.NODE).with_filter(osmium.filter.IdFilter(need_n)):
    loc[n.id] = (round(n.location.lat, 5), round(n.location.lon, 5))
out = {s: [] for s, _ in SETS}
for f in found:
    if f[0] is None:
        kind, ref = f[1]
        refs = ways.get(ref, []) if kind == "w" else [r for w in ref for r in ways.get(w, [])]
        ps = [loc[r] for r in refs if r in loc]
        if not ps: continue
        f = [round(sum(p[0] for p in ps) / len(ps), 5), round(sum(p[1] for p in ps) / len(ps), 5)] + f[2:]
    out[f[2]].append(f[:2] + f[3:])
for s in out:
    json.dump(out[s], open(os.path.join(dst, s + ".json"), "w"), ensure_ascii=False)
    print(s, len(out[s]))
lines = []
for r in rails:
    cs = [[loc[n][1], loc[n][0]] for n in ways.get(r[6], []) if n in loc]
    if len(cs) >= 2: lines.append(r[:6] + [cs])
json.dump(lines, open(os.path.join(dst, "rail.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print("rail", len(lines))
