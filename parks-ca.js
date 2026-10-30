// workspace/whereisthesun/parks-ca.js
/* SUNNY opt164 provincial and territorial parks of Canada, all 13 provinces and territories.
 * Source: Canadian Protected and Conserved Areas Database 2025 (ECCC, Open Government Licence - Canada), provincial and
 * territorial park types only, zones merged by name. Ontario operating status joined from LIO "Provincial Park Regulated".
 * Dots at every zoom (data/parks-ca.json); simplified boundaries (about 250 m) load per province from data/parks-b/ at zoom 6+.
 * Non-operating parks (no facilities, open to low-impact use) are their own sub-type and switch. */
(() => {
  "use strict";
  var K = window.SunnyKit, L = window.SunnyLayers;
  if (!K || !L) return;
  var map = null, data = null, got = {}, hooked = false;
  var SS = { o: ["Operating park", "#2e7d32"], n: ["Non-operating park", "#ff6d00"], u: ["Park (status not recorded)", "#66bb6a"] };
  var PV = { AB: "Alberta", BC: "British Columbia", MB: "Manitoba", NB: "New Brunswick", NL: "Newfoundland and Labrador", NT: "Northwest Territories",
    NS: "Nova Scotia", NU: "Nunavut", ON: "Ontario", PE: "Prince Edward Island", QC: "Quebec", SK: "Saskatchewan", YT: "Yukon" };
  var PARK_KIDS = Object.keys(SS).map((s) => { return { id: "parks-" + s, dflt: true, code: s }; });
  var on = () => { return L.isOn("parks"); };
  var filt = () => { return K.kids.inFilter(["get", "s"], K.kids.activeCodes(PARK_KIDS, (k) => { return k.code; })); };
  var color = ["match", ["get", "s"], "o", SS.o[1], "n", SS.n[1], SS.u[1]];
  var NOTE = { ONo: "Status: Ontario LIO, Provincial Park Regulated", ONn: "Status: Ontario LIO, Provincial Park Regulated",
    BCo: "Status: BC Parks API lists an active operating season", BCn: "Status: BC Parks API lists no operating season or services",
    ABo: "Status: Alberta Parks facility points (campground, day use, visitor centre) inside",
    ABn: "Status: no Alberta Parks facility points inside (no facilities listed)",
    QCo: "Status: established Québec national park (CPCAD type; these run visitor services)",
    QCn: "Status: Québec national park reserve, not yet an operating park (CPCAD type)" };
  var stNote = (r) => { if (r[7] === "osm") return r[9] ? "Closed " + r[9] + " (Wikidata)" : "Location: OpenStreetMap; status not in open data";
    return NOTE[r[3] + r[4]] || (r[4] === "u" ? "Operating status not in open data" : ""); };
  var row = (p) => { return data.r[p.i]; };
  var title = (r) => { return r[2]; };
  var lines = (r) => { return ["<b>" + K.esc(SS[r[4]][0]) + "</b>", K.esc(PV[r[3]] || r[3]), K.esc(r[5]),
    r[6] ? "Area " + Number(r[6]).toLocaleString() + " ha" : "", r[8] ? "Established " + r[8] : "",
    stNote(r)]; };
  var SRC = ["CPCAD 2025 (ECCC, OGL-Canada)", "https://www.canada.ca/en/environment-climate-change/services/national-wildlife-areas/protected-conserved-areas-database.html"];
  var SRC_AB = ["Alberta Parks protected areas (Gov. of Alberta, OGL-Alberta)", "https://geospatial.alberta.ca/titan/rest/services/boundary/parks_protected_areas_alberta/FeatureServer/0"];
  var SRC_OSM = ["OpenStreetMap contributors (ODbL), Wikidata", "https://www.openstreetmap.org/copyright"];
  var props = (f) => { return f.properties.i === undefined ? null : row(f.properties); };
  var fc = () => { return K.fc(data.r.map((r, i) => { return { type: "Feature", geometry: { type: "Point", coordinates: [r[1], r[0]] }, properties: { i: i, s: r[4] } }; })); };
  var bfc = () => { var fs = []; Object.keys(got).forEach((k) => { if (got[k] !== 1) fs = fs.concat(got[k]); }); return K.fc(fs); };
  var add = () => {
    if (map.getSource("parks-pt")) return;
    map.addSource("parks-b", { type: "geojson", data: bfc(), attribution: "Parks: CPCAD (ECCC), LIO Ontario, BC Parks API, Alberta Parks" });
    map.addSource("parks-pt", { type: "geojson", data: fc() });
    map.addLayer({ id: "parks-fill", type: "fill", source: "parks-b", minzoom: 6, paint: { "fill-color": color, "fill-opacity": 0.28 } }, K.before(map));
    map.addLayer({ id: "parks-edge", type: "line", source: "parks-b", minzoom: 6, paint: { "line-color": color, "line-width": ["match", ["get", "s"], "n", 1.8, 1],
      "line-dasharray": ["literal", [2, 1]] } }, K.before(map));
    map.addLayer({ id: "parks-dot", type: "circle", source: "parks-pt", paint: { "circle-radius": K.markerScale.bind(map, "parks-dot", "circle-radius",
      ["interpolate", ["linear"], ["zoom"], 2, 2, 8, 4, 14, 6]),
      "circle-color": color, "circle-stroke-color": "#fff", "circle-stroke-width": ["match", ["get", "s"], "n", 1.6, 0.8] } }, K.before(map));
  };
  var loadB = () => {
    if (!data || map.getZoom() < 6) return;
    var v = map.getBounds();
    Object.keys(data.b).forEach((k) => {
      var b = data.b[k];
      if (got[k] || b[0] > v.getEast() || b[2] < v.getWest() || b[1] > v.getNorth() || b[3] < v.getSouth()) return;
      got[k] = 1;
      K.loadJson("data/parks-b/" + k + ".json?v=1").then((d) => {
        got[k] = d.features.map((f) => { f.properties.s = data.r[f.properties.i][4]; return f; });
        var s = map.getSource("parks-b"); if (s) s.setData(bfc());
      }).catch(() => { delete got[k]; });
    });
  };
  var apply = () => {
    if (!map) return;
    var want = on();
    if (want && !data) { data = { r: [], b: {} }; K.loadJson("data/parks-ca.json?v=298ab790").then((d) => { data = d; apply(); }).catch(() => { data = null; }); return; }
    if (want && data.r.length) { try { add(); } catch (e) { setTimeout(apply, 2000); return; } loadB(); }
    ["parks-fill", "parks-edge", "parks-dot"].forEach((id) => { if (map.getLayer(id)) map.setFilter(id, filt()); });
    K.vis(map, ["parks-fill", "parks-edge", "parks-dot"], want);
  };
  var card = (e) => { var r = props(e.features[0]); if (r) K.show(map, e.lngLat, title(r), lines(r), r[7] === "ab" ? SRC_AB : r[7] === "osm" ? SRC_OSM : SRC); };
  L.add({ id: "parks", name: "Provincial & territorial parks (Canada)", icon: "🏞️", group: "Outdoors", taps: ["parks-dot", "parks-fill"], apply: () => apply(),
    kids: Object.keys(SS).map((k) => { return { id: "parks-" + k, name: SS[k][0], dflt: true }; }), kidSet: () => apply(),
    legend: K.legKeys(Object.keys(SS).map((k) => [SS[k][1], "dot", SS[k][0]])),
    tip: "1,764 provincial and territorial parks (CPCAD; Alberta recreation areas from Alberta Parks; 224 more from OpenStreetMap). Orange = non-operating (Ontario LIO; BC Parks API; Alberta facility points; Québec park type). Outlines from zoom 6; tap for details",
    attach: (m) => {
      map = m;
      if (hooked) return; hooked = true;
      m.on("idle", () => { if (on() && data && data.r.length && !m.getLayer("parks-dot")) apply(); });
      m.on("moveend", () => { if (on()) loadB(); });
      m.on("click", "parks-dot", card);
      m.on("click", "parks-fill", card);
      var hv = (f) => { var r = props(f); return Promise.resolve(r ? [title(r), SS[r[4]][0] + ", " + (PV[r[3]] || r[3])] : ["Park", ""]); };
      var H = (window.SunnyHoverName = window.SunnyHoverName || {}); H["parks-dot"] = hv; H["parks-fill"] = hv;
      apply();
    } });
})();
