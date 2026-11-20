#!/usr/bin/env python3
"""Build data/civic/popdens.webp from GHSL GHS-POP 2020 (1 km, Mollweide).

Source (free, CC BY 4.0, European Commission JRC):
  https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E2020_GLOBE_R2023A_54009_1000/V1-0/GHS_POP_E2020_GLOBE_R2023A_54009_1000_V1_0.zip

The 1 km cells are people per square kilometre. This script warps that grid to a
4096 px Web Mercator canvas (about 10 km at the equator) with average resampling,
then colour-maps log(density) to a transparent WebP. Uninhabited cells stay clear.

Usage: python3 tools/build-popdens.py [path-to-tif-or-zip]
If no path is given, looks in /workspace/t435/raw/.
"""
from __future__ import annotations

import math
import os
import sys
import zipfile

import numpy as np
from osgeo import gdal
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "civic", "popdens.webp")
MERC = 20037508.342789244
SIZE = 4096
STOPS = np.array([
    # people/km2, r, g, b, a
    [1.0, 255, 236, 170, 70],
    [10.0, 255, 200, 70, 130],
    [50.0, 255, 140, 35, 170],
    [200.0, 230, 55, 28, 200],
    [1000.0, 175, 8, 45, 220],
    [5000.0, 115, 0, 85, 235],
    [20000.0, 70, 0, 110, 245],
], dtype=np.float64)


def find_source(arg: str | None) -> str:
    cands = []
    if arg:
        cands.append(arg)
    raw = "/workspace/t435/raw"
    cands.extend([
        os.path.join(raw, "pop-merc-4096.tif"),
        os.path.join(raw, "ghsl", "GHS_POP_E2020_GLOBE_R2023A_54009_1000_V1_0.tif"),
        os.path.join(raw, "GHS_POP_E2020_GLOBE_R2023A_54009_1000_V1_0.zip"),
    ])
    for p in cands:
        if p and os.path.isfile(p):
            return p
    raise SystemExit("GHSL tif or zip not found. Download the 2020 1 km zip and pass its path.")


def warp_to_merc(src: str, dest: str) -> None:
    tif = src
    tmp = None
    if src.endswith(".zip"):
        tmp = os.path.join(os.path.dirname(dest), "_ghsl_src.tif")
        with zipfile.ZipFile(src) as z:
            name = [n for n in z.namelist() if n.lower().endswith(".tif") and ".ovr" not in n.lower()][0]
            print("unzip", name)
            with z.open(name) as f, open(tmp, "wb") as out:
                while True:
                    chunk = f.read(1024 * 1024 * 8)
                    if not chunk:
                        break
                    out.write(chunk)
        tif = tmp
    gdal.Warp(dest, tif, dstSRS="EPSG:3857",
              outputBounds=(-MERC, -MERC, MERC, MERC), width=SIZE, height=SIZE,
              resampleAlg="average", dstNodata=-200,
              warpOptions=["SOURCE_EXTRA=100"],
              creationOptions=["COMPRESS=LZW", "TILED=YES"])
    if tmp and os.path.isfile(tmp):
        os.remove(tmp)


def colorize(path: str) -> Image.Image:
    gdal.UseExceptions()
    ds = gdal.Open(path)
    band = ds.GetRasterBand(1)
    arr = band.ReadAsArray()
    nodata = band.GetNoDataValue()
    valid = np.isfinite(arr) & (arr > 0.05)
    if nodata is not None:
        valid &= (arr != nodata)
    dens = np.where(valid, arr.astype(np.float64), 0.0)
    out = np.zeros(dens.shape + (4,), dtype=np.uint8)
    mask = dens > 0.05
    v = np.clip(dens[mask], 1.0, STOPS[-1, 0])
    rgba = np.zeros((v.size, 4), dtype=np.float64)
    logv = np.log10(v)
    logx = np.log10(STOPS[:, 0])
    for c in range(4):
        rgba[:, c] = np.interp(logv, logx, STOPS[:, c + 1])
    out[mask] = np.clip(rgba, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def main() -> None:
    src = find_source(sys.argv[1] if len(sys.argv) > 1 else None)
    print("source", src)
    if os.path.basename(src) == "pop-merc-4096.tif":
        merc = src
    else:
        merc = os.path.join("/tmp", "pop-merc-4096.tif")
        print("warping to", merc)
        warp_to_merc(src, merc)
    img = colorize(merc)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, "WEBP", lossless=True, method=6)
    print("wrote", OUT, "bytes", os.path.getsize(OUT))


if __name__ == "__main__":
    main()
