// workspace/whereisthesun/tools/build-world.js
/* SUNNY opt99 world layers. Builds data/world/<layer>.p.json + detail shards (tools/split-points.js).
 * Sources, all free and keyless: Wikidata (CC0) via SPARQL, COMNAP Antarctic facilities (tools/comnap.json,
 * from github.com/PolarGeospatialCenter/comnap-antarctic-facilities), BOEM platform structures
 * (public domain, data.boem.gov PlatStrucRawData.zip, mv_platstruc_structures.txt).
 * Usage: node tools/build-world.js /path/to/mv_platstruc_structures.txt */
const fs = require("fs");
const path = require("path");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world");
const sparql = async (q) => {
  const r = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q), { headers: { "User-Agent": "SunnyBuild/1.0 (github.com/xeea000/whereisthesun)" } });
  if (!r.ok) throw new Error("wikidata " + r.status);
  return (await r.json()).results.bindings;
};
const v = (b, k) => { return b[k] ? b[k].value : ""; };
const yr = (s) => { const m = /^(-?\d+)-/.exec(s || ""); return m ? +m[1] : ""; };
const num = (s) => { return s === "" ? "" : Math.round(+s * 10) / 10; };
const pt = (s) => { const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(s); return m ? [+m[2], +m[1]] : null; };
/* heights, depths and elevations are Wikidata normalized values (metres). One row per item; cols: name,kind,year,height,depth,operator,country,qid,wiki */
const COLS = "name,kind,year,height,depth,operator,country,qid,wiki";
const subs = async (classes) => {
  const r = await sparql("SELECT DISTINCT ?s WHERE { VALUES ?k {" + classes.map((c) => { return "wd:" + c; }).join(" ") + "} ?s wdt:P279* ?k }");
  return r.map((b) => { return v(b, "s").split("/").pop(); });
};
const wd = async (classes, direct) => {
  if (!direct) { classes = await subs(classes); console.error("subclasses", classes.length); }
  const q = "SELECT ?i ?iL ?c ?kL ?inc ?h ?d ?el ?opL ?coL ?w WHERE { VALUES ?k {" + classes.map((c) => { return "wd:" + c; }).join(" ") + "} " +
    "?i " + "wdt:P31" + " ?k; wdt:P625 ?c. " +
    " OPTIONAL{?i wdt:P571 ?inc} OPTIONAL{?i p:P2048/psn:P2048/wikibase:quantityAmount ?h} OPTIONAL{?i p:P4511/psn:P4511/wikibase:quantityAmount ?d} OPTIONAL{?i p:P2044/psn:P2044/wikibase:quantityAmount ?el} OPTIONAL{?i wdt:P137 ?op} OPTIONAL{?i wdt:P17 ?co}" +
    " OPTIONAL{?w schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>} " +
    "SERVICE wikibase:label { bd:serviceParam wikibase:language \"en,mul\". ?i rdfs:label ?iL. ?k rdfs:label ?kL. ?op rdfs:label ?opL. ?co rdfs:label ?coL } }";
  let rows;
  for (let t = 0; t < 3 && !rows; t++) { try { rows = await sparql(q); } catch (e) { console.error(classes.join(" "), e.message); } }
  if (!rows) throw new Error("wikidata failed " + classes);
  console.error(classes.join(" "), rows.length);
  const by = {};
  rows.forEach((b) => {
    const id = v(b, "i").split("/").pop();
    const p = pt(v(b, "c"));
    if (!p || by[id]) return;
    const name = v(b, "iL");
    if (/^Q\d+$/.test(name)) return;
    const d = v(b, "d") !== "" ? num(v(b, "d")) : (v(b, "el") !== "" && +v(b, "el") < 0 ? num(-v(b, "el")) : "");
    by[id] = { lat: p[0], lon: p[1], name: name, kind: v(b, "kL"), year: yr(v(b, "inc")), height: v(b, "h") !== "" ? num(v(b, "h")) : "",
      depth: d, operator: v(b, "opL"), country: v(b, "coL"), qid: id, wiki: v(b, "w").replace("https://en.wikipedia.org/wiki/", "") };
  });
  return Object.values(by);
};
const write = (name, items, code, S) => {
  const r = split(path.join(OUT, name), items.map((s) => {
    return { lat: s.lat, lon: s.lon, code: code(s), row: COLS.split(",").map((k) => { return s[k] == null ? "" : s[k]; }) };
  }), COLS, S || 150);
  console.log(name, JSON.stringify(r));
  return r;
};
const main = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const man = { built: new Date().toISOString().slice(0, 10), files: {} };
  /* Ocean features */
  const trench = await wd(["Q119253"]);
  const vents = await wd(["Q867648"]);
  const mounts = await wd(["Q503269", "Q151957"], true);
  const other = await wd(["Q104698", "Q570554", "Q963729"], true);
  const tag = (a, t) => a.map((s) => { s.t = t; return s; });
  const sea = tag(trench, "trench").concat(tag(vents, "vent"), tag(mounts, "seamount"), tag(other, "feature"));
  man.files.seafloor = write("seafloor", sea, (s) => { return s.t; });
  /* research stations: Wikidata + COMNAP (Antarctic), COMNAP wins within 5 km */
  const st = await wd(["Q749622", "Q195339"]);
  const cm = JSON.parse(fs.readFileSync(path.join(__dirname, "comnap.json"), "utf8")).filter((c) => { return c.lat != null && c.status !== "Closed"; });
  const near = (a, b) => { return Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lon - b.lon) < 0.05 / Math.max(0.05, Math.cos(a.lat * Math.PI / 180)); };
  const stations = cm.map((c) => {
    return { lat: c.lat, lon: c.lon, name: c.name, kind: (c.season || "") + " " + (c.type || "station") + " (COMNAP)", year: c.year || "", height: "", depth: "",
      operator: c.op || "", country: "Antarctica", qid: "", wiki: "", t: "polar" };
  }).concat(st.filter((s) => { return !cm.some((c) => { return near(c, s); }); }).map((s) => { s.t = Math.abs(s.lat) >= 60 ? "polar" : "other"; return s; }));
  man.files.stations = write("stations", stations, (s) => { return s.t; });
  /* Transmission: tall masts and towers, radio telescopes, radar */
  const masts = await wd(["Q11166728", "Q5622819", "Q1798641", "Q17143375"]);
  const scopes = await wd(["Q184356"]);
  const radar = await wd(["Q89578131", "Q1094622"]);
  const tx = masts.map((s) => { s.t = s.height >= 300 ? "mast300" : s.height >= 150 ? "mast150" : "mast"; return s; })
    .concat(scopes.map((s) => { s.t = "scope"; return s; }), radar.map((s) => { s.t = "radar"; return s; }));
  man.files.transmission = write("transmission", tx, (s) => { return s.t; });
  /* BOEM offshore structures still in place (Gulf of Mexico and Pacific OCS) */
  const f = process.argv[2];
  if (f && fs.existsSync(f)) {
    const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
    const head = lines.shift().split(",").map((s) => { return s.replace(/"/g, ""); });
    const ix = (k) => { return head.indexOf(k); };
    const plat = [];
    lines.forEach((ln) => {
      const c = ln.match(/("[^"]*"|[^,]*)(,|$)/g).map((s) => { return s.replace(/,$/, "").replace(/^"|"$/g, "").trim(); });
      if (c.length < head.length || c[ix("REMOVAL_DATE")]) return;
      const lat = +c[ix("LATITUDE")], lon = +c[ix("LONGITUDE")];
      if (!lat || !lon) return;
      plat.push({ lat: lat, lon: lon, name: c[ix("AREA_CODE")] + " " + c[ix("BLOCK_NUMBER")] + " " + c[ix("STRUCTURE_NAME")], kind: c[ix("STRUC_TYPE_CODE")],
        year: yr((c[ix("INSTALL_DATE")].split(" ")[0] || "").replace(/^(\d+)\/(\d+)\/(\d+)$/, "$3-$1-$2")), height: "", depth: c[ix("WATER_DEPTH")] ? +c[ix("WATER_DEPTH")] * 0.3048 | 0 : "",
        operator: c[ix("BUS_ASC_NAME")], country: "United States", qid: "", wiki: c[ix("MANNED_24_HR_FL")] === "Y" ? "manned" : "" });
    });
    const wp = await wd(["Q689880"]);
    man.files.platforms = write("platforms", plat.concat(wp), (s) => { return s.qid ? "wd" : "boem"; }, 300);
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(man));
};
main().catch((e) => { console.error(e); process.exit(1); });
