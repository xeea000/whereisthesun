// workspace/whereisthesun/app-beach-search.js
/* SUNNY app, part 9 of 14: home country, sunny beach search and results.
 * Names here are page-wide and shared by every app-*.js file; startSunny in app.js runs each part's step in order. */
"use strict";
  function fetchHomeCountry(lat, lon) {
    var url = GEOCODE_URL + "?latitude=" + lat + "&longitude=" + lon + "&localityLanguage=en";
    return fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("geocode");
        return res.json();
      })
      .then((data) => {
        homeCountry = parseCountryPayload(data, false);
        if (homeCountry) return homeCountry;
        throw new Error("empty country");
      })
      .catch(() => {
        return fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + lat + "&lon=" + lon + "&zoom=3")
          .then((res) => {
            if (!res.ok) throw new Error("nominatim");
            return res.json();
          })
          .then((data) => {
            homeCountry = parseCountryPayload(data, true);
            return homeCountry;
          });
      })
      .catch(() => {
        homeCountry = null;
        return null;
      });
  }
  function ensureHomeCountry() {
    if (homeCountry && homeCountry.code) return Promise.resolve(homeCountry);
    if (!sunnyApp_origin) return Promise.resolve(null);
    return fetchHomeCountry(sunnyApp_origin.lat, sunnyApp_origin.lon);
  }
  function isSunnyBeach(b) {
    return !!(b && b.isDay && b.cloud != null && b.cloud < SUNNY_CLOUD);
  }
  function sunnySortCmp(a, b) {
    var ca = a && a.cloud != null ? a.cloud : 999;
    var cb = b && b.cloud != null ? b.cloud : 999;
    if (ca !== cb) return ca - cb;
    return (a.dist || 0) - (b.dist || 0);
  }
  function excludeCode() {
    return isIntl() && homeCountry && homeCountry.code ? homeCountry.code : null;
  }
  function countryLabel() {
    return (homeCountry && (homeCountry.name || homeCountry.code)) || "your country";
  }
  function searchRadii() {
    return isIntl() ? [300000, 800000, 1500000, 2500000] : [200000, 500000, 1000000];
  }
  function pickNearestSunnyFrom(list, assumeForeign) {
    var rows = list || [];
    if (isIntl()) {
      rows = rows.filter((b) => { return isForeignBeach(b, assumeForeign); });
    } else {
      rows = beachesForMode(rows);
    }
    var sunny = rows.filter(isSunnyBeach);
    if (!sunny.length) return null;
    sunny.sort(sunnySortCmp);
    return sunny[0];
  }
  function pickNearestBeachFrom(list, assumeForeign) {
    var rows = list || [];
    if (isIntl()) {
      rows = rows.filter((b) => { return isForeignBeach(b, assumeForeign); });
    } else {
      rows = beachesForMode(rows);
    }
    if (!rows.length) return null;
    rows.sort((a, b) => { return a.dist - b.dist; });
    return rows[0];
  }
  function finishBeach(b, kind) {
    placeDest(b);
    map.flyTo({ center: [b.lon, b.lat], zoom: Math.max(map.getZoom(), 11), speed: 0.9 });
    showPopup(b);
    var prefix = kind === "sunny" ? "Sunny: " : "Nearest: ";
    /* No Wikipedia on Find / list / preview cycle — hourly only. Wiki via map dwell/click. */
    enrichBeach(b, false).then(() => {
      return fetchHourly(b.lat, b.lon);
    }).then((data) => {
      var line = sunForecast(data);
      var cloud = b.cloud != null ? Math.round(b.cloud) + "% cloudy · " : "";
      setStatus(prefix + b.name + " · " + formatKm(b.dist) + refWords() + " · " + cloud + line);
    }).catch(() => {
      setStatus(prefix + b.name + " · " + formatKm(b.dist) + refWords());
    });
  }
  function refWords() {
    return window.SunnyBeachRef ? " " + window.SunnyBeachRef.words() : "";
  }
  function unlockSearch() {
    searchingSunny = false;
    btnSun.disabled = false;
    if (btnAll) btnAll.disabled = false;
  }
  function filterSunnyRows(list, assumeForeign) {
    var rows = list || [];
    if (isIntl()) {
      rows = rows.filter((b) => { return isForeignBeach(b, assumeForeign); });
    } else {
      rows = beachesForMode(rows);
    }
    return rows.filter(isSunnyBeach).sort(sunnySortCmp);
  }
  function bumpWxSearchGen() {
    wxSearchGen += 1;
    if (wxFetchAbort) {
      try { wxFetchAbort.abort(); } catch (eAb) {}
      wxFetchAbort = null;
    }
  }
  function weatherCollectSunny(list, assumeForeign, wantCount, genToken) {
    var want = wantCount || SUNNY_PICK_CAP;
    var found = [];
    var i = 0;
    var myGen = genToken != null ? genToken : wxSearchGen;
    if (wxFetchAbort) {
      try { wxFetchAbort.abort(); } catch (eOld) {}
    }
    wxFetchAbort = typeof AbortController !== "undefined" ? new AbortController() : null;
    var signal = wxFetchAbort ? wxFetchAbort.signal : null;
    function stale() {
      return myGen !== wxSearchGen;
    }
    function absorb(wx) {
      if (stale()) return;
      filterSunnyRows(wx, assumeForeign).forEach((b) => {
        if (found.length >= want) return;
        if (found.some((x) => { return x.id === b.id; })) return;
        found.push(b);
      });
    }
    function step() {
      if (stale()) return Promise.resolve(found.slice(0, want));
      if (found.length >= want || i >= list.length) {
        found.sort(sunnySortCmp);
        return Promise.resolve(found.slice(0, want));
      }
      /* opt38: don't start a new sunny weather batch mid pan/zoom */
      if (mapGesturing) {
        return new Promise((resolve) => {
          setTimeout(resolve, 180);
        }).then(step);
      }
      var chunk = list.slice(i, i + WX_BATCH);
      i += chunk.length;
      setStatus("Checking the sun… " + Math.min(i, list.length) + "/" + list.length);
      /* opt14: one batch at a time + timeout; always settle so UI never sticks at N/400 */
      return fetchCurrentWeather(chunk, signal).catch((err) => {
        if (err && err.name === "AbortError") return [];
        console.error(err);
        return [];
      }).then((wx) => {
        if (stale()) return found.slice(0, want);
        if (wx && wx.length) absorb(wx);
        /* keep going even if this batch was empty/timed out */
        return step();
      });
    }
    return step().then((rows) => {
      return rows || found.slice(0, want);
    }).catch((err) => {
      console.error(err);
      found.sort(sunnySortCmp);
      return found.slice(0, want);
    });
  }
  function closeSunnySheet() {
    if (!sunnySheet) return;
    sunnySheet.hidden = true;
    if (sunnySheetList) {
      var items = sunnySheetList.querySelectorAll(".sheet-item");
      for (var ci = 0; ci < items.length; ci++) items[ci].classList.remove("is-active");
    }
    sheetListRows = [];
  }
  function markSunnyActive(btn) {
    if (!sunnySheetList) return;
    var items = sunnySheetList.querySelectorAll(".sheet-item");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("is-active", items[i] === btn);
    }
  }
  function previewSunnyBeach(b, btn) {
    markSunnyActive(btn);
    if (btn && typeof btn.scrollIntoView === "function") {
      try { btn.scrollIntoView({ block: "nearest" }); } catch (eScroll) {}
    }
    finishBeach(b, sheetSunnyMode ? "sunny" : "near");
  }
  function advanceSunnySheet() {
    if (!sunnySheet || sunnySheet.hidden || !sunnySheetList) return false;
    var items = sunnySheetList.querySelectorAll(".sheet-item");
    if (!items.length || !sheetListRows.length) return false;
    var wantSunny = sunnyModeOn();
    if (wantSunny !== sheetSunnyMode) return false;
    var active = -1;
    var i;
    for (i = 0; i < items.length; i++) {
      if (items[i].classList.contains("is-active")) {
        active = i;
        break;
      }
    }
    if (active < 0) active = 0;
    var next = (active + 1) % items.length;
    var b = sheetListRows[next];
    if (!b) return false;
    previewSunnyBeach(b, items[next]);
    return true;
  }
  function shortBeachName(name, maxLen) {
    maxLen = maxLen || 40;
    var s = String(name == null ? "" : name).replace(/^\s+|\s+$/g, "");
    if (s.length <= maxLen) return s;
    var prefix = "Beach near ";
    if (s.indexOf(prefix) === 0) {
      var place = s.slice(prefix.length);
      var room = maxLen - prefix.length - 1;
      if (room < 8) room = 8;
      if (place.length > room) {
        place = place.slice(0, room).replace(/\s+$/g, "") + "…";
      }
      return prefix + place;
    }
    return s.slice(0, maxLen - 1).replace(/\s+$/g, "") + "…";
  }
  function fillSheetItem(btn, b, idx) {
    var cloud = b.cloud != null ? Math.round(b.cloud) + "% cloudy" : "—";
    var label = shortBeachName(b.name || "Beach", 40);
    var spans = btn.children;
    if (spans && spans.length >= 3) {
      spans[0].textContent = label;
      spans[1].textContent = formatKm(b.dist);
      spans[2].textContent = "#" + (idx + 1) + " · " + cloud;
    } else {
      btn.innerHTML = "<span>" + escapeHtml(label) + "</span>" +
        "<span class=\"dist\">" + escapeHtml(formatKm(b.dist)) + "</span>" +
        "<span class=\"meta\">#" + (idx + 1) + " · " + escapeHtml(cloud) + "</span>";
    }
    btn.title = b.name || "Beach";
    btn._beach = b;
  }
  function openSunnySheet(list, sunnyMode) {
    sheetSunnyMode = sunnyMode !== false;
    sheetListRows = list ? list.slice() : [];
    if (sheetSunnyMode && (!list || !list.length)) {
      sheetListRows = [];
      if (sunnySheet) sunnySheet.hidden = true;
      if (sunnySheetList) {
        /* keep pooled rows; just hide sheet */
        var dead = sunnySheetList.querySelectorAll(".sheet-item");
        for (var di = 0; di < dead.length; di++) dead[di].classList.remove("is-active");
      }
      setStatus("No beaches under 20% cloud nearby");
      return;
    }
    if (!sunnySheet || !sunnySheetList) {
      if (list && list[0]) finishBeach(list[0], sheetSunnyMode ? "sunny" : "near");
      return;
    }
    if (sunnySheetTitle) {
      sunnySheetTitle.textContent = sheetSunnyMode ? "Sunny beaches" : "Nearest beaches";
    }
    if (sunnySheetSub) {
      if (sheetSunnyMode) {
        sunnySheetSub.textContent = list.length === 1
          ? "1 sunny beach. Tap to show on map."
          : list.length + " sunny beaches. Tap one, map stays live.";
      } else {
        sunnySheetSub.textContent = list.length === 1
          ? "1 beach. Tap to show on map."
          : list.length + " nearest beaches. Tap one, map stays live.";
      }
    }
    /* opt12: reuse existing row nodes instead of wiping innerHTML */
    var existing = sunnySheetList.children;
    var i, li, btn, b;
    for (i = 0; i < list.length; i++) {
      b = list[i];
      if (i < existing.length) {
        li = existing[i];
        btn = li.querySelector(".sheet-item") || li.firstElementChild;
        if (!btn) {
          btn = document.createElement("button");
          btn.type = "button";
          btn.className = "sheet-item";
          btn.addEventListener("click", (ev) => {
            var el = ev.currentTarget;
            previewSunnyBeach(el._beach, el);
          });
          li.appendChild(btn);
        }
        fillSheetItem(btn, b, i);
        btn.classList.remove("is-active");
      } else {
        li = document.createElement("li");
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sheet-item";
        fillSheetItem(btn, b, i);
        btn.addEventListener("click", (ev) => {
          var el = ev.currentTarget;
          previewSunnyBeach(el._beach, el);
        });
        li.appendChild(btn);
        sunnySheetList.appendChild(li);
      }
    }
    while (sunnySheetList.children.length > list.length) {
      sunnySheetList.removeChild(sunnySheetList.lastChild);
    }
    sunnySheet.hidden = false;
    if (list[0]) {
      var firstBtn = sunnySheetList.querySelector(".sheet-item");
      previewSunnyBeach(list[0], firstBtn);
    }
    // Prefetch current weather for top rows (uses currentWxCache). Non-blocking.
    try {
      var pref = [];
      var nPref = Math.min(8, list.length);
      var pi, pb;
      for (pi = 0; pi < nPref; pi++) {
        pb = list[pi];
        if (!pb) continue;
        if (sheetSunnyMode && pb.cloud != null) continue;
        if (getCachedCurrentWx(pb.lat, pb.lon)) continue;
        pref.push(pb);
      }
      if (pref.length) {
        fetchCurrentWeather(pref).catch(() => {});
      }
    } catch (ePref) {}
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function weatherNearestSunny(list) {
    return weatherCollectSunny(list, true, 1).then((rows) => {
      return rows[0] || null;
    });
  }
  function modeSortedBeaches(list, assumeForeign) {
    var rows = list || [];
    if (isIntl()) {
      rows = rows.filter((b) => { return isForeignBeach(b, assumeForeign); });
    } else {
      rows = beachesForMode(rows);
    }
    rows = rows.slice().sort((a, b) => { return a.dist - b.dist; });
    return rows;
  }
  function searchBeachesFar(wantSunny) {
    var radii = searchRadii();
    var maxR = radii[radii.length - 1];
    var only = homeOnlyCode();
    var code = only ? null : excludeCode();
    var where = isIntl() ? " outside " + countryLabel() : "";
    var km = Math.round(maxR / 1000);
    bumpWxSearchGen();
    var myGen = wxSearchGen;
    setStatus((wantSunny ? "No sun close by. " : "") + "Looking" + where + ", within " + km + " km…");
    fetchBeaches(sunnyApp_origin.lat, sunnyApp_origin.lon, maxR, false, code, null, 400, null, only)
      .then((list) => {
        if (myGen !== wxSearchGen) { unlockSearch(); return; }
        if (!wantSunny) {
          var nearList = modeSortedBeaches(list, true).slice(0, SUNNY_PICK_CAP);
          unlockSearch();
          if (nearList.length) {
            setStatus(nearList.length === 1 ? "1 beach found. Pick it on the list." : nearList.length + " beaches found. Pick one.");
            openSunnySheet(nearList, false);
          } else {
            setStatus("Couldn't find a beach" + where + " within " + km + " km.");
          }
          return;
        }
        if (!list || !list.length) {
          unlockSearch();
          setStatus("No beaches under 20% cloud nearby");
          return;
        }
        return weatherCollectSunny(list, true, SUNNY_PICK_CAP, myGen).then((rows) => {
          if (myGen !== wxSearchGen) { unlockSearch(); return; }
          unlockSearch();
          if (rows && rows.length) {
            setStatus(rows.length === 1 ? "1 sunny beach found." : rows.length + " sunny beaches found. Pick one.");
            openSunnySheet(rows, true);
          } else {
            setStatus("No beaches under 20% cloud nearby");
          }
        });
      })
      .catch((err) => {
        console.error(err);
        unlockSearch();
        if (!beachDb) return;
        if (wantSunny) {
          setStatus("No beaches under 20% cloud nearby");
        } else {
          setStatus("Couldn't find a beach" + where + " within " + km + " km.");
        }
      });
  }
  function fitBeaches(list) {
    if (!list || !list.length) return;
    if (list.length === 1) {
      map.flyTo({ center: [list[0].lon, list[0].lat], zoom: Math.max(map.getZoom(), 11), speed: 0.9 });
      return;
    }
    var bounds = new maplibregl.LngLatBounds([list[0].lon, list[0].lat], [list[0].lon, list[0].lat]);
    list.forEach((b) => { bounds.extend([b.lon, b.lat]); });
    map.fitBounds(bounds, {
      padding: { top: 90, left: 28, right: 190, bottom: 240 },
      maxZoom: 12,
      duration: 900
    });
  }
  function viewBbox() {
    var b = map.getBounds();
    return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  }
  function viewDiagonalKm() {
    var b = viewBbox();
    return haversineKm(b.south, b.west, b.north, b.east);
  }
  function mergeBeaches(list) {
    var seen = {};
    beaches.forEach((b) => { seen[b.id] = true; });
    (list || []).forEach((b) => {
      if (!b || seen[b.id]) return;
      if (sunnyApp_origin) b.dist = haversineKm(sunnyApp_origin.lat, sunnyApp_origin.lon, b.lat, b.lon);
      beaches.push(b);
      beachByIdMap[String(b.id)] = b;
      seen[b.id] = true;
    });
  }
  function viewStatus() {
    var n = inViewList(beaches).length;
    var msg = n === 1 ? "1 beach in view." : n + " beaches in view.";
    if (!n) msg = "Zoom in a bit to load beaches in this view.";
    setStatus(msg);
  }
  function syncAllBtn() {
    if (!btnAll) return;
    btnAll.setAttribute("aria-pressed", allMode ? "true" : "false");
    if (allMode) btnAll.classList.add("is-on");
    else btnAll.classList.remove("is-on");
    if (!allMode) btnAll.classList.remove("is-busy");
  }
  function loadViewBeaches() {
    if (!allMode) return;
    var gen = ++viewGen;
    function run() {
      if (!allMode || gen !== viewGen) return;
      var z = map.getZoom();
      var diag = viewDiagonalKm();
      if (z < 3.4 || diag > 4500) {
        if (btnAll) btnAll.classList.remove("is-busy");
        paintBeaches(beaches);
        if (gen !== viewGen) return;
        var n = inViewList(beaches).length;
        if (n) setStatus(n === 1 ? "1 beach in view." : n + " beaches in view.");
        else setStatus("Zoom in a bit to load beaches in this view.");
        return;
      }
      var qb = viewBbox();
      var cap = z < 6 ? 220 : 400;
      var center = map.getCenter();
      var only = homeOnlyCode();
      if (btnAll) btnAll.classList.add("is-busy");
      if (!beachDb) setStatus("Loading beaches in view…");
      if (viewAbort) viewAbort.abort();
      viewAbort = new AbortController();
      fetchBeaches(center.lat, center.lng, null, false, null, qb, cap, viewAbort.signal, only)
        .then((list) => {
          beaches = nearbyBeaches.slice();
          mergeBeaches(list);
          if (gen !== viewGen) return;
          if (btnAll) btnAll.classList.remove("is-busy");
          paintBeaches(beaches);
          viewStatus();
        })
        .catch((err) => {
          if (err && err.name === "AbortError") return;
          console.error(err);
          if (gen !== viewGen) return;
          if (btnAll) btnAll.classList.remove("is-busy");
          paintBeaches(beaches);
          if (!beachDb) return;
          setStatus("Couldn't load beaches in this view. Try again in a bit.");
        });
    }
    if (!isIntl()) ensureHomeCountry().then(run);
    else run();
  }
  function showAllBeaches() {
    if (searchingSunny) return;
    allMode = !allMode;
    syncAllBtn();
    if (!allMode) {
      viewGen += 1;
      if (viewAbort) viewAbort.abort();
      beaches = nearbyBeaches.slice();
      paintBeaches(beaches);
      var visOff = beachesForMode(beaches);
      var n = visOff.length;
      if (n) {
        var nSunny = visOff.filter(isSunnyBeach).length;
        var sunBit = nSunny === 0 ? "none look sunny right now" : (nSunny === 1 ? "1 looks sunny" : nSunny + " look sunny");
        var nBit = n === 1 ? "1 beach nearby, " : n + " beaches nearby, ";
        setStatus(nBit + sunBit + ".");
      } else {
        setStatus("All beaches off. Pan the map, or hit Locate me.");
      }
      return;
    }
    loadViewBeaches();
  }
  function sunnyModeOn() {
    return !toggleSunny || toggleSunny.checked;
  }
  /* opt75: no location yet, so search around the map centre instead of doing nothing */
  function beachesAtMapCentre() {
    var c = map.getCenter();
    setStatus("Location is off, so searching around the map centre.");
    loadAround(c.lat, c.lng);
  }
  function goNearestBeaches() {
    if (searchingSunny) { setStatus("Still looking for beaches…"); return; }
    if (!sunnyApp_origin) { beachesAtMapCentre(); return; }
    // Repeated Find: cycle next beach in the open sheet (wrap); else search.
    if (advanceSunnySheet()) return;
    bumpWxSearchGen();
    ensureHomeCountry().then(() => {
      var wantSunny = sunnyModeOn();
      if (wantSunny) {
        var localSunny = filterSunnyRows(nearbyBeaches, false);
        if (localSunny.length >= 3) {
          setStatus(localSunny.length + " sunny beaches nearby. Pick one.");
          openSunnySheet(localSunny.slice(0, SUNNY_PICK_CAP), true);
          return;
        }
        searchingSunny = true;
        btnSun.disabled = true;
        if (localSunny.length) {
          setStatus("Found " + localSunny.length + " nearby. Looking farther for more…");
        }
        searchBeachesFar(true);
        return;
      }
      var localNear = modeSortedBeaches(nearbyBeaches, false);
      if (localNear.length >= 3) {
        var pick = localNear.slice(0, SUNNY_PICK_CAP);
        setStatus(pick.length === 1 ? "1 beach nearby. Pick it on the list." : pick.length + " beaches nearby. Pick one.");
        openSunnySheet(pick, false);
        return;
      }
      searchingSunny = true;
      btnSun.disabled = true;
      if (localNear.length) {
        setStatus("Found " + localNear.length + " nearby. Looking farther for more…");
      }
      searchBeachesFar(false);
    });
  }
  function maybeLocalBeachForecast() {
    if (!sunnyApp_origin || !nearbyBeaches.length) return;
    var closest = nearbyBeaches[0];
    if (closest.dist > 1.5) return;
    fetchHourly(closest.lat, closest.lon).then((data) => {
      var line = sunForecast(data);
      var here = closest.cloud != null ? closest.name + " is " + Math.round(closest.cloud) + "% cloudy. " : "";
      setStatus(here + line);
    }).catch(() => {});
  }
