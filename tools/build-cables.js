// workspace/whereisthesun/tools/build-cables.js
/* SUNNY opt99 submarine cables from TeleGeography's Submarine Cable Map (CC BY-NC-SA 3.0,
 * submarinecablemap.com). Writes data/world/cables.geo.json (lines, 2-decimal coords, props i + colour)
 * and data/world/cables.d.json (rows: name, length, ready-for-service, owners, id), loaded on first tap.
 * Usage: node tools/build-cables.js */
const fs = require("fs");
const path = require("path");
const API = "https://www.submarinecablemap.com/api/v3/cable/";
const OUT = path.join(__dirname, "..", "data", "world");
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u + " " + r.status); return r.json(); };
const main = async () => {
  const g = await get(API + "cable-geo.json");
  const ids = [...new Set(g.features.map((f) => { return f.properties.id; }))];
  const det = {};
  for (let k = 0; k < ids.length; k += 12) {
    await Promise.all(ids.slice(k, k + 12).map(async (id) => {
      try { det[id] = await get(API + id + ".json"); } catch (e) { det[id] = { name: id }; }
    }));
  }
  const rows = ids.map((id) => {
    const d = det[id];
    return [d.name || id, d.length || "", d.rfs_year || d.rfs || "", d.owners || "", id];
  });
  const r2 = (c) => { return [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100]; };
  const line = (cs) => { const o = []; cs.forEach((c) => { const p = r2(c); const l = o[o.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) o.push(p); }); return o; };
  const feats = g.features.map((f) => {
    const gm = f.geometry;
    const cs = gm.type === "MultiLineString" ? gm.coordinates.map(line).filter((l) => { return l.length > 1; }) : [line(gm.coordinates)];
    return { type: "Feature", properties: { i: ids.indexOf(f.properties.id), y: parseInt(rows[ids.indexOf(f.properties.id)][2], 10) || 0 }, geometry: { type: "MultiLineString", coordinates: cs } };
  });
  fs.writeFileSync(path.join(OUT, "cables.geo.json"), JSON.stringify({ type: "FeatureCollection", features: feats }));
  fs.writeFileSync(path.join(OUT, "cables.d.json"), JSON.stringify(rows));
  console.log(ids.length, "cables");
};
main().catch((e) => { console.error(e); process.exit(1); });
