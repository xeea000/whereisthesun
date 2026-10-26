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
console.log(Object.keys(out).length + " data files hashed");
