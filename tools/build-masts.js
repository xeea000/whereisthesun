// workspace/whereisthesun/tools/build-masts.js
/* SUNNY opt102 tall masts and towers, merged from free keyless sources and de-duplicated (~400 m):
 *   Wikidata (CC0)  radio masts, guyed masts, TV towers, communication towers, transmitter stations (P2048 height)
 *   OSM (ODbL)      man_made=mast|tower + tower:type communication/broadcast with height >= 100 m (Overpass JSON file)
 *   FCC ASR         United States antenna structure registrations (public domain, r_tower.zip), constructed, >= 150 m
 * Wikidata wins (names), then OSM, then FCC; missing height, year and operator are filled from the others.
 * Writes data/world/masts.p.json + shards; the point code is the height bucket "h<m>" so dots scale by height
 * without loading details.
 * opt105: becomes the Towers layer. FCC ASR down to 60 m (most cell towers). Code is type letter + height bucket,
 * b = TV/radio broadcast, c = cell/LTE, m = microwave and utility, o = other (types guessed from owner names).
 * 150 m+ and all non-FCC go to masts.p.json (all zooms); the rest go to towers-t/<lat>_<lon> 10 degree tiles, fetched in view.
 * Usage: node tools/build-masts.js <fcc dir with RA/CO/EN.dat> [overpass.json] */
const fs = require("fs");
const path = require("path");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const COLS = "name,kind,height,year,operator,country,src,ref,wiki";
const sparql = async (q) => {
  const r = await fetch("https://query.wikidata.org/sparql?format=json", { method: "POST", body: "query=" + encodeURIComponent(q),
    headers: { "User-Agent": "SunnyBuild/1.0 (github.com/xeea000/whereisthesun)", "Content-Type": "application/x-www-form-urlencoded" } });
  if (!r.ok) throw new Error("wikidata " + r.status);
  return (await r.json()).results.bindings;
};
const v = (b, k) => { return b[k] ? b[k].value : ""; };
const pt = (s) => { const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(s); return m ? [+m[2], +m[1]] : null; };
const wikidata = async () => {
  const cls = "wd:Q1068623 wd:Q5622819 wd:Q11166728 wd:Q1798641 wd:Q5367899";
  const sub = (await sparql("SELECT DISTINCT ?s WHERE { VALUES ?k {" + cls + "} ?s wdt:P279* ?k }")).map((b) => { return "wd:" + v(b, "s").split("/").pop(); });
  const rows = await sparql("SELECT ?i ?iL ?c ?kL ?inc ?h ?opL ?coL ?w ?end WHERE { VALUES ?k {" + sub.join(" ") + "} ?i wdt:P31 ?k; wdt:P625 ?c." +
    " OPTIONAL{?i wdt:P571 ?inc} OPTIONAL{?i p:P2048/psn:P2048/wikibase:quantityAmount ?h} OPTIONAL{?i wdt:P137 ?op} OPTIONAL{?i wdt:P17 ?co}" +
    " OPTIONAL{?i wdt:P576 ?end} OPTIONAL{?w schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>}" +
    " SERVICE wikibase:label { bd:serviceParam wikibase:language \"en,mul,fr,de,es,it,pl,nl,ru\". ?i rdfs:label ?iL. ?k rdfs:label ?kL. ?op rdfs:label ?opL." +
    " ?co rdfs:label ?coL } }");
  const by = {};
  rows.forEach((b) => {
    const id = v(b, "i").split("/").pop(), p = pt(v(b, "c"));
    if (!p || v(b, "end")) return;
    const h = v(b, "h") !== "" ? Math.round(+v(b, "h")) : "";
    if (by[id]) { if (h !== "" && (by[id].height === "" || h > by[id].height)) by[id].height = h; return; }
    const name = /^Q\d+$/.test(v(b, "iL")) ? "" : v(b, "iL");
    const m = /^(-?\d+)-/.exec(v(b, "inc"));
    by[id] = { lat: p[0], lon: p[1], name: name, kind: v(b, "kL"), height: h, year: m ? +m[1] : "", operator: v(b, "opL"), country: v(b, "coL"),
      src: "wd", ref: id, wiki: v(b, "w").replace("https://en.wikipedia.org/wiki/", "") };
  });
  return Object.values(by);
};
const osm = (f) => {
  if (!f || !fs.existsSync(f)) return [];
  return JSON.parse(fs.readFileSync(f, "utf8")).elements.map((e) => {
    const t = e.tags || {}, lat = e.lat != null ? e.lat : e.center && e.center.lat, lon = e.lon != null ? e.lon : e.center && e.center.lon;
    const h = parseFloat(String(t.height || "").replace(",", "."));
    if (lat == null || !(h >= 100) || h > 700) return null;
    const m = /^(\d{4})/.exec(t.start_date || "");
    const kind = (t["tower:construction"] ? t["tower:construction"] + " " : "") + (t.man_made === "mast" ? "mast" : "tower");
    return { lat: lat, lon: lon, name: t.name || t["name:en"] || "", kind: kind,
      height: Math.round(h), year: m ? +m[1] : "", operator: t.operator || t.owner || "", country: "", src: "osm", ref: e.type + "/" + e.id, wiki: "" };
  }).filter(Boolean);
};
const KIND = { TOWER: "tower", GTOWER: "guyed tower", LTOWER: "lattice tower", MTOWER: "monopole", MAST: "mast", BTWR: "tower", "2TOWER": "towers" };
const title = (s) => { return s.replace(/\b\w+/g, (w) => { return w[0] + w.slice(1).toLowerCase(); }); };
const fcc = (dir) => {
  if (!dir || !fs.existsSync(path.join(dir, "RA.dat"))) return [];
  const rd = (f, fn) => { fs.readFileSync(path.join(dir, f), "latin1").split(/\r?\n/).forEach((l) => { if (l) fn(l.split("|")); }); };
  const ra = {};
  rd("RA.dat", (c) => {
    const h = +c[30], ty = c[32];
    if (!(h >= 60) || c[13] || c[15] !== "C" || c[5] === "CA" || c[5] === "DI") return;
    if (!KIND[ty] && !/^\d+G?L?TA\d+$/.test(ty)) return;
    ra[c[4]] = { height: Math.round(h), kind: KIND[ty] || "tower array", year: (/\/(\d{4})$/.exec(c[12]) || [])[1] || "", reg: c[3], city: c[24], st: c[25] };
  });
  const own = {};
  rd("EN.dat", (c) => { if (ra[c[4]] && c[5] === "O") own[c[4]] = c[9]; });
  const out = [];
  rd("CO.dat", (c) => {
    const r = ra[c[4]];
    if (!r || r.done || c[5] !== "T") return;
    const dms = (d, m, s, h) => { return ((+d) + (+m) / 60 + (+s) / 3600) * (h === "S" || h === "W" ? -1 : 1); };
    const lat = dms(c[6], c[7], c[8], c[9]), lon = dms(c[11], c[12], c[13], c[14]);
    if (!lat || !lon) return;
    r.done = 1;
    out.push({ lat: lat, lon: lon, name: "", kind: r.kind, height: r.height, year: r.year ? +r.year : "", operator: own[c[4]] || "",
      country: "United States" + (r.city ? " (near " + title(r.city) + ", " + r.st + ")" : ""), src: "fcc", ref: r.reg + ":" + c[4], wiki: "" });
  });
  return out;
};
const CELL = new RegExp("american tower|crown castle|sba |sba,|vertical bridge|verizon|cellco|at&t|cingular|t-mobile|sprint|cellular|wireless|pcs|" +
  "diamond comm|insite|tillman|horvath|phoenix tower|mobilitie|towerco|united states cellular", "i");
const BCAST = new RegExp("broadcast|television|\\btv\\b|radio|media|iheart|sinclair|nexstar|tegna|gray |cumulus|entercom|audacy|salem|" +
  "public|educational|university|church|ministr|^k[a-z]{2,3}\\b|^w[a-z]{2,3}\\b", "i");
const MICRO = /electric|power|energy|utilit|railroad|railway|pipeline|gas |oil|transmission|county|city of|state of|department|authority|district|cooperative|co-op/i;
const typeOf = (s) => {
  if (s.src !== "fcc") return /cell|mobile|telecommunication|communication/i.test(s.kind) && !/tv|radio|broadcast|transmitter/i.test(s.kind) ? "o" : "b";
  const o = s.operator || "";
  return CELL.test(o) ? "c" : BCAST.test(o) ? "b" : MICRO.test(o) ? "m" : s.height >= 300 ? "b" : "o";
};
const main = async () => {
  const w = await wikidata(), o = osm(process.argv[3]), f = fcc(process.argv[2]);
  console.log("wikidata", w.length, "osm", o.length, "fcc", f.length);
  const cell = {}, keep = [];
  const key = (a, b) => { return Math.round(a * 250) + ":" + Math.round(b * 250); };
  const near = (s) => {
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
      const l = cell[(Math.round(s.lat * 250) + da) + ":" + (Math.round(s.lon * 250) + db)] || [];
      for (const t of l) if (Math.abs(t.lat - s.lat) < 0.004 && Math.abs(t.lon - s.lon) < 0.004 / Math.max(0.1, Math.cos(s.lat * Math.PI / 180))) return t;
    }
    return null;
  };
  let dup = 0;
  w.concat(o, f).forEach((s) => {
    const t = near(s);
    if (t) {
      dup++;
      ["name", "height", "year", "operator"].forEach((k) => { if (t[k] === "" && s[k] !== "") t[k] = s[k]; });
      if (!/\(near/.test(t.country) && /\(near/.test(s.country)) t.country = s.country;
      return;
    }
    (cell[key(s.lat, s.lon)] = cell[key(s.lat, s.lon)] || []).push(s);
    keep.push(s);
  });
  const b = (h) => { return h === "" ? 0 : h < 400 ? Math.floor(h / 25) * 25 : Math.min(700, Math.floor(h / 50) * 50); };
  const rowOf = (s) => { return COLS.split(",").map((k) => { return s[k] == null ? "" : s[k]; }); };
  const it = (s) => { return { lat: s.lat, lon: s.lon, code: typeOf(s) + b(s.height), row: rowOf(s) }; };
  const big = keep.filter((s) => { return s.src !== "fcc" || s.height >= 150; });
  const r = split(path.join(OUT, "masts"), big.map(it), COLS, 200);
  const tiles = {}, TD = path.join(OUT, "towers-t");
  keep.filter((s) => { return big.indexOf(s) < 0; }).forEach((s) => { const k = Math.floor(s.lat / 10) * 10 + "_" + Math.floor(s.lon / 10) * 10; (tiles[k] = tiles[k] ||
    []).push(it(s)); });
  if (fs.existsSync(TD)) fs.rmSync(TD, { recursive: true });
  const tsum = { n: 0, gz: 0, dgz: 0, tiles: Object.keys(tiles) };
  Object.keys(tiles).forEach((k) => { const q = split(path.join(TD, k, "t"), tiles[k], COLS, 200); tsum.n += q.n; tsum.gz += q.gz; tsum.dgz += q.dgz; });
  const types = {}; keep.forEach((s) => { const t = typeOf(s); types[t] = (types[t] || 0) + 1; });
  console.log("merged", keep.length, "duplicates", dup, JSON.stringify(r), "tiles", JSON.stringify(tsum), JSON.stringify(types));
  const mf = path.join(OUT, "manifest.json"), man = JSON.parse(fs.readFileSync(mf, "utf8"));
  man.files.masts = r; man.towerTiles = tsum.tiles; man.masts = { types: types, built: new Date().toISOString().slice(0, 10), wikidata: w.length, osm: o.length, fcc: f.length };
  fs.writeFileSync(mf, JSON.stringify(man));
};
main().catch((e) => { console.error(e); process.exit(1); });
