#!/usr/bin/env python3
"""Build data/packs/<layer>.ov.json — cluster centroids of pack points for low-zoom LOD.
No grid. Greedy ~JOIN_KM clusters; row [lat, lon, n, k] with top code letter."""
from __future__ import annotations
import json, math, glob, os, sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
PACKS = os.path.join(ROOT, "data", "packs")
JOIN_KM = 35.0
JOIN_DEG = JOIN_KM / 111.0
CELL_S = JOIN_DEG


def pack_pts(path: str):
    j = json.load(open(path))
    a = o = 0
    codes = j["codes"]
    out = []
    for i in range(j["n"]):
        a += j["lat"][i]
        o += j["lon"][i]
        out.append((a / 1e5, o / 1e5, codes[j["c"][i]]))
    return out


def build(layer: str) -> None:
    pts = []
    for path in sorted(glob.glob(os.path.join(PACKS, "*", f"{layer}.p.json"))):
        pts.extend(pack_pts(path))
    clusters = []
    buckets = {}
    join2 = JOIN_DEG * JOIN_DEG

    def nearby(lat, lon):
        i0, j0 = math.floor(lat / CELL_S), math.floor(lon / CELL_S)
        best, best_d2 = None, join2
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for ci in buckets.get((i0 + di, j0 + dj), ()):
                    c = clusters[ci]
                    d2 = (c["lat"] - lat) ** 2 + (c["lon"] - lon) ** 2
                    if d2 < best_d2:
                        best, best_d2 = ci, d2
        return best

    for lat, lon, code in pts:
        ci = nearby(lat, lon)
        if ci is None:
            ci = len(clusters)
            clusters.append({"lat": lat, "lon": lon, "sum_lat": lat, "sum_lon": lon, "n": 1, "codes": {code: 1}})
            buckets.setdefault((math.floor(lat / CELL_S), math.floor(lon / CELL_S)), []).append(ci)
        else:
            c = clusters[ci]
            oi, oj = math.floor(c["lat"] / CELL_S), math.floor(c["lon"] / CELL_S)
            c["sum_lat"] += lat; c["sum_lon"] += lon; c["n"] += 1
            c["lat"] = c["sum_lat"] / c["n"]; c["lon"] = c["sum_lon"] / c["n"]
            c["codes"][code] = c["codes"].get(code, 0) + 1
            ni, nj = math.floor(c["lat"] / CELL_S), math.floor(c["lon"] / CELL_S)
            if (ni, nj) != (oi, oj):
                lst = buckets.get((oi, oj), [])
                if ci in lst: lst.remove(ci)
                buckets.setdefault((ni, nj), []).append(ci)

    rows = []
    for c in clusters:
        top = max(c["codes"], key=c["codes"].get)
        rows.append([round(c["lat"], 4), round(c["lon"], 4), c["n"], top])
    rows.sort(key=lambda r: (-r[2], r[0], r[1]))
    out = {"mode": "cluster", "join_km": JOIN_KM, "count": len(pts), "kept": len(rows), "pts": rows}
    dest = os.path.join(PACKS, f"{layer}.ov.json")
    raw = json.dumps(out, separators=(",", ":"))
    open(dest, "w").write(raw)
    print(f"wrote {dest} pts={len(pts)} clusters={len(rows)} bytes={len(raw)}")


if __name__ == "__main__":
    for layer in (sys.argv[1:] or ["camps", "plaques"]):
        build(layer)
