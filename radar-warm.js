// workspace/whereisthesun/radar-warm.js
/* SUNNY radar frame loader (opt66). Radar Play draws only from whole-view frame images on
 * the Play canvas, never from map tiles. This loads those frames a few at a time, nearest
 * the playhead first (frames just ahead before frames behind), and shows a small
 * "Loading radar" note until every frame is in. Loaded frames stay cached by app.js. */
(function () {
  "use strict";
  var PARALLEL = 4;
  var TICK_MS = 120;
  var job = null;
  var note = null;
  function noteEl() {
    if (note) return note;
    note = document.createElement("div");
    note.className = "radar-loading-note";
    note.setAttribute("role", "status");
    note.setAttribute("aria-live", "polite");
    note.hidden = true;
    document.body.appendChild(note);
    return note;
  }
  function showNote(loaded, total) {
    var el = noteEl();
    el.textContent = "Loading radar " + loaded + " of " + total;
    el.hidden = false;
  }
  function hideNote() {
    if (note) note.hidden = true;
  }
  /* Order: nearest the playhead first; a frame ahead counts as half the distance of one behind */
  function score(center, i) {
    return i >= center ? i - center : (center - i) * 2 - 1;
  }
  function byScore(center, a, b) {
    return score(center, a) - score(center, b);
  }
  function order(center, count) {
    var list = [];
    for (var i = 0; i < count; i++) if (!job.keep || job.keep(i)) list.push(i);
    list.sort(byScore.bind(null, center));
    return list;
  }
  function step(j) {
    if (job !== j) return;
    if (!j.active()) {
      stop();
      return;
    }
    var count = j.count();
    var list = order(Math.max(0, Math.min(count - 1, j.center())), count);
    var loaded = 0;
    var inFlight = 0;
    var i;
    for (i = 0; i < list.length; i++) {
      var rec = j.peek(list[i]);
      if (rec && rec.done) loaded++;
      else if (rec) inFlight++;
    }
    for (i = 0; i < list.length && inFlight < PARALLEL; i++) {
      if (!j.peek(list[i])) {
        j.build(list[i]);
        inFlight++;
      }
    }
    if (loaded >= list.length) {
      hideNote();
      j.timer = setTimeout(step.bind(null, j), TICK_MS * 4);
      return;
    }
    showNote(loaded, list.length);
    j.timer = setTimeout(step.bind(null, j), TICK_MS);
  }
  /* opts: count(), center(), peek(i) → rec|null, build(i), active() → bool */
  function start(opts) {
    stop();
    job = { count: opts.count, center: opts.center, peek: opts.peek, build: opts.build, active: opts.active, keep: opts.keep, timer: 0 };
    step(job);
  }
  function stop() {
    if (job) clearTimeout(job.timer);
    job = null;
    hideNote();
  }
  window.SunnyRadarWarm = { start: start, stop: stop };
})();
