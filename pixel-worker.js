// workspace/whereisthesun/pixel-worker.js
/* SUNNY pixel worker (opt247). Picture work that reads every pixel runs here instead of the page: fetch the
 * picture, draw it at the asked size on an OffscreenCanvas that keeps its pixels on the CPU, run a named job
 * on the pixels, and hand the result back as an ImageBitmap (transferred, not copied).
 * Jobs (pure functions over RGBA bytes):
 *   drop: colours listed in msg.drop (0xRRGGBB) become fully transparent (radar-key.js weak echoes)
 * Message in:  { id, job, url, w, h, drop }
 * Message out: { id, bmp } or { id, err } */
"use strict";
var sets = {};
function dropSet(list) {
  var key = list.join(",");
  if (!sets[key]) sets[key] = new Set(list);
  return sets[key];
}
var JOBS = {
  drop: (d, msg) => {
    var weak = dropSet(msg.drop);
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] && weak.has((d[i] << 16) | (d[i + 1] << 8) | d[i + 2])) d[i + 3] = 0;
    }
  }
};
function readBlob(res) {
  if (!res.ok) throw new Error("picture " + res.status);
  return res.blob();
}
function work(msg) {
  var job = JOBS[msg.job];
  if (!job) return Promise.reject(new Error("no job " + msg.job));
  return fetch(msg.url, { mode: "cors" }).then(readBlob).then(createImageBitmap).then((bmp) => {
    var c = new OffscreenCanvas(msg.w, msg.h);
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, msg.w, msg.h);
    if (bmp.close) bmp.close();
    var img = ctx.getImageData(0, 0, msg.w, msg.h);
    job(img.data, msg);
    ctx.putImageData(img, 0, 0);
    return c.transferToImageBitmap();
  });
}
function onJob(ev) {
  var msg = ev.data || {};
  work(msg).then((bmp) => {
    self.postMessage({ id: msg.id, bmp: bmp }, [bmp]);
  }, (err) => {
    self.postMessage({ id: msg.id, err: String(err && err.message || err) });
  });
}
self.onmessage = onJob;
