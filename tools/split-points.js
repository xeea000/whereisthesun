// workspace/whereisthesun/tools/split-points.js
/* SUNNY progressive disclosure (opt96). Splits a point dataset into a tiny points file and small
 * detail shards. Points file <base>.p.json: {n, S, codes, cols, lat, lon, c} where lat and lon are
 * delta-encoded integers (1e-5 degrees) and c is an index into codes. Rows are sorted on a coarse
 * grid first so neighbouring dots share a shard. Detail shard <base>.d<k>.json holds rows
 * k*S .. k*S+S-1 as arrays in cols order. The phone loads only the points file for the view and
 * fetches one shard when a dot is tapped.
 * Module: split(base, items, cols, S) with items [{lat, lon, code, row}].
 * CLI: node tools/split-points.js obs|met  (rebuilds data/obs/* or data/met/* from the source JSON). */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const gz = (s) => zlib.gzipSync(s).length;
const split = (base, items, cols, S) => {
  S = S || 200;
  items = items.slice().sort((a, b) => {
    const ka = Math.floor(a.lat * 2) * 1000 + Math.floor(a.lon * 2);
    const kb = Math.floor(b.lat * 2) * 1000 + Math.floor(b.lon * 2);
    return ka - kb || a.lon - b.lon;
  });
  const codes = [];
  const lat = [], lon = [], c = [];
  let pa = 0, po = 0;
  items.forEach((it) => {
    const a = Math.round(it.lat * 1e5), o = Math.round(it.lon * 1e5);
    lat.push(a - pa); lon.push(o - po); pa = a; po = o;
    let k = codes.indexOf(it.code || "");
    if (k < 0) { k = codes.length; codes.push(it.code || ""); }
    c.push(k);
  });
  fs.mkdirSync(path.dirname(base), { recursive: true });
  const old = fs.readdirSync(path.dirname(base)).filter((f) => { return f.indexOf(path.basename(base) + ".") === 0; });
  old.forEach((f) => { fs.unlinkSync(path.join(path.dirname(base), f)); });
  const body = JSON.stringify({ n: items.length, S: S, codes: codes, cols: cols, lat: lat, lon: lon, c: c });
  fs.writeFileSync(base + ".p.json", body);
  let dbytes = 0, dgz = 0, shards = 0;
  for (let k = 0; k * S < items.length; k++) {
    const d = JSON.stringify(items.slice(k * S, k * S + S).map((it) => { return it.row; }));
    fs.writeFileSync(base + ".d" + k + ".json", d);
    dbytes += d.length; dgz += gz(d); shards++;
  }
  return { n: items.length, bytes: body.length, gz: gz(body), shards: shards, dbytes: dbytes, dgz: dgz };
};
module.exports = { split: split };
if (require.main === module) {
  const root = path.join(__dirname, "..", "data");
  const which = process.argv[2];
  if (which === "obs") {
    const d = JSON.parse(fs.readFileSync(path.join(root, "observatories.json"), "utf8"));
    const cols = "name,kind,cat,operator,link,scopes,type,diameter_m,qid,note";
    /* four classes; radio sites already on the Radio telescopes layer (same Wikidata item or within 2 km) are left out */
    const t = JSON.parse(fs.readFileSync(path.join(root, "world", "transmission.p.json"), "utf8")), scopes = [];
    let a = 0, o = 0;
    for (let i = 0; i < t.n; i++) {
      a += t.lat[i]; o += t.lon[i];
      if (t.codes[t.c[i]] !== "scope") continue;
      const row = JSON.parse(fs.readFileSync(path.join(root, "world", "transmission.d" + Math.floor(i / t.S) + ".json"), "utf8"))[i % t.S];
      scopes.push({ lat: a / 1e5, lon: o / 1e5, qid: row[7] });
    }
    const near = (s) => {
      return scopes.some((q) => { return (s.qid && q.qid === s.qid) || Math.hypot(q.lat - s.lat, (q.lon - s.lon) * Math.cos(s.lat * Math.PI / 180)) < 0.018; });
    };
    const cls = (s) => {
      if (/neutrino|gravitational|cosmic/.test(s.cat)) return "detector";
      if (s.kind === "dark-sky") return "darksky";
      if (s.kind === "observing-site" || s.kind === "planetarium") return "stargaze";
      return "scope";
    };
    const count = {};
    const keep = d.sites.filter((s) => { return !(s.cat === "radio" && near(s)); });
    const r = split(path.join(root, "obs", "sites"), keep.map((s) => {
      const c = cls(s);
      count[c] = (count[c] || 0) + 1;
      return { lat: s.lat, lon: s.lon, code: c, row: cols.split(",").map((k) => { return s[k] == null ? "" : s[k]; }) };
    }), cols, 150);
    console.log("obs", d.sites.length - keep.length, "radio duplicates left out", JSON.stringify(count), JSON.stringify(r));
  } else if (which === "met") {
    const d = JSON.parse(fs.readFileSync(path.join(root, "meteorite-falls.json"), "utf8"));
    const r = split(path.join(root, "met", "falls"), d.falls.map((f) => {
      return { lat: f[4], lon: f[5], code: f[6] === 0 ? "found" : "fell", row: [f[0], f[1], f[2], f[3]] };
    }), "n,c,m,y", 150);
    console.log("met", JSON.stringify(r));
  } else console.log("usage: node tools/split-points.js obs|met");
}
