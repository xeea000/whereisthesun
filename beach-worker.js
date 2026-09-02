/* SUNNY beach-worker — gunzip + parse JSON or SNY1 binary; posts beach arrays. No deps. */
/* global self, DecompressionStream */

function gunzipToU8(buf) {
  var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
    if (typeof DecompressionStream === "undefined") {
      return Promise.reject(new Error("no decompress"));
    }
    var stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).arrayBuffer().then(function (ab) {
      return new Uint8Array(ab);
    });
  }
  return Promise.resolve(u8);
}

function decodeUtf8(u8, start, len) {
  return new TextDecoder().decode(u8.subarray(start, start + len));
}

function parseBin1(u8) {
  if (u8.length < 8) throw new Error("short bin");
  if (u8[0] !== 0x53 || u8[1] !== 0x4e || u8[2] !== 0x59 || u8[3] !== 0x31) {
    throw new Error("bad magic");
  }
  var view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  var count = view.getUint32(4, true);
  var off = 8;
  var out = new Array(count);
  var n = 0;
  var i, idLen, nameLen, id, name, lat, lon, cLen, country;
  for (i = 0; i < count; i++) {
    if (off + 2 > u8.length) break;
    idLen = view.getUint16(off, true); off += 2;
    id = decodeUtf8(u8, off, idLen); off += idLen;
    nameLen = view.getUint16(off, true); off += 2;
    name = decodeUtf8(u8, off, nameLen); off += nameLen;
    lat = view.getFloat64(off, true); off += 8;
    lon = view.getFloat64(off, true); off += 8;
    cLen = view.getUint8(off); off += 1;
    country = cLen ? decodeUtf8(u8, off, cLen).toUpperCase().slice(0, 2) : "";
    off += cLen;
    out[n++] = [id, name, lat, lon, country];
  }
  out.length = n;
  return out;
}

function parseJsonBytes(u8) {
  var text = new TextDecoder().decode(u8);
  var data = JSON.parse(text);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.beaches)) return data.beaches;
  throw new Error("beach list");
}

self.onmessage = function (ev) {
  var msg = ev.data || {};
  var id = msg.id;
  var url = msg.url;
  var format = msg.format || "auto";
  if (!url) {
    self.postMessage({ id: id, ok: false, error: "no url" });
    return;
  }
  fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error("beach list");
      return res.arrayBuffer();
    })
    .then(function (ab) {
      return gunzipToU8(ab);
    })
    .then(function (u8) {
      var rows;
      var looksBin = u8.length >= 4 && u8[0] === 0x53 && u8[1] === 0x4e && u8[2] === 0x59 && u8[3] === 0x31;
      if (format === "bin1" || (format === "auto" && looksBin)) {
        rows = parseBin1(u8);
      } else {
        rows = parseJsonBytes(u8);
      }
      self.postMessage({ id: id, ok: true, rows: rows });
    })
    .catch(function (err) {
      self.postMessage({ id: id, ok: false, error: (err && err.message) || "fail" });
    });
};
