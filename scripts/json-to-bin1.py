#!/usr/bin/env python3
"""Convert data/r*.json.gz region shards to SNY1 little-endian binary + gzip.

Format bin1 (magic SNY1):
  magic: 4 bytes "SNY1"
  count: uint32 LE
  records:
    idLen:uint16 LE + id UTF-8
    nameLen:uint16 LE + name UTF-8
    lat:float64 LE, lon:float64 LE
    countryLen:uint8 + country UTF-8 (0 or 2 chars)
Updates data/manifest.json with format:"bin1" and file -> *.bin.gz (keeps fileJson).
"""
import gzip, json, struct
from pathlib import Path

MAGIC = b"SNY1"
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MANIFEST = DATA / "manifest.json"

def encode_rows(rows):
    parts = [MAGIC, struct.pack("<I", len(rows))]
    for r in rows:
        if isinstance(r, (list, tuple)):
            rid = str(r[0]) if r[0] is not None else ""
            name = "" if r[1] is None else str(r[1])
            lat = float(r[2]); lon = float(r[3])
            country = "" if len(r) < 5 or r[4] is None else str(r[4]).upper()[:2]
        else:
            rid = str(r.get("id", ""))
            name = "" if r.get("name") is None else str(r.get("name"))
            lat = float(r["lat"]); lon = float(r["lon"])
            c = r.get("country")
            country = "" if not c else str(c).upper()[:2]
        id_b = rid.encode("utf-8")
        name_b = name.encode("utf-8")
        country_b = country.encode("utf-8")[:2]
        parts += [struct.pack("<H", len(id_b)), id_b,
                  struct.pack("<H", len(name_b)), name_b,
                  struct.pack("<dd", lat, lon),
                  struct.pack("<B", len(country_b)), country_b]
    return b"".join(parts)

def main():
    man = json.loads(MANIFEST.read_text())
    regions = man.get("regions") or []
    n = 0
    for reg in regions:
        jfile = reg.get("fileJson") or reg.get("file") or f"data/{reg['id']}.json.gz"
        if jfile.endswith(".bin.gz"):
            jfile = f"data/{reg['id']}.json.gz"
        jpath = ROOT / jfile
        if not jpath.exists():
            jpath = DATA / f"{reg['id']}.json.gz"
        with gzip.open(jpath, "rt", encoding="utf-8") as f:
            data = json.load(f)
        rows = data if isinstance(data, list) else data.get("beaches") or []
        out_name = reg["id"] + ".bin.gz"
        with gzip.open(DATA / out_name, "wb", compresslevel=9) as g:
            g.write(encode_rows(rows))
        reg["file"] = "data/" + out_name
        reg["fileJson"] = "data/" + reg["id"] + ".json.gz"
        n += 1
    man["format"] = "bin1"
    man["v"] = "region1-bin1"
    MANIFEST.write_text(json.dumps(man, separators=(",", ":")))
    print("converted", n)

if __name__ == "__main__":
    main()
