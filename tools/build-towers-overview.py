#!/usr/bin/env python3
"""Build data/world/towers-ov.json — cluster centroids of short towers for low-zoom LOD.
No grid. Row: [lat, lon, n, h, k] max height bucket + top type letter."""
from __future__ import annotations
import json, math, glob, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
TILES = os.path.join(ROOT, "data", "world", "towers-t")
JOIN_KM = 40.0
JOIN_DEG = JOIN_KM / 111.0
CELL_S = JOIN_DEG


def main() -> None:
    pts = []
    for path in sorted(glob.glob(os.path.join(TILES, "*", "t.p.json"))):
        j = json.load(open(path))
        codes = j["codes"]
        a = o = 0
        for i in range(j["n"]):
            a += j["lat"][i]; o += j["lon"][i]
            code = codes[j["c"][i]]
            typ = code[0] if code else "o"
            try: h = int("".join(ch for ch in code[1:] if ch.isdigit()) or "0")
            except Exception: h = 0
            pts.append((a / 1e5, o / 1e5, h, typ))
    pts.sort(key=lambda p: -p[2])
    clusters, buckets = [], {}
    join2 = JOIN_DEG * JOIN_DEG

    def nearby(lat, lon):
        i0, j0 = math.floor(lat / CELL_S), math.floor(lon / CELL_S)
        best, best_d2 = None, join2
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for ci in buckets.get((i0 + di, j0 + dj), ()):
                    c = clusters[ci]
                    d2 = (c["lat"] - lat) ** 2 + (c["lon"] - lon) ** 2
                    if d2 < best_d2: best, best_d2 = ci, d2
        return best

    for lat, lon, h, typ in pts:
        ci = nearby(lat, lon)
        if ci is None:
            ci = len(clusters)
            clusters.append({"lat": lat, "lon": lon, "sum_lat": lat, "sum_lon": lon, "n": 1, "h": h, "codes": {typ: 1}})
            buckets.setdefault((math.floor(lat / CELL_S), math.floor(lon / CELL_S)), []).append(ci)
        else:
            c = clusters[ci]
            oi, oj = math.floor(c["lat"] / CELL_S), math.floor(c["lon"] / CELL_S)
            c["sum_lat"] += lat; c["sum_lon"] += lon; c["n"] += 1
            c["lat"] = c["sum_lat"] / c["n"]; c["lon"] = c["sum_lon"] / c["n"]
            c["h"] = max(c["h"], h)
            c["codes"][typ] = c["codes"].get(typ, 0) + 1
            ni, nj = math.floor(c["lat"] / CELL_S), math.floor(c["lon"] / CELL_S)
            if (ni, nj) != (oi, oj):
                lst = buckets.get((oi, oj), [])
                if ci in lst: lst.remove(ci)
                buckets.setdefault((ni, nj), []).append(ci)

    rows = [[round(c["lat"], 4), round(c["lon"], 4), c["n"], c["h"], max(c["codes"], key=c["codes"].get)] for c in clusters]
    rows.sort(key=lambda r: (-r[2], -r[3], r[0], r[1]))
    out = {"mode": "cluster", "join_km": JOIN_KM, "count": len(pts), "kept": len(rows), "pts": rows}
    dest = os.path.join(ROOT, "data", "world", "towers-ov.json")
    raw = json.dumps(out, separators=(",", ":"))
    open(dest, "w").write(raw)
    print(f"wrote {dest} pts={len(pts)} clusters={len(rows)} bytes={len(raw)}")


if __name__ == "__main__":
    main()
