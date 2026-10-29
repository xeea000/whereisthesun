#!/usr/bin/env python3
"""SUNNY MTG store busyness *estimate* (not attendance).

Signals (all free, citable; never invent counts):
  - Statistics Canada 2021 Census population centres (table 98-10-0011-01)
    → catchment population for the store\'s city / matched centre name
  - Competing WPN stores within 15 km and 30 km (from our locator snapshot)
  - Event activity from locator snapshot (FNM + prerelease rows) + history rows
  - WPN Legendary badge from locator
  - Event capacity when the locator listed it (usually absent)

Google Maps Popular times: pilot could not extract them via polite
headless/page fetch (Maps SPA does not embed them in static HTML; no captcha,
but no usable data). Not included.

Writes busy fields onto data/mtg-stores.json.
Usage: python3 tools/build-mtg-busyness.py
"""
from __future__ import annotations
import json, math, re, unicodedata
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STORES = ROOT / "data" / "mtg-stores.json"
POP = ROOT / "data" / "mtg-pop-centres.json"
HIST = ROOT / "data" / "mtg-prerelease-history.json"

LEVELS = ["Quiet", "Steady", "Lively", "Busy", "Packed"]

def fold(s: str) -> str:
  s = unicodedata.normalize("NFKD", s or "")
  s = "".join(c for c in s if not unicodedata.combining(c))
  return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()

def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
  lat1, lon1 = map(math.radians, a)
  lat2, lon2 = map(math.radians, b)
  dlat, dlon = lat2 - lat1, lon2 - lon1
  h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
  return 6371.0 * 2 * math.asin(math.sqrt(h))

def city_from_addr(addr: str) -> str:
  parts = [p.strip() for p in (addr or "").split(",") if p.strip()]
  for i, p in enumerate(parts):
    if re.match(r"^(ON|QC|BC|AB|MB|SK|NS|NB|NL|PE|YT|NT|NU)\b", p, re.I):
      if i > 0:
        return parts[i - 1]
  if len(parts) >= 2:
    return parts[1]
  return ""

def match_pc(city: str, centres: list[dict]) -> dict | None:
  if not city:
    return None
  f = fold(city)
  for c in centres:
    if fold(c["name"]) == f:
      return c
  best = None
  for c in centres:
    n = fold(c["name"])
    if len(f) >= 4 and (f in n or n in f):
      if not best or c["pop"] > best["pop"]:
        best = c
  return best

def score_level(pop: int, stores_local: int, c15: int, c30: int, events: int, legendary: bool, capacity: int | None) -> tuple[str, int, list[str]]:
  """Transparent heuristic — not attendance.
  stores_local = WPN within 15 km including this store; c15/c30 = other competitors."""
  why = []
  dens = pop / max(stores_local, 1)
  why.append(f"StatsCan 2021 population centre ≈ {pop:,}")
  why.append(f"Other WPN stores within 15 km: {c15} (within 30 km: {c30})")
  why.append(f"Population per local WPN store (15 km): ≈ {int(dens):,}")
  if dens >= 400_000:
    idx = 4
  elif dens >= 180_000:
    idx = 3
  elif dens >= 80_000:
    idx = 2
  elif dens >= 30_000:
    idx = 1
  else:
    idx = 0
  if legendary:
    idx = min(4, idx + 1)
    why.append("WPN Legendary badge (locator)")
  if events >= 6:
    idx = min(4, idx + 1)
    why.append(f"Active event listing ({events} FNM/prerelease rows in snapshot+history)")
  elif events >= 2:
    why.append(f"Event listing activity: {events} rows in snapshot+history")
  else:
    why.append("Few or no upcoming FNM/prerelease rows in the locator snapshot")
  if capacity:
    why.append(f"Listed event capacity (locator): {capacity}")
    if capacity >= 64:
      idx = min(4, idx + 1)
    elif capacity <= 16 and idx > 0:
      idx = max(0, idx - 1)
  if c15 >= 8 and idx > 0:
    idx -= 1
    why.append("Many nearby WPN stores (15 km ≥ 8) → nudged quieter")
  return LEVELS[idx], idx, why

def main() -> None:
  stores_doc = json.loads(STORES.read_text())
  centres = json.loads(POP.read_text())["centres"]
  hist = {}
  if HIST.exists():
    hist = json.loads(HIST.read_text()).get("byStore") or {}

  pts = [(s["id"], s["lat"], s["lon"]) for s in stores_doc["stores"]]
  level_counts = {k: 0 for k in LEVELS}

  for s in stores_doc["stores"]:
    city = city_from_addr(s.get("addr") or "")
    pc = match_pc(city, centres)
    pop = int(pc["pop"]) if pc else 0
    pc_name = pc["name"] if pc else ""
    c15 = c30 = 0
    for oid, la, lo in pts:
      if oid == s["id"]:
        continue
      d = haversine_km((s["lat"], s["lon"]), (la, lo))
      if d <= 15:
        c15 += 1
      if d <= 30:
        c30 += 1
    events = len(s.get("fnmNext") or []) + len(s.get("prereleaseNext") or [])
    events += len(hist.get(str(s["id"])) or [])
    cap = s.get("capacity")
    if isinstance(cap, str) and cap.isdigit():
      cap = int(cap)
    if not isinstance(cap, int):
      cap = None
    legendary_flag = bool(s.get("legendary"))

    if pop <= 0:
      why = [
        "No Statistics Canada population-centre name match for this address city",
        f"Other WPN stores within 15 km: {c15} (within 30 km: {c30})",
      ]
      if events:
        why.append(f"Event listing activity: {events} rows in snapshot+history")
      if c15 >= 6:
        idx = 0
      elif c15 >= 3:
        idx = 1
      else:
        idx = 2
      if legendary_flag:
        idx = min(4, idx + 1)
        why.append("WPN Legendary badge (locator)")
      label = LEVELS[idx]
    else:
      label, idx, why = score_level(pop, c15 + 1, c15, c30, events, legendary_flag, cap)
      why[0] = f"StatsCan 2021 population centre \"{pc_name}\" ≈ {pop:,}"

    s["busy"] = {
      "level": label,
      "rank": idx,
      "popCentre": pc_name,
      "pop2021": pop,
      "competitors15km": c15,
      "competitors30km": c30,
      "eventRows": events,
      "legendary": legendary_flag,
      "capacity": cap,
      "why": why[:6],
      "note": "Estimate from public signals — not measured attendance",
    }
    level_counts[label] += 1

  stores_doc.setdefault("counts", {})["busyLevels"] = level_counts
  stores_doc.setdefault("source", {})
  if isinstance(stores_doc["source"], dict):
    stores_doc["source"]["busyness"] = {
      "statcan": "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=9810001101",
      "statcanTable": "98-10-0011-01",
      "popFile": "data/mtg-pop-centres.json",
      "mapsPopularTimes": "pilot failed — Popular times not present in static or headless Maps HTML (no captcha; SPA does not embed them)",
      "note": "Busy chip is an estimate from StatsCan population centres + nearby WPN density + locator event/Legendary signals. Not attendance.",
    }
  stores_doc["busyBuilt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
  STORES.write_text(json.dumps(stores_doc, ensure_ascii=False, separators=(",", ":")))
  print("Enriched", len(stores_doc["stores"]), "levels", level_counts)

if __name__ == "__main__":
  main()
