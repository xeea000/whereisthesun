// workspace/whereisthesun/tools/data-hashes.js
/* opt109: writes data-hashes.json, a short content hash for every file under data/.
 * The service worker keeps each data file forever under that hash and fetches it again only when it changes. */
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const root = path.join(__dirname, ".."), out = {};
const walk = (d) => {
  fs.readdirSync(path.join(root, d), { withFileTypes: true }).forEach((e) => {
    const p = d + "/" + e.name;
    if (e.isDirectory()) walk(p);
    else if (!/README/.test(e.name)) out[p] = crypto.createHash("sha1").update(fs.readFileSync(path.join(root, p))).digest("hex").slice(0, 8);
  });
};
walk("data");
fs.writeFileSync(path.join(root, "data-hashes.json"), JSON.stringify(out));
/* opt174: any source string "data/<file>?v=<token>" gets the file's content hash as its token, so data URLs never need a manual bump. */
let bumped = 0;
fs.readdirSync(root).filter((f) => /\.js$/.test(f)).forEach((f) => {
  const fp = path.join(root, f), src = fs.readFileSync(fp, "utf8");
  const nx = src.replace(/(["'`])(data\/[A-Za-z0-9_./-]+)\?v=[A-Za-z0-9]+/g, (m, q, rel) => { return out[rel] ? q + rel + "?v=" + out[rel] : m; });
  if (nx !== src) { fs.writeFileSync(fp, nx); bumped++; }
});
console.log(bumped + " sources re-versioned");
console.log(Object.keys(out).length + " data files hashed");
