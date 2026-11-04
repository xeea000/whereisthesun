#!/usr/bin/env python3
"""Build data/ca-cell/overview.json — 0.5° aggregates of every ISED site tile for low-zoom LOD (opt207).
Derived only from the existing per-degree tiles; no invented sites. Compact rows:
  [lat, lon, n, h, b, t, bd, r]
  lat/lon = cell centre; n = site count; h = max structure height m;
  b = brand bitmask; t = tech bitmask; bd = band-reach bitmask; r = max estimated reach m.
"""
from __future__ import annotations
import json, math, glob, os

ROOT = os.path.join(os.path.dirname(__file__), "..")
CELL = os.path.join(ROOT, "data", "ca-cell")
STEP = 0.5
REACH = ((1, 8000), (2, 3000), (4, 1200), (8, 300))


def reach_m(bands: int, h: float | None) -> int:
    r = 0
    for bit, d in REACH:
        if bands & bit:
            r = max(r, d)
    return int(min(r, 4120 * (math.sqrt(h or 30) + math.sqrt(1.5))))


def main() -> None:
    man = json.load(open(os.path.join(CELL, "manifest.json")))
    cells: dict[tuple[float, float], dict] = {}
    n_sites = 0
    for path in glob.glob(os.path.join(CELL, "[0-9]*.json")):
        for row in json.load(open(path)):
            lat, lon = row[0], row[1]
            key = (math.floor(lat / STEP) * STEP, math.floor(lon / STEP) * STEP)
            c = cells.get(key)
            if c is None:
                c = {"n": 0, "h": 0, "b": 0, "t": 0, "bd": 0, "r": 0}
                cells[key] = c
            c["n"] += 1
            n_sites += 1
            h = row[4] or 0
            c["h"] = max(c["h"], h)
            c["b"] |= row[2]
            c["t"] |= row[3]
            bd = 0
            for x in row[8] or []:
                bd |= x[2]
            c["bd"] |= bd
            c["r"] = max(c["r"], reach_m(bd, h))
    out_rows = []
    for (lat0, lon0), v in cells.items():
        out_rows.append([
            round(lat0 + STEP / 2, 3),
            round(lon0 + STEP / 2, 3),
            v["n"],
            int(v["h"]),
            v["b"],
            v["t"],
            v["bd"],
            v["r"],
        ])
    out_rows.sort(key=lambda r: (-r[2], r[0], r[1]))
    out = {
        "step": STEP,
        "date": man.get("date"),
        "rev": man.get("rev"),
        "count": n_sites,
        "cells": out_rows,
    }
    dest = os.path.join(CELL, "overview.json")
    raw = json.dumps(out, separators=(",", ":"))
    open(dest, "w").write(raw)
    print(f"wrote {dest} sites={n_sites} cells={len(out_rows)} bytes={len(raw)}")


if __name__ == "__main__":
    main()
