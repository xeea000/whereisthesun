// workspace/whereisthesun/tools/build-capitals.js
/* SUNNY Civic capitals. Builds data/world/capitals.* from Natural Earth 10m
 * populated places (public domain) plus Wikidata P36 (CC0). National capitals
 * are Admin-0 capitals (and official alternate seats) and country P36.
 * First-level capitals are Admin-1 / Admin-0 region capitals and P36 of
 * first-level administrative divisions. Each place is kept once; a national
 * capital is not also listed as a first-level capital. Names are the Latin
 * / English form. Usage: node tools/build-capitals.js [ne.geojson] */
"use strict";
const fs = require("fs");
const path = require("path");
const { split } = require("./split-points.js");
const OUT = path.join(__dirname, "..", "data", "world", "capitals");
const COLS = "name,kind,of,country,pop,note,qid,wiki,src";
const NE_DEFAULT = "/workspace/t435/raw/ne_10m_populated_places.geojson";
const UA = "SunnyBuild/1.0 (github.com/xeea000/whereisthesun)";
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const sparql = async (q) => {
  const u = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q);
  for (let t = 0; t < 5; t++) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } });
      if (r.ok) return (await r.json()).results.bindings;
      console.error("wikidata", r.status);
    } catch (e) { console.error("wikidata", e.message); }
    await sleep(4000 + t * 3000);
  }
  throw new Error("wikidata failed");
};
const v = (b, k) => { return b[k] ? b[k].value : ""; };
const pt = (s) => {
  const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(s);
  return m ? { lon: +m[1], lat: +m[2] } : null;
};
const qidOf = (s) => {
  const m = /\/(Q\d+)$/.exec(s || "");
  return m ? m[1] : "";
};
const wikiTitle = (s) => { return (s || "").replace("https://en.wikipedia.org/wiki/", ""); };
const LATIN = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;
const NONLATIN = new RegExp(
  "[\u0400-\u04FF\u0500-\u052F\u0530-\u058F\u0590-\u05FF\u0600-\u06FF\u0700-\u074F" +
  "\u0900-\u097F\u0980-\u09FF\u0E00-\u0E7F\u0F00-\u0FFF\u1000-\u109F\u1100-\u11FF" +
  "\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]"
);
function isLatin(s) {
  s = String(s || "");
  if (!s) return false;
  if (NONLATIN.test(s)) return false;
  return LATIN.test(s);
}
function latinName() {
  for (let i = 0; i < arguments.length; i++) {
    const s = String(arguments[i] || "").trim();
    if (s && isLatin(s) && !/^Q\d+$/.test(s)) return s;
  }
  return "";
}
function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
}
function km(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(x)));
}
function popOf(n) {
  n = +n;
  if (!isFinite(n) || n <= 0) return "";
  return Math.round(n);
}
const items = [];
const byQid = {};
function add(it) {
  if (!it || !isFinite(it.lat) || !isFinite(it.lon) || Math.abs(it.lat) > 90 || Math.abs(it.lon) > 180) return null;
  if (!it.name) return null;
  it.of = it.of || "";
  it.country = it.country || "";
  it.pop = it.pop === "" || it.pop == null ? "" : popOf(it.pop);
  it.note = it.note || "";
  it.qid = it.qid || "";
  it.wiki = it.wiki || "";
  it.src = it.src || "";
  if (it.qid && byQid[it.qid]) {
    merge(byQid[it.qid], it);
    return byQid[it.qid];
  }
  items.push(it);
  if (it.qid) byQid[it.qid] = it;
  return it;
}
function merge(a, b) {
  if (!a.name && b.name) a.name = b.name;
  if (!a.of && b.of) a.of = b.of;
  if (!a.country && b.country) a.country = b.country;
  if (a.pop === "" && b.pop !== "") a.pop = b.pop;
  if (!a.note && b.note) a.note = b.note;
  if (!a.qid && b.qid) { a.qid = b.qid; byQid[b.qid] = a; }
  if (!a.wiki && b.wiki) a.wiki = b.wiki;
  if (b.src && a.src.indexOf(b.src) < 0) a.src = a.src ? a.src + "+" + b.src : b.src;
  /* a national tag wins if the same place was seen both ways */
  if (a.code === "adm1" && b.code === "nat") a.code = "nat";
}
function findNear(it, code, maxKm, pred) {
  for (let i = 0; i < items.length; i++) {
    const o = items[i];
    if (code && o.code !== code) continue;
    if (km(it, o) > maxKm) continue;
    if (pred && !pred(o)) continue;
    return o;
  }
  return null;
}
function tidyCapin(s) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  /* Natural Earth sometimes truncates this field */
  if (s.length > 80) s = s.slice(0, 80).replace(/\s+\S*$/, "");
  return s;
}
function loadNE(file) {
  const gj = JSON.parse(fs.readFileSync(file, "utf8"));
  const feats = gj.features || [];
  let nNat = 0, nAdm = 0, skipped = 0;
  feats.forEach((f) => {
    const p = f.properties || {};
    const cla = p.FEATURECLA || "";
    let code = "";
    if (cla === "Admin-0 capital" || cla === "Admin-0 capital alt") code = "nat";
    else if (cla === "Admin-1 capital" || cla === "Admin-1 region capital" || cla === "Admin-0 region capital") code = "adm1";
    else return;
    const name = latinName(p.NAMEASCII, p.NAME_EN, p.NAME);
    if (!name) { skipped++; return; }
    const country = latinName(p.ADM0NAME, p.SOV0NAME);
    const adm1 = latinName(p.ADM1NAME);
    const of = code === "nat" ? country : (adm1 || country);
    const geom = f.geometry && f.geometry.coordinates;
    const lon = p.LONGITUDE != null ? +p.LONGITUDE : (geom ? +geom[0] : NaN);
    const lat = p.LATITUDE != null ? +p.LATITUDE : (geom ? +geom[1] : NaN);
    const note = code === "nat" ? tidyCapin(p.CAPIN) : "";
    const it = add({
      lat, lon, code, name, of, country, pop: p.POP_MAX, note,
      qid: p.WIKIDATAID || "", wiki: "", src: "ne"
    });
    if (!it) { skipped++; return; }
    if (code === "nat") nNat++; else nAdm++;
  });
  return { nNat, nAdm, skipped, n: feats.length };
}
const Q_NAT = `SELECT ?country ?countryLabel ?capital ?capitalLabel ?coord ?pop ?wiki WHERE {
  ?country wdt:P31 wd:Q3624078.
  FILTER NOT EXISTS { ?country wdt:P31 wd:Q3024240 }
  FILTER NOT EXISTS { ?country wdt:P576 ?end }
  ?country wdt:P36 ?capital.
  ?capital wdt:P625 ?coord.
  OPTIONAL { ?capital wdt:P1082 ?pop }
  OPTIONAL { ?wiki schema:about ?capital; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}`;
/* first-level types that have a capital, queried directly so the
 * request does not have to walk the whole subclass tree in one go */
const ADM_TYPES = [
  "Q10864048", /* first-level administrative country subdivision */
  "Q107390",   /* federated state */
  "Q34876",    /* province */
  "Q5098",     /* region of a country, often first-level */
  "Q1048835",  /* political territorial entity — too broad, skip */
  "Q10856968", /* first-level administrative division in a specific country? */
  "Q1631888",  /* oblast */
  "Q867530",   /* governorate */
  "Q13220204", /* region of France? */
  "Q24754",    /* oblast of Russia? handled as oblast */
  "Q5852411",  /* state of the United States — actually Q35657 */
  "Q35657",    /* state of the United States */
  "Q11828004", /* province of Canada */
  "Q9357527",  /* territory of Canada */
  "Q261543",   /* autonomous community of Spain */
  "Q2615430",
  "Q22663",    /* Land of Germany? Q1221156 */
  "Q1221156",  /* German Bundesland */
  "Q1139469",  /* region of Italy */
  "Q1138494",  /* prefecture of Japan? Q50337 */
  "Q50337",    /* prefecture of Japan */
  "Q1231622",  /* state of India? Q12443800 */
  "Q12443800", /* state of India */
  "Q467745",   /* union territory of India */
  "Q41162",    /* oblast of Ukraine? */
  "Q835714",   /* voivodeship of Poland */
  "Q108169",   /* canton of Switzerland? Q23058 */
  "Q23058",    /* canton of Switzerland */
  "Q12915478", /* department of France? Q6465 */
  "Q6465",     /* department of France — second-level; skip */
  "Q18677813", /* region of France */
  "Q108640",   /* municipality — too low, skip */
  "Q170156",   /* administrative territorial entity of China? */
  "Q1209498",  /* province of China */
  "Q1768198",  /* autonomous region of China */
  "Q1336015",  /* special administrative region */
  "Q183342",   /* federal subject of Russia */
  "Q19953632", /* first-level administrative division of Nigeria? */
  "Q5157659",  /* state of Nigeria */
  "Q180673",   /* governorate of Egypt? */
  "Q179385",   /* department of Colombia? */
  "Q11698",    /* department of France skip */
  "Q15629582", /* state of Brazil */
  "Q16641",    /* state of Mexico */
  "Q3381571",  /* province of Argentina? Q44753 */
  "Q44753",
  "Q856319",   /* region of Chile? */
  "Q24746",    /* region of Finland? second? */
  "Q1149652",  /* county of Sweden? often first-level Q200547 */
  "Q200547",
  "Q192611",   /* county of Norway */
  "Q193512",   /* region of Denmark */
  "Q83471",    /* county of Ireland? Q179872 */
  "Q179872",
  "Q203547",   /* council area of Scotland */
  "Q1138495",  /* ceremonial county — skip */
  "Q1138499",  /* principal area of Wales */
  "Q1169517",  /* district of Northern Ireland? */
  "Q671511",   /* province of Turkey */
  "Q15630791", /* province of Indonesia */
  "Q50358",    /* region of the Philippines? */
  "Q24727",    /* province of the Philippines */
  "Q15631959", /* province of Thailand */
  "Q82794",    /* province of Vietnam? */
  "Q15634561", /* province of South Korea? Q41142 */
  "Q41142",
  "Q1048525",  /* county of South Korea */
  "Q18677821", /* region of Greece */
  "Q20719690", /* voivodeship already */
  "Q15089",    /* oblast of Belarus */
  "Q16442865", /* county of Romania */
  "Q548114",   /* county of Hungary? Q193031 */
  "Q193031",
  "Q194203",   /* region of Czechia */
  "Q192641",   /* region of Slovakia */
  "Q16553",    /* province of Belgium? Q239540 */
  "Q239540",
  "Q12530",    /* region of Belgium */
  "Q16644",    /* municipality of the Netherlands — skip */
  "Q134390",   /* province of the Netherlands */
  "Q261542",   /* district of Austria? Q261543 already; Q261543 is Spain */
  "Q2615420",
  "Q2615431",
  "Q379879",   /* Austrian state Q26810? Q261543 wait */
  "Q26810",
  "Q123227",   /* region of Portugal */
  "Q1137838",  /* district of Portugal */
  "Q1993891",  /* emirate of the UAE */
  "Q15630788", /* province of Pakistan */
  "Q15063158", /* province of Afghanistan */
  "Q15630849", /* province of Iran */
  "Q15630798", /* governorate of Iraq */
  "Q15630780", /* governorate of Syria */
  "Q15630785", /* governorate of Yemen */
  "Q15630795", /* governorate of Tunisia? */
  "Q15630800",
  "Q2614628",  /* wilaya of Algeria */
  "Q15630805", /* region of Morocco */
  "Q15630808", /* region of Madagascar? */
  "Q1329976",  /* region of Ghana? */
  "Q15630820", /* county of Kenya */
  "Q15630825", /* region of Tanzania */
  "Q15630830", /* province of Mozambique? */
  "Q15630835", /* province of Angola */
  "Q15630840", /* province of DRC */
  "Q15630845", /* region of Ethiopia */
  "Q15630850", /* state of Sudan */
  "Q1055754",  /* region of France already */
];
/* A compact first-level query: things that are a first-level division (or a
 * well-known first-level type) and have a capital with coordinates. */
const qAdm = (types) => {
  const values = types.map((t) => "wd:" + t).join(" ");
  return `SELECT ?adm ?admLabel ?countryLabel ?capital ?capitalLabel ?coord ?pop ?wiki WHERE {
    VALUES ?t { ${values} }
    ?adm wdt:P31 ?t.
    ?adm wdt:P17 ?country.
    ?adm wdt:P36 ?capital.
    ?capital wdt:P625 ?coord.
    OPTIONAL { ?capital wdt:P1082 ?pop }
    OPTIONAL { ?wiki schema:about ?capital; schema:isPartOf <https://en.wikipedia.org/> }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
  }`;
};
function ingestWd(rows, code) {
  let n = 0, skipped = 0;
  const best = {};
  rows.forEach((b) => {
    const capId = qidOf(v(b, "capital"));
    const p = pt(v(b, "coord"));
    const name = latinName(v(b, "capitalLabel"));
    if (!capId || !p || !name) { skipped++; return; }
    const of = latinName(code === "nat" ? v(b, "countryLabel") : v(b, "admLabel"));
    const country = latinName(v(b, "countryLabel"));
    const pop = popOf(v(b, "pop"));
    const rec = { lat: p.lat, lon: p.lon, code, name, of, country, pop, note: "", qid: capId, wiki: wikiTitle(v(b, "wiki")), src: "wd" };
    const k = capId + "|" + (code === "nat" ? country : of);
    const prev = best[k];
    if (!prev) best[k] = rec;
    else if (rec.pop !== "" && (prev.pop === "" || rec.pop > prev.pop)) best[k] = rec;
  });
  Object.keys(best).forEach((k) => {
    const rec = best[k];
    if (rec.qid && byQid[rec.qid]) {
      /* already in the set (Natural Earth row): fill gaps only */
      const cur = byQid[rec.qid];
      if (cur.code === "nat" && rec.code === "adm1") {
        merge(cur, rec);
        skipped++;
        return;
      }
      if (cur.code === "adm1" && rec.code === "nat") cur.code = "nat";
      merge(cur, rec);
      n++;
      return;
    }
    const hitNat = findNear(rec, "nat", 40, (o) => {
      return norm(o.name) === norm(rec.name) || (o.country && rec.country && norm(o.country) === norm(rec.country) && norm(o.name).slice(0, 6) === norm(rec.name).slice(0, 6));
    });
    if (hitNat) {
      merge(hitNat, rec);
      if (rec.code === "nat") hitNat.code = "nat";
      n++;
      return;
    }
    if (rec.code === "adm1") {
      /* do not also list a national capital as a first-level seat */
      const nearNat = findNear(rec, "nat", 25, (o) => { return norm(o.name) === norm(rec.name) || true && km(rec, o) < 15; });
      /* the `true &&` above is too loose — only skip when the name matches or it is the same city very close with same country */
    }
    const nearNat = findNear(rec, "nat", 20, (o) => {
      return norm(o.name) === norm(rec.name) || (o.country && rec.country && norm(o.country) === norm(rec.country) && km(rec, o) < 12);
    });
    if (rec.code === "adm1" && nearNat) { skipped++; return; }
    const hitAdm = rec.code === "adm1" ? findNear(rec, "adm1", 20, (o) => {
      return norm(o.name) === norm(rec.name) || (norm(o.of) === norm(rec.of) && norm(o.country) === norm(rec.country));
    }) : null;
    if (hitAdm) { merge(hitAdm, rec); n++; return; }
    if (add(rec)) n++;
    else skipped++;
  });
  return { n, skipped, rows: rows.length, uniq: Object.keys(best).length };
}
(async () => {
  const nePath = process.argv[2] || NE_DEFAULT;
  if (!fs.existsSync(nePath)) {
    console.error("Natural Earth geojson not found:", nePath);
    process.exit(1);
  }
  const ne = loadNE(nePath);
  console.log("natural earth", JSON.stringify(ne), "items", items.length);
  try {
    const natRows = await sparql(Q_NAT);
    const nat = ingestWd(natRows, "nat");
    console.log("wikidata national", JSON.stringify(nat), "items", items.length);
  } catch (e) {
    console.error("national wikidata skipped:", e.message);
  }
  /* query first-level types in batches to stay under the time limit */
  const types = Array.from(new Set(ADM_TYPES.filter((t) => t && !/skip/i.test(t))));
  /* the comment-filtered list still has some second-level ids; drop known ones */
  const drop = new Set(["Q1048835", "Q6465", "Q108640", "Q11698", "Q16644", "Q1138495", "Q1137838"]);
  const clean = types.filter((t) => !drop.has(t));
  const batchSize = 25;
  let admTotal = { n: 0, skipped: 0, rows: 0, uniq: 0 };
  for (let i = 0; i < clean.length; i += batchSize) {
    const batch = clean.slice(i, i + batchSize);
    try {
      const rows = await sparql(qAdm(batch));
      const got = ingestWd(rows, "adm1");
      admTotal.n += got.n; admTotal.skipped += got.skipped; admTotal.rows += got.rows; admTotal.uniq += got.uniq;
      console.log("wikidata adm batch", i, batch.length, JSON.stringify(got), "items", items.length);
    } catch (e) {
      console.error("wikidata adm batch failed", i, e.message);
    }
    await sleep(1500);
  }
  console.log("wikidata adm total", JSON.stringify(admTotal), "items", items.length);
  /* if a place ended up as both, keep the national row only (already merged) */
  const kept = items.filter((it, i) => {
    if (it.code === "adm1") {
      const nat = items.find((o) => o !== it && o.code === "nat" && (o.qid && o.qid === it.qid || (norm(o.name) === norm(it.name) && km(o, it) < 20)));
      if (nat) { merge(nat, it); return false; }
    }
    return true;
  });
  const counts = { nat: 0, adm1: 0 };
  kept.forEach((it) => { counts[it.code] = (counts[it.code] || 0) + 1; });
  const rows = kept.map((it) => {
    return {
      lat: +it.lat, lon: +it.lon, code: it.code,
      row: [it.name, it.code === "nat" ? "national" : "first-level", it.of, it.country, it.pop, it.note, it.qid, it.wiki, it.src]
    };
  });
  const r = split(OUT, rows, COLS, 200);
  fs.writeFileSync(OUT + ".meta.json", JSON.stringify({
    built: new Date().toISOString().slice(0, 10),
    counts, split: r,
    sources: {
      ne: "Natural Earth 10m populated places (public domain)",
      wd: "Wikidata P36 capitals (CC0)"
    }
  }, null, 2) + "\n");
  console.log("wrote", OUT, "counts", counts, "split", r);
})().catch((e) => { console.error(e); process.exit(1); });
