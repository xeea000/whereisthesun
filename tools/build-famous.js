// workspace/whereisthesun/tools/build-famous.js
/* SUNNY opt112 famous star. Collects every Wikidata item in the point layers, asks Wikidata how many
 * Wikipedia language editions cover it, and keeps the well-known ones (MIN sitelinks or more).
 * Writes data/world/famous.json: {min, n, l: [[layer, lat, lon, name, sitelinks], ...]}.
 * Usage: node tools/build-famous.js */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const MIN = 30;
const SRC = [["data/world/accelerators", () => "accelerators"], ["data/world/labs", () => "labs"], ["data/world/platforms", () => "platforms"],
  ["data/world/seafloor", () => "seafloor"], ["data/world/stations", () => "stations"],
  ["data/world/transmission", (k) => { return k === "scope" ? "radioscopes" : k === "radar" ? "radars" : ""; }], ["data/obs/sites", () => "observatories"]];
const items = [];
SRC.forEach((s) => {
  const p = JSON.parse(fs.readFileSync(path.join(root, s[0] + ".p.json"), "utf8")), qi = p.cols.split(",").indexOf("qid"), ni = p.cols.split(",").indexOf("name");
  let a = 0, o = 0;
  for (let i = 0; i < p.n; i++) {
    a += p.lat[i]; o += p.lon[i];
    const layer = s[1](p.codes[p.c[i]]);
    if (!layer) continue;
    const row = JSON.parse(fs.readFileSync(path.join(root, s[0] + ".d" + Math.floor(i / p.S) + ".json"), "utf8"))[i % p.S] || [];
    const q = String(row[qi] || "");
    if (/^Q\d+$/.test(q)) items.push({ q: q, layer: layer, lat: a / 1e5, lon: o / 1e5, name: row[ni] });
  }
});
console.error("items with a Wikidata id", items.length);
const main = async () => {
  const links = {};
  const qs = [...new Set(items.map((x) => x.q))];
  for (let i = 0; i < qs.length; i += 300) {
    const q = "SELECT ?i ?s WHERE { VALUES ?i { " + qs.slice(i, i + 300).map((x) => "wd:" + x).join(" ") + " } ?i wikibase:sitelinks ?s }";
    const r = await fetch("https://query.wikidata.org/sparql?format=json", { method: "POST", body: new URLSearchParams({ query: q }),
      headers: { "User-Agent": "SunnyBuild/1.0 (github.com/xeea000/whereisthesun)" } });
    if (!r.ok) throw new Error("wikidata " + r.status);
    (await r.json()).results.bindings.forEach((b) => { links[b.i.value.split("/").pop()] = +b.s.value; });
  }
  /* hand-picked famous places in layers without Wikidata ids */
  const CUR = [["craters", 21.4, -89.517, "Chicxulub crater"], ["craters", 35.0275, -111.0225, "Meteor Crater (Barringer)"], ["craters", -27, 27.5, "Vredefort crater"],
    ["craters", 46.6, -81.183, "Sudbury Basin"], ["craters", 51.383, -68.7, "Manicouagan crater"], ["observatories", 19.8207, -155.4681, "Mauna Kea Observatories"],
    ["observatories", -24.6275, -70.4044, "Paranal Observatory"], ["observatories", 51.4769, -0.0005, "Royal Observatory, Greenwich"],
    ["observatories", 34.2258, -118.0572, "Mount Wilson Observatory"], ["observatories", 33.3564, -116.865, "Palomar Observatory"],
    ["observatories", 53.2367, -2.3085, "Jodrell Bank Observatory"], ["observatories", -23.0193, -67.7532, "ALMA"]];
  const out = items.filter((x) => (links[x.q] || 0) >= MIN).map((x) => [x.layer, +x.lat.toFixed(4), +x.lon.toFixed(4), x.name, links[x.q]]).concat(CUR.map((c) => c.concat([0])));
  fs.writeFileSync(path.join(root, "data/world/famous.json"), JSON.stringify({ min: MIN, n: out.length, l: out }));
  const by = {}; out.forEach((x) => { by[x[0]] = (by[x[0]] || 0) + 1; });
  console.log("famous", out.length, JSON.stringify(by));
};
main().catch((e) => { console.error(e); process.exit(1); });
