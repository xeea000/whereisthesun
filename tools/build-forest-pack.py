#!/usr/bin/env python3
"""Build SUNNY forest-pack tiles from GFW (CC BY 4.0).
Output: data/human/forest-pack/{z}/{x}/{y}.webp  (LA: L=year|(drv<<5), A=255 on loss)
         data/human/forest-pack/ifl/{z}/{x}/{y}.webp (LA: L=1, A=255 on intact)
         data/human/forest-pack/manifest.json
Empty loss tiles are omitted; manifest "have" lists the tiles that exist so the app never asks for a missing one.
--index-only rewrites "have" in the existing manifest from the files on disk.
"""
from __future__ import annotations
import io, json, math, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "human" / "forest-pack"
LOSS = "https://tiles.globalforestwatch.org/umd_tree_cover_loss/v1.11/tcd_30/{z}/{x}/{y}.png"
DRV = "https://tiles.globalforestwatch.org/tsc_tree_cover_loss_drivers/v2023/tcd_30/{z}/{x}/{y}.png"
IFL = "https://tiles.globalforestwatch.org/ifl_intact_forest_landscapes/v2025/default/{z}/{x}/{y}.png"
WORKERS = int(os.environ.get("FOREST_PACK_WORKERS", "16"))
MAX_MB = float(os.environ.get("FOREST_PACK_MAX_MB", "85"))
DO_IFL = os.environ.get("FOREST_PACK_IFL", "1") != "0"

REGIONS = [
  # global entry into live band (DPR often asks z+1)
  {"name": "world", "z0": 6, "z1": 6, "bbox": [-180, -85, 180, 85]},
  {"name": "canada", "z0": 7, "z1": 8, "bbox": [-141, 41, -52, 84]},
  {"name": "amazon", "z0": 7, "z1": 8, "bbox": [-75, -20, -45, 5]},
  {"name": "congo", "z0": 7, "z1": 8, "bbox": [8, -10, 32, 5]},
  {"name": "indonesia", "z0": 7, "z1": 8, "bbox": [95, -11, 141, 8]},
  {"name": "siberia", "z0": 7, "z1": 8, "bbox": [60, 50, 140, 72]},
  # Canada detail one more zoom (budget permitting)
  {"name": "canada9", "z0": 9, "z1": 9, "bbox": [-130, 48, -60, 60]},
]

def lon_to_x(lon, z):
  n = 2 ** z
  return int((lon + 180.0) / 360.0 * n)

def lat_to_y(lat, z):
  lat = max(min(lat, 85.05112878), -85.05112878)
  r = math.radians(lat)
  n = 2 ** z
  return int((1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * n)

def iter_tiles(z, west, south, east, north):
  x0, x1 = lon_to_x(west, z), lon_to_x(east, z)
  y0, y1 = lat_to_y(north, z), lat_to_y(south, z)
  if y0 > y1:
    y0, y1 = y1, y0
  n = 2 ** z
  x0 = max(0, x0); x1 = min(n - 1, x1)
  y0 = max(0, y0); y1 = min(n - 1, y1)
  for x in range(x0, x1 + 1):
    for y in range(y0, y1 + 1):
      yield z, x, y

def fetch(url, retries=3):
  last = None
  for i in range(retries):
    try:
      req = urllib.request.Request(url, headers={"User-Agent": "SUNNY-forest-pack/1.0 (CC BY rebuild)"})
      with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()
    except Exception as e:
      last = e
      time.sleep(0.4 * (i + 1))
  raise last

def pack_loss_drv(z, x, y):
  dest = OUT / str(z) / str(x) / f"{y}.webp"
  if dest.exists() and dest.stat().st_size > 20:
    return "skip", 0
  try:
    lb = fetch(LOSS.format(z=z, x=x, y=y))
  except Exception:
    return "err-loss", 0
  if len(lb) < 400:
    return "empty", 0
  loss = Image.open(io.BytesIO(lb)).convert("RGBA")
  la = np.asarray(loss)
  year = la[:, :, 0].astype(np.uint16)
  # z>=9 year in B
  if z >= 9:
    year_b = la[:, :, 2].astype(np.uint16)
    year = np.where((year_b >= 1) & (year_b <= 24), year_b, year)
  alpha = la[:, :, 3]
  ok = (alpha >= 20) & (year >= 1) & (year <= 24)
  if not ok.any():
    return "empty", 0
  try:
    db = fetch(DRV.format(z=z, x=x, y=y))
    da = np.asarray(Image.open(io.BytesIO(db)).convert("RGBA"))
    cls = da[:, :, 1].astype(np.uint16)
    cls = np.where((da[:, :, 3] >= 20) & (cls >= 1) & (cls <= 5), cls, 0)
  except Exception:
    cls = np.zeros(year.shape, dtype=np.uint16)
  packed = ((year & 31) | ((cls & 7) << 5)).astype(np.uint8)
  out = np.zeros((la.shape[0], la.shape[1], 2), dtype=np.uint8)
  out[:, :, 0] = np.where(ok, packed, 0)
  out[:, :, 1] = np.where(ok, 255, 0)
  dest.parent.mkdir(parents=True, exist_ok=True)
  buf = io.BytesIO()
  Image.fromarray(out, "LA").save(buf, format="WEBP", lossless=True, quality=100, method=4)
  data = buf.getvalue()
  dest.write_bytes(data)
  return "ok", len(data)

def pack_ifl(z, x, y):
  dest = OUT / "ifl" / str(z) / str(x) / f"{y}.webp"
  if dest.exists() and dest.stat().st_size > 20:
    return "skip", 0
  try:
    b = fetch(IFL.format(z=z, x=x, y=y))
  except Exception:
    return "err-ifl", 0
  im = Image.open(io.BytesIO(b)).convert("RGBA")
  a = np.asarray(im)
  mask = a[:, :, 3] > 40
  if not mask.any():
    return "empty", 0
  out = np.zeros((a.shape[0], a.shape[1], 2), dtype=np.uint8)
  out[:, :, 0] = np.where(mask, 1, 0)
  out[:, :, 1] = np.where(mask, 255, 0)
  dest.parent.mkdir(parents=True, exist_ok=True)
  buf = io.BytesIO()
  Image.fromarray(out, "LA").save(buf, format="WEBP", lossless=True, quality=100, method=4)
  data = buf.getvalue()
  dest.write_bytes(data)
  return "ok", len(data)

def dir_bytes(path: Path) -> int:
  total = 0
  if not path.exists():
    return 0
  for p in path.rglob("*"):
    if p.is_file():
      total += p.stat().st_size
  return total

def tile_index(base: Path) -> dict:
  """{z: {x: [y or [y0, y1], ...]}} for every .webp under base/z/x/ (runs of y kept as ranges)."""
  out: dict = {}
  for zd in sorted(base.iterdir()):
    if not (zd.is_dir() and zd.name.isdigit()):
      continue
    for xd in sorted(zd.iterdir(), key=lambda d: int(d.name)):
      ys = sorted(int(f.stem) for f in xd.glob("*.webp"))
      runs: list = []
      for y in ys:
        if runs and runs[-1][1] == y - 1:
          runs[-1][1] = y
        else:
          runs.append([y, y])
      if runs:
        out.setdefault(zd.name, {})[xd.name] = [a if a == b else [a, b] for a, b in runs]
  return out

def have_index() -> dict:
  return {"loss": tile_index(OUT), "ifl": tile_index(OUT / "ifl")}

def main():
  if "--index-only" in sys.argv:
    path = OUT / "manifest.json"
    manifest = json.loads(path.read_text())
    manifest["have"] = have_index()
    path.write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
    print("INDEX", {k: sum(len(v) for v in manifest["have"][k].values()) for k in manifest["have"]}, flush=True)
    return 0
  OUT.mkdir(parents=True, exist_ok=True)
  jobs = []
  seen = set()
  for reg in REGIONS:
    for z in range(reg["z0"], reg["z1"] + 1):
      for t in iter_tiles(z, *reg["bbox"]):
        if t in seen:
          continue
        seen.add(t)
        jobs.append(t)
  print(f"jobs {len(jobs)} workers {WORKERS} max_mb {MAX_MB}", flush=True)
  stats = {"ok": 0, "empty": 0, "skip": 0, "err": 0, "bytes": 0, "ifl_ok": 0, "ifl_bytes": 0}
  t0 = time.time()

  def run_one(t):
    z, x, y = t
    st, n = pack_loss_drv(z, x, y)
    ifl = None
    if DO_IFL and st in ("ok", "empty", "skip"):
      # only attempt IFL where we bother with coverage
      ist, ibn = pack_ifl(z, x, y)
      ifl = (ist, ibn)
    return t, st, n, ifl

  done = 0
  with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    futs = [ex.submit(run_one, t) for t in jobs]
    for fut in as_completed(futs):
      t, st, n, ifl = fut.result()
      done += 1
      if st == "ok":
        stats["ok"] += 1
        stats["bytes"] += n
      elif st == "empty":
        stats["empty"] += 1
      elif st == "skip":
        stats["skip"] += 1
      else:
        stats["err"] += 1
      if ifl:
        ist, ibn = ifl
        if ist == "ok":
          stats["ifl_ok"] += 1
          stats["ifl_bytes"] += ibn
      if done % 100 == 0 or done == len(jobs):
        used = dir_bytes(OUT) / 1e6
        print(f"  {done}/{len(jobs)} used={used:.1f}MB stats={stats} {time.time()-t0:.0f}s", flush=True)
        if used > MAX_MB:
          print("MAX_MB reached — stopping new writes (in-flight may finish)", flush=True)
          # cancel pending
          for f in futs:
            f.cancel()
          break

  manifest = {
    "v": 1,
    "format": "webp-la",
    "encode": "L = (year-2000) | (driver<<5); A=255 on loss. driver 0=unk 1-5=Curtis classes",
    "ifl": "ifl/{z}/{x}/{y}.webp L=1 A=255 on intact",
    "attribution": "Hansen/UMD/Google/USGS/NASA · Curtis et al. 2018 · Potapov/IFL via GFW · CC BY 4.0",
    "regions": REGIONS,
    "packMaxZoom": 9,
    "stats": stats,
    "have": have_index(),
    "bytesOnDisk": dir_bytes(OUT),
    "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
  }
  (OUT / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
  readme = OUT / "README.txt"
  readme.write_text(
    "Prebuilt forest loss+driver index tiles for SUNNY.\n"
    "Source: Global Forest Watch tiles (CC BY 4.0). Rebuilt offline; phone gets only these.\n"
    "Encoding: WebP lossless LA — L packs loss year (1-24 = 2001-2024) in low 5 bits and\n"
    "driver class (0-5) in high 3 bits; A=255 where loss. IFL under ifl/ as mask.\n"
    "Missing file inside coverage = no loss / no IFL. Outside coverage = client may fall back.\n"
  )
  print("DONE", json.dumps(stats), "disk_MB", dir_bytes(OUT) / 1e6, flush=True)
  return 0

if __name__ == "__main__":
  raise SystemExit(main())
