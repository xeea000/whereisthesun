// workspace/whereisthesun/tools/build-history.js
/* SUNNY opt120 History layer, from Wikidata (CC0), free and keyless. Each place is kept once, in the first group that claims it:
 *   wonder  the Seven Wonders of the Ancient World at their original sites (hand-placed; most are gone)
 *   new7    the New 7 Wonders of the World
 *   whs     UNESCO World Heritage Sites
 *   temple  temples and shrines older than 800 years (churches are left out)
 *   c200 c500 c1000 c1500 cold  castles and forts by age: under 200, 201-500, 501-1000, 1001-1500, over 1500 years, cnone age not known
 *   site    other ancient and archaeological sites with 8+ Wikipedia articles
 * Writes data/world/history.* (tools/split-points.js). Usage: node tools/build-history.js */
const path = require("path");
const fs = require("fs");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const COLS = "name,kind,year,country,qid,wiki";
const NOW = new Date().getFullYear();
const sparql = async (q) => {
  const u = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q);
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": "SunnyBuild/1.0 (github.com/xeea000/whereisthesun)" } });
      if (r.ok) return (await r.json()).results.bindings;
      console.error("wikidata", r.status);
    } catch (e) { console.error(e.message); }
    await new Promise((s) => { setTimeout(s, 5000); });
  }
  throw new Error("wikidata failed");
};
const v = (b, k) => { return b[k] ? b[k].value : ""; };
const pt = (s) => { const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(s); return m ? [+m[2], +m[1]] : null; };
const q = (where, min) => {
  return "SELECT ?i ?iL ?c ?kL ?inc ?coL ?w WHERE { " + where + " ?i wdt:P625 ?c; wikibase:sitelinks ?s. FILTER(?s >= " + min + ")" +
    " OPTIONAL{?i wdt:P571 ?inc} OPTIONAL{?i wdt:P17 ?co}" +
    " OPTIONAL{?w schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>}" +
    " SERVICE wikibase:label { bd:serviceParam wikibase:language \"en,mul\". ?i rdfs:label ?iL. ?k rdfs:label ?kL. ?co rdfs:label ?coL } }";
};
const by = {};
const rows = async (where, min, code) => {
  let n = 0;
  (await sparql(q(where, min))).forEach((b) => {
    const id = v(b, "i").split("/").pop(), p = pt(v(b, "c")), name = v(b, "iL");
    if (!p || /^Q\d+$/.test(name)) return;
    const y = /^(-?\d+)-/.exec(v(b, "inc")), yr = y ? +y[1] : "";
    if (by[id]) { if (by[id].year === "" && yr !== "") by[id].year = yr; return; }
    const c = typeof code === "function" ? code(yr) : code;
    if (!c) return;
    by[id] = { lat: +p[0].toFixed(4), lon: +p[1].toFixed(4), code: c, name: name, kind: v(b, "kL"), year: yr, country: v(b, "coL"),
      qid: id, wiki: v(b, "w").replace("https://en.wikipedia.org/wiki/", "") };
    n++;
  });
  return n;
};
const subs = async (roots, not) => {
  const nq = not ? " MINUS { ?s wdt:P279* wd:" + not + " }" : "";
  return (await sparql("SELECT DISTINCT ?s WHERE { VALUES ?k0 { " + roots.map((r) => { return "wd:" + r; }).join(" ") + " } ?s wdt:P279* ?k0." + nq + " }"))
    .map((b) => { return "wd:" + v(b, "s").split("/").pop(); });
};
const batched = async (cls, extra, min, code) => {
  let n = 0;
  for (let i = 0; i < cls.length; i += 120) n += await rows("VALUES ?k { " + cls.slice(i, i + 120).join(" ") + " } ?i wdt:P31 ?k. " + extra, min, code);
  return n;
};
const band = (y) => {
  if (y === "") return "cnone";
  const a = NOW - y;
  return a <= 200 ? "c200" : a <= 500 ? "c500" : a <= 1000 ? "c1000" : a <= 1500 ? "c1500" : "cold";
};
const ANCIENT = [["Great Pyramid of Giza", 29.9792, 31.1342, -2560, "Egypt", "Q37200"], ["Hanging Gardens of Babylon", 32.5355, 44.4275, -600, "Iraq", "Q41521"],
  ["Temple of Artemis", 37.9497, 27.3639, -550, "Turkey", "Q5869"], ["Statue of Zeus at Olympia", 37.6379, 21.63, -435, "Greece", "Q2513"],
  ["Mausoleum at Halicarnassus", 37.0379, 27.4241, -351, "Turkey", "Q7004"], ["Colossus of Rhodes", 36.451, 28.2278, -280, "Greece", "Q42479"],
  ["Lighthouse of Alexandria", 31.214, 29.8856, -280, "Egypt", "Q43473"]];
const main = async () => {
  ANCIENT.forEach((a) => {
    by[a[5]] = { lat: a[1], lon: a[2], code: "wonder", name: a[0], kind: "Seven Wonders of the Ancient World", year: a[3], country: a[4], qid: a[5], wiki: a[0].replace(/ /g, "_") };
  });
  console.error("new7", await rows("VALUES ?i { wd:Q12501 wd:Q5788 wd:Q79961 wd:Q676203 wd:Q5823 wd:Q10285 wd:Q9141 } ?i wdt:P31 ?k.", 0, "new7"));
  Object.values(by).filter((b) => { return b.code === "new7"; }).forEach((b) => { b.kind = "New 7 Wonders of the World"; });
  console.error("whs", await rows("?i wdt:P1435 wd:Q9259. OPTIONAL{?i wdt:P31 ?k}", 0, "whs"));
  Object.values(by).filter((b) => { return b.code === "whs"; }).forEach((b) => { b.kind = "UNESCO World Heritage Site"; });
  const tcls = await subs(["Q44539", "Q697295", "Q5393308"], "Q16970");
  console.error("temple classes", tcls.length);
  console.error("temples", await batched(tcls, "?i wdt:P571 ?y0. FILTER(YEAR(?y0) <= " + (NOW - 800) + ")", 3, "temple"));
  const ccls = await subs(["Q23413", "Q1785071", "Q57831"]);
  console.error("castle classes", ccls.length);
  console.error("castles", await batched(ccls, "", 5, band));
  const scls = await subs(["Q839954", "Q15661340"]);
  console.error("site classes", scls.length);
  console.error("sites", await batched(scls, "", 8, "site"));
  const items = Object.values(by);
  const c = {};
  items.forEach((s) => { c[s.code] = (c[s.code] || 0) + 1; });
  const man = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
  const pts = items.map((s) => { return { lat: s.lat, lon: s.lon, code: s.code, row: COLS.split(",").map((k) => { return s[k]; }) }; });
  man.files.history = split(path.join(OUT, "history"), pts, COLS, 150);
  console.log("history", items.length, JSON.stringify(c), JSON.stringify(man.files.history));
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(man));
};
main().catch((e) => { console.error(e); process.exit(1); });
