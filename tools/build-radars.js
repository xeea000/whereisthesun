// workspace/whereisthesun/tools/build-radars.js
/* SUNNY opt212: rebuild radar/radarm rows inside data/world/transmission.*
 * Keeps masts + radio telescopes from the current pack; replaces radar kids.
 * Sources (all free/keyless): Wikidata radar station / military radar station / weather radar;
 * Environment Canada CanRAD list (Wikipedia coords); North Warning System active sites
 * (Wikipedia); OpenStreetMap Canada radar towers (tower:type=radar etc.).
 * Usage: node tools/build-radars.js
 * Does NOT invent CFB radars — only sites with a real source. */
const fs = require("fs");
const path = require("path");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const COLS = "name,kind,year,height,depth,operator,country,qid,wiki";
const BASE = path.join(OUT, "transmission");
const sparql = async (q) => {
  const r = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q), {
    headers: { "User-Agent": "SunnyBuild/1.0 (github.com/xeea000/whereisthesun)" }
  });
  if (!r.ok) throw new Error("wikidata " + r.status);
  return (await r.json()).results.bindings;
};
const v = (b, k) => { return b[k] ? b[k].value : ""; };
const yr = (s) => { const m = /^(-?\d+)-/.exec(s || ""); return m ? +m[1] : ""; };
const num = (s) => { return s === "" ? "" : Math.round(+s * 10) / 10; };
const pt = (s) => { const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(s); return m ? [+m[2], +m[1]] : null; };
const loadJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
/* Decode current transmission pack into items {lat,lon,code,row,src?} */
const loadExisting = () => {
  const meta = loadJson(BASE + ".p.json");
  const details = [];
  for (let k = 0; ; k++) {
    const f = BASE + ".d" + k + ".json";
    if (!fs.existsSync(f)) break;
    details.push.apply(details, loadJson(f));
  }
  const out = [];
  let a = 0, o = 0;
  for (let i = 0; i < meta.n; i++) {
    a += meta.lat[i]; o += meta.lon[i];
    const code = meta.codes[meta.c[i]];
    const row = details[i] || [];
    out.push({ lat: a / 1e5, lon: o / 1e5, code: code, row: row });
  }
  return out;
};
const wdRadars = async () => {
  /* Q89578131 radar station; Q133288241 military radar station; Q863343 weather radar.
   * (Q1094622 is a Scottish settlement and is not a radar class.) */
  const classes = ["Q89578131", "Q133288241", "Q863343"];
  const q = "SELECT ?i ?iL ?c ?kL ?inc ?h ?d ?el ?opL ?coL ?w WHERE { VALUES ?k {" +
    classes.map((c) => "wd:" + c).join(" ") + "} " +
    "?i wdt:P31 ?k; wdt:P625 ?c. " +
    "OPTIONAL{?i wdt:P571 ?inc} OPTIONAL{?i p:P2048/psn:P2048/wikibase:quantityAmount ?h} " +
    "OPTIONAL{?i p:P4511/psn:P4511/wikibase:quantityAmount ?d} OPTIONAL{?i p:P2044/psn:P2044/wikibase:quantityAmount ?el} " +
    "OPTIONAL{?i wdt:P137 ?op} OPTIONAL{?i wdt:P17 ?co} " +
    "OPTIONAL{?w schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>} " +
    "SERVICE wikibase:label { bd:serviceParam wikibase:language \"en,mul\". ?i rdfs:label ?iL. ?k rdfs:label ?kL. ?op rdfs:label ?opL. ?co rdfs:label ?coL } }";
  let rows;
  for (let t = 0; t < 3 && !rows; t++) {
    try { rows = await sparql(q); } catch (e) { console.error("wd", e.message); }
  }
  if (!rows) throw new Error("wikidata radar query failed");
  const by = {};
  rows.forEach((b) => {
    const id = v(b, "i").split("/").pop();
    const p = pt(v(b, "c"));
    if (!p || by[id]) return;
    const name = v(b, "iL");
    if (/^Q\d+$/.test(name)) return;
    const d = v(b, "d") !== "" ? num(v(b, "d")) : (v(b, "el") !== "" && +v(b, "el") < 0 ? num(-v(b, "el")) : "");
    by[id] = {
      lat: p[0], lon: p[1], name: name, kind: v(b, "kL"), year: yr(v(b, "inc")),
      height: v(b, "h") !== "" ? num(v(b, "h")) : "", depth: d,
      operator: v(b, "opL"), country: v(b, "coL"), qid: id,
      wiki: v(b, "w").replace("https://en.wikipedia.org/wiki/", ""), src: "wd"
    };
  });
  console.error("wikidata radars", Object.keys(by).length);
  return Object.values(by);
};
const isMil = (s) => {
  /* ATC / NAV CANADA surveillance stays civil (Civil & weather kid). */
  if (s.nav_hint || /NAV CANADA|ATC |Primary Surveillance|Secondary Surveillance/i.test([s.name, s.operator, s.kind].join(" "))) return false;
  const t = [s.kind, s.name, s.operator].join(" ");
  if (/military|Texas Tower|North Warning|\bNWS\b|FPS-11|FPS-12|DEW Line|Pinetree|Air Station|\bCFS\b|NORAD/i.test(t)) return true;
  /* CFB in the name alone is not enough (e.g. EC weather radar near Cold Lake). */
  if (/\bCFB\b/i.test(t) && !/weather|meteorolog/i.test(t)) return true;
  if (s.src === "nws") return true;
  if (s.mil_hint) return true;
  return false;
};
const isWx = (s) => {
  const t = [s.kind, s.name, s.operator].join(" ");
  return /weather|meteorolog|météorolog|CanRAD|Environment and Climate Change|EC /i.test(t) || s.src === "canrad" || s.wx_hint;
};
const rowOf = (s) => COLS.split(",").map((k) => (s[k] == null ? "" : s[k]));
const near = (a, b, km) => {
  const dy = (a.lat - b.lat) * 111;
  const dx = (a.lon - b.lon) * 111 * Math.cos(a.lat * Math.PI / 180);
  return dy * dy + dx * dx <= km * km;
};
const prefer = (a, b) => {
  const rank = (s) => (s.src === "canrad" || s.src === "nws" ? 0 : s.src === "wd" ? 1 : 2);
  return rank(a) <= rank(b) ? a : b;
};
const dedupe = (list, km) => {
  const out = [];
  list.forEach((s) => {
    let hit = -1;
    for (let i = 0; i < out.length; i++) if (near(out[i], s, km)) { hit = i; break; }
    if (hit < 0) out.push(s);
    else {
      const keep = prefer(out[hit], s);
      const other = keep === out[hit] ? s : out[hit];
      /* military wins if either side is military */
      if (isMil(other) && !isMil(keep)) {
        keep.kind = other.kind.indexOf("military") >= 0 ? other.kind : "military radar station";
      }
      if (!keep.operator && other.operator) keep.operator = other.operator;
      if (!keep.qid && other.qid) keep.qid = other.qid;
      if (!keep.wiki && other.wiki) keep.wiki = other.wiki;
      out[hit] = keep;
    }
  });
  return out;
};
const main = async () => {
  const existing = loadExisting();
  const keep = existing.filter((it) => it.code !== "radar" && it.code !== "radarm");
  console.error("kept non-radar", keep.length, "dropped old radar", existing.length - keep.length);
  const wd = await wdRadars();
  const canrad = loadJson(path.join(__dirname, "radar-canrad.json"));
  const nws = loadJson(path.join(__dirname, "radar-nws.json"));
  const osm = loadJson(path.join(__dirname, "radar-osm-ca.json"));
  let radars = wd.concat(canrad, nws, osm);
  radars = dedupe(radars, 2.5);
  const items = radars.map((s) => {
    const mil = isMil(s);
    /* weather stays civil even if name mentions CFB Cold Lake weather radar — those are EC */
    const code = mil && !isWx(s) ? "radarm" : "radar";
    if (mil && !isWx(s) && !/military/i.test(s.kind)) s.kind = "military radar station";
    if (isWx(s) && !/weather/i.test(s.kind)) s.kind = "weather radar";
    return { lat: s.lat, lon: s.lon, code: code, row: rowOf(s), _s: s };
  });
  const civil = items.filter((i) => i.code === "radar").length;
  const mil = items.filter((i) => i.code === "radarm").length;
  console.error("radar civil", civil, "military", mil, "total", items.length);
  const caCivil = items.filter((i) => i.code === "radar" && i._s.country === "Canada").length;
  const caMil = items.filter((i) => {
    if (i.code !== "radarm") return false;
    if (i._s.country === "Canada") return true;
    const loc = i._s.location || i._s.country || "";
    return /Canada|Nunavut|NWT|Yukon|Labrador|Newfoundland|Quebec/i.test(loc);
  }).length;
  console.error("Canada civil", caCivil, "Canada-ish mil", caMil);
  const all = keep.concat(items.map((i) => ({ lat: i.lat, lon: i.lon, code: i.code, row: i.row })));
  const r = split(BASE, all, COLS, 150);
  console.log("transmission", JSON.stringify(r));
  const manPath = path.join(OUT, "manifest.json");
  const man = loadJson(manPath);
  man.files.transmission = r;
  man.built = new Date().toISOString().slice(0, 10);
  man.radar = { civil: civil, military: mil, canrad: canrad.length, nws: nws.length, osm: osm.length, wd: wd.length, built: man.built };
  fs.writeFileSync(manPath, JSON.stringify(man));
  console.error("manifest.radar", man.radar);
};
main().catch((e) => { console.error(e); process.exit(1); });
