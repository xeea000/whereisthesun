// workspace/whereisthesun/tools/build-wars.js
/* SUNNY build step (t399u-t401u): Wars under History, data/world/wars-<row>.* (tools/split-points.js), Wikidata (CC0), free and keyless.
 *   node tools/build-wars.js <cache dir>
 * Which wars: every war on Wikidata with an end date before 2000 that has at least MIN places with a coordinate that are part of it
 * (directly or one step down, e.g. a battle in a campaign), biggest first; the Cold War is left out (no front line), and so is a
 * war front or theatre (Eastern Front: part of World War II), a war that is part of one already kept, or one that has fewer than
 * MIN places left once bigger wars have taken theirs. ASKED wars the owner named are kept whatever their count. Each place is listed once, under the first war that claims it.
 * Rows (ROWS): the four world and Asian wars on their own; the rest grouped by Wikidata type and name.
 * Kinds: battle, landing, fort (bunkers and forts), memorial, cemetery (war cemeteries), site (camps, headquarters, other places).
 * Also places whose significant event (P793) is part of a war, kept only when they are battlefields, beaches or military places.
 * Memorials: places that commemorate the war or a part of it (P547). War cemeteries and bunkers without a link to a war are placed by
 * the year they were made, only inside a world war, Korea or Vietnam. Nazi concentration camps go to World War II.
 * Places already on Heritage & ancient sites (data/world/history.*) stay there. */
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const crypto = require("crypto");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const CACHE = process.argv[2];
const MIN = 20;
const NAMED = { Q361: "ww1", Q362: "ww2", Q8663: "korea", Q8740: "vietnam" };
const ASKED = ["Q329203", "Q215112", "Q26013", "Q40949", "Q8676", "Q10859", "Q79911", "Q78994", "Q3202164", "Q1123201"];
const ROWS = ["ww1", "ww2", "korea", "vietnam", "indep", "civil", "colonial", "early", "modern"];
const sparqlFile = (name, q) => {
  const f = path.join(CACHE, "wd-" + name + ".json");
  if (!fs.existsSync(f)) {
    cp.execFileSync("curl", ["-s", "-m", "280", "-G", "-H", "Accept: application/sparql-results+json", "-A", "SUNNY-build/1.0 (github.com/xeea000/whereisthesun)",
      "--data-urlencode", "query=" + q, "https://query.wikidata.org/sparql", "-o", f]);
  }
  try { return JSON.parse(fs.readFileSync(f, "utf8")).results.bindings; } catch (e) { fs.unlinkSync(f); throw new Error(name + ": Wikidata did not answer, run again"); }
};
const v = (b, k) => { return b[k] ? b[k].value : ""; };
const qid = (u) => { return String(u || "").split("/").pop(); };
const yr = (s) => { const m = /^(-?\d+)-/.exec(s || ""); return m ? +m[1] : null; };
const cut = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const r5 = (x) => { return Math.round(x * 1e5) / 1e5; };
/* the wars, with how many places are part of each */
const LIST = "SELECT ?w ?wLabel ?n ?s ?e ?up (GROUP_CONCAT(DISTINCT ?tl;separator=\"|\") AS ?ty) WHERE { { SELECT ?w (COUNT(DISTINCT ?b) AS ?n) WHERE { " +
  "?b wdt:P361/wdt:P361? ?w; wdt:P625 ?c. ?w wdt:P31/wdt:P279* wd:Q198. } GROUP BY ?w HAVING(COUNT(DISTINCT ?b) >= 1) } " +
  "OPTIONAL{?w wdt:P580 ?s} OPTIONAL{?w wdt:P582 ?e} OPTIONAL{?w wdt:P361 ?up} OPTIONAL{?w wdt:P31 ?t. ?t rdfs:label ?tl. FILTER(LANG(?tl)=\"en\")} " +
  "SERVICE wikibase:label { bd:serviceParam wikibase:language \"en\" } } GROUP BY ?w ?wLabel ?n ?s ?e ?up";
const wars = {};
sparqlFile("wars-list", LIST).forEach((b) => {
  const id = qid(v(b, "w")), w = wars[id] || (wars[id] = { id: id, name: v(b, "wLabel"), n: +v(b, "n"), ty: v(b, "ty"), s: null, e: null, up: {} });
  const s = yr(v(b, "s")), e = yr(v(b, "e"));
  if (s != null && (w.s == null || s < w.s)) w.s = s;
  if (e != null && (w.e == null || e > w.e)) w.e = e;
  if (v(b, "up")) w.up[qid(v(b, "up"))] = 1;
});
const big = Object.values(wars).filter((w) => {
  if (NAMED[w.id] || ASKED.indexOf(w.id) >= 0) return true;
  return w.n >= MIN && w.e != null && w.e < 2000 && !/cold war|war front|theatre|theater/i.test(w.ty) && !/^Q\d+$/.test(w.name);
}).sort((a, b) => { return (NAMED[b.id] ? 1 : 0) - (NAMED[a.id] ? 1 : 0) || b.n - a.n; });
/* a war that is part of a bigger one already in the list (Eastern Front in World War II) is left to that one */
const seen = {};
const pick = big.filter((w) => {
  seen[w.id] = 1;
  return NAMED[w.id] || !Object.keys(w.up).some((u) => { return seen[u] && u !== w.id; });
});
/* places that are part of a war, and memorials to it, asked in batches of wars; then the facts for every place in batches of places
 * (asked together, the facts and the war links run past the query service's 60 s limit) */
const FACTS = "SELECT ?i ?iL ?c ?kL ?coL ?d ?d2 ?inc ?w2 WHERE { VALUES ?i { ITEMS } ?i wdt:P625 ?c. OPTIONAL{?i wdt:P585 ?d} OPTIONAL{?i wdt:P580 ?d2} " +
  "OPTIONAL{?i wdt:P571 ?inc} OPTIONAL{?i wdt:P17 ?co} OPTIONAL{?w2 schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>} OPTIONAL{?i wdt:P31 ?k} " +
  "SERVICE wikibase:label { bd:serviceParam wikibase:language \"en,mul,fr,de,es,it,nl,pl,cs,ru,uk,sv,da,nb,fi,pt,hu,ro,ja,zh\". ?i rdfs:label ?iL. ?k rdfs:label ?kL. ?co rdfs:label ?coL } }";
const tagOf = (s) => { return crypto.createHash("sha1").update(s).digest("hex").slice(0, 10); }; /* cache files follow what was asked */
const links = (name, vs, link) => {
  return sparqlFile(name + "-" + tagOf(vs + link), "SELECT DISTINCT ?i ?w WHERE { VALUES ?w { " + vs + " } " + link + " ?i wdt:P625 [] }");
};
const batches = [];
pick.forEach((w) => {
  const last = batches[batches.length - 1];
  if (last && last.n + w.n <= 600 && !NAMED[w.id]) { last.ids.push("wd:" + w.id); last.n += w.n; } else batches.push({ ids: ["wd:" + w.id], n: w.n });
});
const partL = [], memL = [], evL = [];
batches.forEach((bt) => {
  const vs = bt.ids.join(" ");
  partL.push(...links("wars-part", vs, "{ ?i wdt:P361 ?w } UNION { ?i wdt:P361 ?m. ?m wdt:P361 ?w }"));
  memL.push(...links("wars-mem", vs, "{ ?i wdt:P547 ?w } UNION { ?i wdt:P547 ?e. ?e wdt:P361 ?w }"));
});
/* the significant-event walk down a war's parts is asked one war at a time (in a batch it runs past the time limit) */
pick.forEach((w) => { evL.push(...links("wars-ev", "wd:" + w.id, "?e wdt:P361* ?w. ?i wdt:P793 ?e.")); });
const cemL = sparqlFile("wars-cem", "SELECT DISTINCT ?i ?w WHERE { VALUES ?t { wd:Q1241568 wd:Q1707610 wd:Q91122 wd:Q328468 } ?i wdt:P31 ?t; wdt:P625 []. OPTIONAL{?i wdt:P547 ?w} }");
const facts = {};
const all = Object.keys([].concat(partL, memL, cemL, evL).reduce((o, b) => { o[qid(v(b, "i"))] = 1; return o; }, {}));
for (let i = 0; i < all.length; i += 300) {
  const items = all.slice(i, i + 300).map((q) => { return "wd:" + q; }).join(" ");
  sparqlFile("wars-facts-" + tagOf(FACTS + items), FACTS.replace("ITEMS", items)).forEach((b) => { (facts[qid(v(b, "i"))] = facts[qid(v(b, "i"))] || []).push(b); });
}
/* each war link joined to the facts rows of its place */
const join = (L) => {
  const out = [];
  L.forEach((l) => { (facts[qid(v(l, "i"))] || []).forEach((b) => { out.push(Object.assign({ w: l.w }, b)); }); });
  return out;
};
const part = join(partL), mem = join(memL), cem = join(cemL);
/* places whose significant event (P793) is part of a war, such as the D-Day beaches: only battlefields, beaches and military
 * places, not the towns and ships an event happened at */
const EV_TYPE = /beach|battlefield|landing|bunker|fort|memorial|cemetery|camp|airfield|military|monument/i;
const EV_NOT = /city|town|settlement|municipality|village|state|country|ship|submarine|island|district|capital/i;
const evOk = {};
join(evL).forEach((b) => {
  const o = evOk[qid(v(b, "i"))] || (evOk[qid(v(b, "i"))] = { ok: false, no: false });
  if (EV_TYPE.test(v(b, "kL"))) o.ok = true;
  if (EV_NOT.test(v(b, "kL"))) o.no = true;
});
const ev = join(evL).filter((b) => { const o = evOk[qid(v(b, "i"))]; return o.ok && !o.no; });
/* kind from the Wikidata type and name */
const BATTLE = new RegExp("battle|siege|offensive|operation|campaign|raid|skirmish|engagement|attack|assault|bombing|invasion|naval|" +
  "uprising|ambush|military action|combat|conflict|war|massacre|front");
const kindOf = (types, name, memorial) => {
  const t = types.join("|").toLowerCase(), n = String(name).toLowerCase();
  if (/cemetery|graveyard|war grave/.test(t)) return "cemetery";
  if (memorial || /memorial|monument|statue|plaque|cenotaph|obelisk/.test(t)) return "memorial";
  if (/amphibious|landing|beach/.test(t) || /landing|d-day/.test(n)) return "landing";
  if (/bunker|fort|castle|citadel|redoubt|battery|blockhouse|bastion|defen[cs]e line|pillbox|casemate/.test(t)) return "fort";
  if (BATTLE.test(t)) return "battle";
  return "site";
};
const by = {};
const order = {};
pick.forEach((w, i) => { order[w.id] = i; });
const take = (rows, memorial) => {
  const g = {};
  rows.forEach((b) => {
    const id = qid(v(b, "i")), m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(v(b, "c")), name = v(b, "iL");
    if (!m || /^Q\d+$/.test(name)) return;
    const x = g[id] || (g[id] = { id: id, lat: r5(+m[2]), lon: r5(+m[1]), name: name, types: [], wars: {}, y: null, inc: null, co: v(b, "coL"),
      wiki: v(b, "w2").replace("https://en.wikipedia.org/wiki/", "") });
    if (v(b, "kL") && x.types.indexOf(v(b, "kL")) < 0) x.types.push(v(b, "kL"));
    if (v(b, "w")) x.wars[qid(v(b, "w"))] = 1;
    const y = yr(v(b, "d")) != null ? yr(v(b, "d")) : yr(v(b, "d2"));
    if (y != null) x.y = y;
    if (yr(v(b, "inc")) != null) x.inc = yr(v(b, "inc"));
  });
  Object.values(g).forEach((x) => {
    if (by[x.id]) return;
    let w = Object.keys(x.wars).filter((q) => { return order[q] != null; }).sort((a, b) => { return order[a] - order[b]; })[0];
    const k = kindOf(x.types, x.name, memorial);
    if (!w && memorial === null) {
      if (x.types.some((t) => { return /Nazi concentration camp/i.test(t); })) w = "Q362";
      else if (x.inc != null) w = Object.keys(NAMED).filter((q) => { return wars[q] && x.inc >= wars[q].s && x.inc <= wars[q].e; })[0];
    }
    if (!w) return;
    by[x.id] = { war: w, lat: x.lat, lon: x.lon, code: k, row: [cut(x.name, 90), cut(x.types[0] || "", 50), x.y != null ? String(x.y) : x.inc != null ? String(x.inc) : "",
      cut(x.co, 40), x.id, x.wiki, wars[w].name] };
  });
};
take(part, false);
take(ev, false);
take(mem, true);
take(cem, null);
/* a place already on Heritage & ancient sites stays there (each place on one layer only) */
const HIST = (() => {
  const meta = JSON.parse(fs.readFileSync(path.join(OUT, "history.p.json"), "utf8")), qc = meta.cols.split(",").indexOf("qid"), s = {};
  fs.readdirSync(OUT).filter((f) => { return /^history\.d\d+\.json$/.test(f); }).forEach((f) => {
    JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")).forEach((r) => { s[r[qc]] = 1; });
  });
  return s;
})();
Object.keys(by).forEach((id) => { if (HIST[id]) delete by[id]; });
/* wars left with too few places, or part of a war already kept, hand theirs to no one */
const count = {};
Object.values(by).forEach((p) => { count[p.war] = (count[p.war] || 0) + 1; });
const kept = {};
pick.forEach((w) => {
  if (NAMED[w.id] || ASKED.indexOf(w.id) >= 0 || (count[w.id] >= MIN && !Object.keys(w.up).some((u) => { return kept[u]; }))) kept[w.id] = 1;
});
const rowOf = (w) => {
  if (NAMED[w.id]) return NAMED[w.id];
  if (/national liberation|independence|revolution/i.test(w.ty + " " + w.name)) return "indep";
  if (/civil war|chouannerie|vend[ée]e/i.test(w.ty + " " + w.name)) return "civil";
  if (/colonial|frontier|indian wars|boer|zulu|sioux|opium|apache|maori|anglo-.*(afghan|burmese|sikh|maratha|mysore|ashanti)/i.test(w.ty + " " + w.name)) return "colonial";
  return w.s != null && w.s < 1800 ? "early" : "modern";
};
const out = {};
ROWS.forEach((r) => { out[r] = []; });
Object.values(by).forEach((p) => { if (kept[p.war]) out[rowOf(wars[p.war])].push(p); });
const report = pick.filter((w) => { return kept[w.id]; }).map((w) => { return [w.id, w.name, w.s, w.e, rowOf(w), count[w.id] || 0]; });
fs.writeFileSync(path.join(CACHE, "wars-report.json"), JSON.stringify(report, null, 1));
ROWS.forEach((r) => { console.log(r, JSON.stringify(split(path.join(OUT, "wars-" + r), out[r], "name,kind,year,country,qid,wiki,war"))); });
