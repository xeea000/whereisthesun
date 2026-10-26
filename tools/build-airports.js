// workspace/whereisthesun/tools/build-airports.js
/* SUNNY opt114 Airports layer, from OurAirports (public domain), free and keyless.
 * Keeps large airports and medium airports with scheduled service. opt162 Canada fill: every other Canadian airport,
 * airfield and water aerodrome (codes "camed", "casmall", "casea"; heliports and closed sites left out). Writes data/world/airports.* (tools/split-points.js).
 * Usage: node tools/build-airports.js */
const path = require("path");
const fs = require("fs");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const COLS = "name,iata,icao,city,country,elev,wiki";
const csv = (s) => {
  const out = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === "\"" && s[i + 1] === "\"") { f += "\""; i++; } else if (c === "\"") q = false; else f += c; continue; }
    if (c === "\"") q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); out.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  return out;
};
const main = async () => {
  const r = await fetch("https://davidmegginson.github.io/ourairports-data/airports.csv");
  const rows = csv(await r.text()), h = rows.shift(), ix = {};
  h.forEach((k, i) => { ix[k] = i; });
  const items = [];
  rows.forEach((a) => {
    const t = a[ix.type], sched = a[ix.scheduled_service] === "yes";
    const ca = a[ix.iso_country] === "CA" && /^(medium_airport|small_airport|seaplane_base)$/.test(t);
    if (!(t === "large_airport" || (t === "medium_airport" && sched) || ca)) return;
    const w = a[ix.wikipedia_link] || "";
    items.push({ lat: +(+a[ix.latitude_deg]).toFixed(4), lon: +(+a[ix.longitude_deg]).toFixed(4), code: t === "large_airport" ? "large" : t === "medium_airport" && sched ? "medium"
        : { medium_airport: "camed", small_airport: "casmall", seaplane_base: "casea" }[t],
      row: [a[ix.name], a[ix.iata_code], a[ix.icao_code] || a[ix.ident], a[ix.municipality], a[ix.iso_country], a[ix.elevation_ft],
        /en\.wikipedia/.test(w) ? decodeURIComponent(w.split("/wiki/").pop()) : ""] });
  });
  const man = JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8"));
  man.files.airports = split(path.join(OUT, "airports"), items, COLS, 150);
  console.log("airports", items.length, JSON.stringify(man.files.airports));
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(man));
};
main().catch((e) => { console.error(e); process.exit(1); });
