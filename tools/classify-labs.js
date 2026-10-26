// workspace/whereisthesun/tools/classify-labs.js
/* SUNNY labs by field. Reads data/world/labs.*, asks Wikidata (CC0) for each lab's field of work (P101),
 * and sorts every lab into one class from its field, its Wikidata type and its name. Labs that match
 * nothing stay in "other". Rewrites data/world/labs.* with the class as the point code.
 * Usage: node tools/classify-labs.js */
const path = require("path");
const fs = require("fs");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const COLS = "name,kind,year,operator,country,qid,wiki,links,field";
const CLASSES = [
  ["mil", new RegExp("military|defen[cs]e|weapon|armed forces|army|naval|air force|missile|nuclear weapon", "i")],
  ["agri", new RegExp("agricult|agronom|crop|farm|livestock|veterinar|horticult|forest|fisher|soil|food|dairy|plant breed|rice|wheat|seed|" +
    "poultry|viticult|fruit|experimental range|experiment station", "i")],
  ["rel", new RegExp("relig|theolog|\\bislam|christ|bibl|church|buddh|hindu|jewish|judai|humanit|histor|philosoph|literat|linguist|languag|" +
    "archaeolog|art\\b|arts\\b|music|\\bcultur|byzant|pluralism|genocide|catholic|gandhi|museum|conservation|architect|louvre", "i")],
  ["life", new RegExp("medic|health|biolog|bioscien|biomed|genet|genom|cancer|oncolog|neuro|immun|virus|virolog|disease|clinic|patholog|pharma|" +
    "epidemiol|life scien|zoolog|botan|ecolog|marine biol|microbio|protein|cell|brain|vaccin|hospital|infect|malaria|" +
    "biodivers|pasteur|butantan|broad institute|médic|biolog|pathogen|thérap|psyched|primate", "i")],
  ["earth", new RegExp("geolog|geophys|earth|climat|meteorolog|weather|ocean|marine|atmospher|seismo|volcan|glaci|polar|hydrolog|environment|" +
    "water|limnolog|geograph|ecosystem|grassland|desert|usgs", "i")],
  ["space", new RegExp("physic|astronom|astrophys|space|cosmolog|nuclear|particle|quantum|optic|laser|plasma|fusion|planet|aerospace|aeronaut|" +
    "rocket|physique|reactor|lunar|balloon|telescop|accelerat|radiat", "i")],
  ["chem", new RegExp("chemi|material|polymer|metallurg|cataly|ceramic|nanotech|nanosci|crystal|chimie|química", "i")],
  ["eng", new RegExp("engineer|technolog|comput|informat|software|electron|electric|robot|telecom|mechanic|energy|automat|artificial intellig|" +
    "mathemat|data|transport|semiconductor|industr|construct|science park|innovation|technopark|mécanique|battlelab|" +
    "science city|hi-tech|naukograd", "i")],
  ["soc", new RegExp("social|econom|sociolog|polit|psycholog|educat|law|legal|demograph|statist|public policy|management|business|finance|" +
    "anthropolog|urban|studies|labour|globalis|society|philanthrop|rights|europe", "i")]
];
const sparql = async (q) => {
  const u = "https://query.wikidata.org/sparql?format=json";
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(u, { method: "POST", body: "query=" + encodeURIComponent(q),
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SunnyBuild/1.0 (github.com/xeea000/whereisthesun)" } });
      if (r.ok) return (await r.json()).results.bindings;
      console.error("wikidata", r.status);
    } catch (e) { console.error(e.message); }
    await new Promise((res) => { setTimeout(res, 5000); });
  }
  throw new Error("wikidata failed");
};
const read = () => {
  const p = JSON.parse(fs.readFileSync(path.join(OUT, "labs.p.json"), "utf8"));
  const cols = p.cols.split(","), items = [];
  let a = 0, o = 0;
  for (let i = 0; i < p.n; i++) {
    a += p.lat[i]; o += p.lon[i];
    const row = JSON.parse(fs.readFileSync(path.join(OUT, "labs.d" + Math.floor(i / p.S) + ".json"), "utf8"))[i % p.S];
    const r = {};
    cols.forEach((k, j) => { r[k] = row[j]; });
    items.push({ lat: a / 1e5, lon: o / 1e5, r: r });
  }
  return items;
};
const main = async () => {
  const items = read(), field = {};
  for (let i = 0; i < items.length; i += 300) {
    const ids = items.slice(i, i + 300).map((it) => { return "wd:" + it.r.qid; }).join(" ");
    (await sparql("SELECT ?i ?fL WHERE { VALUES ?i { " + ids + " } ?i wdt:P101 ?f. ?f rdfs:label ?fL. FILTER(LANG(?fL) = \"en\") }")).forEach((b) => {
      const q = b.i.value.split("/").pop();
      field[q] = (field[q] ? field[q] + "; " : "") + b.fL.value;
    });
  }
  const count = {};
  const out = items.map((it) => {
    const r = it.r;
    r.field = field[r.qid] || "";
    const tests = [r.field, r.kind, r.name];
    let code = "other";
    for (const t of tests) {
      const hit = CLASSES.find((c) => { return t && c[1].test(t); });
      if (hit) { code = hit[0]; break; }
    }
    count[code] = (count[code] || 0) + 1;
    return { lat: it.lat, lon: it.lon, code: code, row: COLS.split(",").map((k) => { return r[k]; }) };
  });
  const man = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
  man.files.labs = split(path.join(OUT, "labs"), out, COLS, 150);
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(man));
  console.log(items.length, "with field", Object.keys(field).length, JSON.stringify(count));
};
main().catch((e) => { console.error(e); process.exit(1); });
