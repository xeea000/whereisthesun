#!/usr/bin/env python3
"""Build data/ca-cell/overview.json — cluster centroids of REAL ISED sites for low-zoom LOD (opt208).

No grid binning and no min-distance lattice. Greedy clustering: each site joins the nearest
open cluster within JOIN_KM (else starts a new one). Cluster anchor = mean lat/lon of members
(true geographic centroid). Tallest site's carrier/tech bits kept for filters. Reads as organic
blobs on towns and corridors.
Row: [lat, lon, n, h, b, t, bd, r]
"""
from __future__ import annotations
import json, math, glob, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
CELL = os.path.join(ROOT, "data", "ca-cell")
JOIN_KM = 22.0  # ~ town / local corridor scale
JOIN_DEG = JOIN_KM / 111.0
REACH = ((1, 8000), (2, 3000), (4, 1200), (8, 300))
CELL_S = JOIN_DEG


def reach_m(bands: int, h: float | None) -> int:
    r = 0
    for bit, d in REACH:
        if bands & bit:
            r = max(r, d)
    return int(min(r, 4120 * (math.sqrt(h or 30) + math.sqrt(1.5))))


def main() -> None:
    man = json.load(open(os.path.join(CELL, "manifest.json")))
    sites = []
    for path in glob.glob(os.path.join(CELL, "[0-9]*.json")):
        for row in json.load(open(path)):
            lat, lon = float(row[0]), float(row[1])
            h = row[4] or 0
            b, t = row[2], row[3]
            bd = 0
            for x in row[8] or []:
                bd |= x[2]
            sites.append((lat, lon, int(h), b, t, bd))
    # seed clusters with tallest first so anchors sit on real tall sites, then centroid drifts with members
    sites.sort(key=lambda s: -s[2])

    clusters: list[dict] = []
    buckets: dict[tuple[int, int], list[int]] = {}
    join2 = JOIN_DEG * JOIN_DEG

    def nearby(lat: float, lon: float) -> int | None:
        i0 = math.floor(lat / CELL_S)
        j0 = math.floor(lon / CELL_S)
        best = None
        best_d2 = join2
        span = 1
        for di in range(-span, span + 1):
            for dj in range(-span, span + 1):
                for ci in buckets.get((i0 + di, j0 + dj), ()):
                    c = clusters[ci]
                    d2 = (c["lat"] - lat) ** 2 + (c["lon"] - lon) ** 2
                    if d2 < best_d2:
                        best_d2 = d2
                        best = ci
        return best

    for lat, lon, h, b, t, bd in sites:
        ci = nearby(lat, lon)
        if ci is None:
            ci = len(clusters)
            clusters.append({
                "lat": lat, "lon": lon, "sum_lat": lat, "sum_lon": lon,
                "n": 1, "h": h, "b": b, "t": t, "bd": bd,
            })
            i0 = math.floor(lat / CELL_S)
            j0 = math.floor(lon / CELL_S)
            buckets.setdefault((i0, j0), []).append(ci)
        else:
            c = clusters[ci]
            # remove from old bucket cell before centroid moves
            oi, oj = math.floor(c["lat"] / CELL_S), math.floor(c["lon"] / CELL_S)
            c["sum_lat"] += lat
            c["sum_lon"] += lon
            c["n"] += 1
            c["lat"] = c["sum_lat"] / c["n"]
            c["lon"] = c["sum_lon"] / c["n"]
            c["h"] = max(c["h"], h)
            c["b"] |= b
            c["t"] |= t
            c["bd"] |= bd
            ni, nj = math.floor(c["lat"] / CELL_S), math.floor(c["lon"] / CELL_S)
            if (ni, nj) != (oi, oj):
                lst = buckets.get((oi, oj), [])
                if ci in lst:
                    lst.remove(ci)
                buckets.setdefault((ni, nj), []).append(ci)

    rows = []
    for c in clusters:
        rows.append([
            round(c["lat"], 4), round(c["lon"], 4), c["n"], c["h"],
            c["b"], c["t"], c["bd"], reach_m(c["bd"], c["h"]),
        ])
    rows.sort(key=lambda r: (-r[2], -r[3], r[0], r[1]))
    out = {
        "mode": "cluster",
        "join_km": JOIN_KM,
        "date": man.get("date"),
        "rev": man.get("rev"),
        "count": len(sites),
        "kept": len(rows),
        "pts": rows,
    }
    dest = os.path.join(CELL, "overview.json")
    raw = json.dumps(out, separators=(",", ":"))
    open(dest, "w").write(raw)
    print(f"wrote {dest} sites={len(sites)} clusters={len(rows)} join_km={JOIN_KM} bytes={len(raw)}")


if __name__ == "__main__":
    main()
