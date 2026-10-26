// workspace/whereisthesun/tools/build-science.js
/* SUNNY opt111 Science layers, from Wikidata (CC0), free and keyless.
 *   accelerators  particle accelerators (Q130825 and subclasses) plus the big accelerator labs
 *   labs          laboratories, research centres, and research institutes (direct class) with 5+ Wikipedia articles
 * Writes data/world/accelerators.* and data/world/labs.* (tools/split-points.js).
 * Usage: node tools/build-science.js */
const path = require("path");
const fs = require("fs");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const COLS = "name,kind,year,operator,country,qid,wiki,links";
const sparql = async (q) => {
  const u = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q);
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": "SunnyBuild/1.0 (github.com/xeea000/whereisthesun)" } });
      if (r.ok) return (await r.json()).results.bindings;
      console.error("wikidata", r.status);
    } catch (e) { console.error(e.message); }
  }
  throw new Error("wikidata failed");
};
const v = (b, k) => { return b[k] ? b[k].value : ""; };
const pt = (s) => { const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(s); return m ? [+m[2], +m[1]] : null; };
const q = (where, min) => {
  return "SELECT ?i ?iL ?c ?kL ?inc ?opL ?coL ?w ?s WHERE { " + where + " ?i wdt:P625 ?c; wikibase:sitelinks ?s. FILTER(?s >= " + min + ")" +
    " OPTIONAL{?i wdt:P571 ?inc} OPTIONAL{?i wdt:P137 ?op} OPTIONAL{?i wdt:P17 ?co}" +
    " OPTIONAL{?w schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>}" +
    " SERVICE wikibase:label { bd:serviceParam wikibase:language \"en,mul\". ?i rdfs:label ?iL. ?k rdfs:label ?kL. ?op rdfs:label ?opL. ?co rdfs:label ?coL } }";
};
const rows = async (where, min, code, by) => {
  (await sparql(q(where, min))).forEach((b) => {
    const id = v(b, "i").split("/").pop(), p = pt(v(b, "c")), name = v(b, "iL");
    if (!p || by[id] || /^Q\d+$/.test(name)) return;
    const y = /^(-?\d+)-/.exec(v(b, "inc"));
    by[id] = { lat: p[0], lon: p[1], code: code, name: name, kind: v(b, "kL"), year: y ? +y[1] : "", operator: v(b, "opL"), country: v(b, "coL"),
      qid: id, wiki: v(b, "w").replace("https://en.wikipedia.org/wiki/", ""), links: +v(b, "s") };
  });
};
const write = (name, by) => {
  const items = Object.values(by);
  const r = split(path.join(OUT, name), items.map((s) => { return { lat: s.lat, lon: s.lon, code: s.code, row: COLS.split(",").map((k) => { return s[k]; }) }; }), COLS, 150);
  console.log(name, items.length, JSON.stringify(r));
  return r;
};
const main = async () => {
  const acc = {};
  /* the big accelerator labs first (KEK has no coordinates in Wikidata, so it is added by hand) */
  await rows("VALUES ?i { wd:Q42944 wd:Q337641 wd:Q585777 wd:Q915217 wd:Q311801 wd:Q1412284 } VALUES ?k { wd:Q130825 }", 0, "lab", acc);
  Object.values(acc).forEach((a) => { a.kind = "accelerator laboratory"; });
  acc.Q372028 = { lat: 36.1486, lon: 140.0756, code: "lab", name: "KEK", kind: "high energy accelerator research organization", year: 1971,
    operator: "", country: "Japan", qid: "Q372028", wiki: "KEK", links: 10 };
  await rows("?i wdt:P31/wdt:P279* wd:Q130825; wdt:P31 ?k.", 0, "acc", acc);
  const labs = {};
  const sub = (await sparql("SELECT DISTINCT ?s WHERE { VALUES ?k0 { wd:Q483242 wd:Q7315155 } ?s wdt:P279* ?k0 }")).map((b) => { return "wd:" + v(b, "s").split("/").pop(); });
  console.error("lab classes", sub.length);
  for (let i = 0; i < sub.length; i += 150) await rows("VALUES ?k { " + sub.slice(i, i + 150).join(" ") + " } ?i wdt:P31 ?k.", 0, "lab", labs);
  await rows("VALUES ?k { wd:Q31855 wd:Q1371849 wd:Q1664720 } ?i wdt:P31 ?k.", 5, "inst", labs);
  Object.keys(acc).forEach((k) => { delete labs[k]; });
  const man = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
  man.files.accelerators = write("accelerators", acc);
  man.files.labs = write("labs", labs);
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(man));
};
main().catch((e) => { console.error(e); process.exit(1); });
