#!/usr/bin/env python3
"""SUNNY Fun & Games: prerelease set catalog + tiny key-art thumbs (opt191).

Sources (all free, keyless):
  - Scryfall /sets  — set name, code, release date, icon SVG
  - Existing data/mtg-stores.json — prerelease event titles/dates from the
    public Wizards Store & Event Locator scrape (tools/build-mtg-stores.py)
  - magic.wizards.com/en/products/<slug> — official page + og:image key art

Writes:
  data/mtg-sets.json
  data/mtg-art/<code>.webp   (≈120px wide, heavily compressed)
  updates data/mtg-stores.json prereleaseNext (+ set codes) and prereleasePast
  data/mtg-prerelease-history.json  (accumulate-merge; never drops prior rows)

Past hosts: Wizards locator has no date-range/past API (probed). Wayback was
offline at seed time. History accumulates every snapshot so last 1–2 past
prereleases per store survive after events fall off the live locator.

Usage: python3 tools/build-mtg-sets.py
"""
from __future__ import annotations
import json, re, subprocess, time, urllib.parse, urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STORES = ROOT / "data" / "mtg-stores.json"
OUT = ROOT / "data" / "mtg-sets.json"
ART = ROOT / "data" / "mtg-art"
HISTORY = ROOT / "data" / "mtg-prerelease-history.json"
UA = {"User-Agent": "SunnyBuild/1.0 (github.com/xeea000/whereisthesun; research)", "Accept": "application/json"}

# Known product page slugs when the auto slug guess fails
SLUGS = {
  "trk": "star-trek",
  "fra": "reality-fracture",
  "tla": "avatar-the-last-airbender",
  "ecl": "lorwyn-eclipsed",
  "sos": "secrets-of-strixhaven",
  "tmt": "teenage-mutant-ninja-turtles",
  "msh": "marvel-super-heroes",
  "hob": "the-hobbit",
  "eoe": "edge-of-eternities",
  "fin": "final-fantasy",
  "spm": "marvels-spider-man",
  "tdm": "tarkir-dragonstorm",
}

def get_json(url: str):
  req = urllib.request.Request(url, headers=UA)
  with urllib.request.urlopen(req, timeout=60) as r:
    return json.load(r)

def get_bytes(url: str) -> bytes:
  req = urllib.request.Request(url, headers=UA)
  with urllib.request.urlopen(req, timeout=60) as r:
    return r.read()

def get_html(url: str) -> str | None:
  try:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
      if r.status >= 400:
        return None
      return r.read().decode("utf-8", "replace")
  except Exception:
    return None

def slugify(name: str) -> str:
  s = name.lower()
  s = s.replace("'", "").replace("'", "").replace(":", "")
  s = s.replace("&", "and")
  s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
  return s

def wizards_url(code: str, name: str) -> tuple[str, str | None]:
  """Return (product_url, og_image_url_or_None)."""
  candidates = []
  if code in SLUGS:
    candidates.append(SLUGS[code])
  candidates.append(slugify(name))
  # drop leading "Magic: The Gathering" etc.
  short = re.sub(r"^(magic:?\s*the\s*gathering|mtg)\s*", "", name, flags=re.I)
  candidates.append(slugify(short))
  seen = set()
  for slug in candidates:
    if not slug or slug in seen:
      continue
    seen.add(slug)
    url = f"https://magic.wizards.com/en/products/{slug}"
    html = get_html(url)
    time.sleep(0.25)
    if not html or "404" in (re.search(r"<title>([^<]+)", html).group(1) if re.search(r"<title>", html) else ""):
      # soft 404 pages still 200 sometimes
      if html and re.search(r"page not found|404 \| Magic", html, re.I):
        continue
      if not html:
        continue
    if html and ("Preorder" in html or "Available" in html or name.split(":")[0][:12].lower() in html.lower() or slug.replace("-", " ")[:10] in html.lower()):
      og = re.search(r'property="og:image"\s+content="([^"]+)"', html)
      return url, (og.group(1) if og else None)
  # fallback link to products search / set name on magic.wizards.com news
  return f"https://magic.wizards.com/en/products/{candidates[0] if candidates else slugify(name)}", None

def compress_thumb(src: Path, dest: Path) -> int:
  dest.parent.mkdir(parents=True, exist_ok=True)
  # 120px wide webp, low quality — chip-sized key art
  subprocess.check_call([
    "ffmpeg", "-y", "-i", str(src),
    "-vf", "scale=120:-1",
    "-quality", "40",
    str(dest),
  ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
  return dest.stat().st_size

def match_set(title: str, expansions: list[dict]) -> dict | None:
  t = title.lower()
  # longest name match wins
  best = None
  for s in expansions:
    name = s["name"].lower()
    # also try without subtitle punctuation
    alts = {name, name.replace(":", ""), name.replace("'", ""), name.replace("'", "")}
    # Star Trek aliases
    if s["code"] == "trk":
      alts |= {"star trek", "startrek", "star strek"}
    for a in alts:
      if len(a) >= 4 and a in t:
        if not best or len(a) > len(best["name"]):
          best = s
  return best

def prerelease_weekend(release: str) -> dict:
  """Typical WPN prerelease: Fri–Sun before the Friday release (or the release weekend)."""
  try:
    rel = date.fromisoformat(release)
  except Exception:
    return {"start": "", "end": ""}
  # release is usually Friday; prerelease is the prior Fri–Sun (week before)
  # If release is Friday, prerelease weekend starts 7 days earlier
  start = rel - timedelta(days=7)
  # snap start to Friday
  start = start - timedelta(days=(start.weekday() - 4) % 7)
  end = start + timedelta(days=2)
  return {"start": start.isoformat(), "end": end.isoformat()}

MONTH = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
         "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}

def parse_event_date(date_str: str, hint_iso: str = "") -> str:
  """Turn 'Fri, Nov 6' into YYYY-MM-DD using hint year (set prerelease/release)."""
  if not date_str:
    return ""
  m = re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})", date_str, re.I)
  if not m:
    return ""
  month = MONTH[m.group(1).lower()[:3]]
  day = int(m.group(2))
  year = None
  if hint_iso and len(hint_iso) >= 4 and hint_iso[:4].isdigit():
    year = int(hint_iso[:4])
  if year is None:
    year = date.today().year
  try:
    d = date(year, month, day)
  except ValueError:
    return ""
  # If far from hint, nudge year
  if hint_iso:
    try:
      h = date.fromisoformat(hint_iso[:10])
      if abs((d - h).days) > 180:
        for y in (year - 1, year + 1):
          try:
            cand = date(y, month, day)
          except ValueError:
            continue
          if abs((cand - h).days) < abs((d - h).days):
            d = cand
    except ValueError:
      pass
  return d.isoformat()

def load_history() -> dict:
  if HISTORY.exists():
    try:
      return json.loads(HISTORY.read_text())
    except Exception:
      pass
  return {
    "updated": "",
    "source": {
      "locator": "https://locator.wizards.com/",
      "note": "Accumulate-merge of locator prerelease snapshots. Locator exposes no past/date-range API; Wayback seed attempted when reachable.",
      "waybackSeed": False,
    },
    "byStore": {},
  }

def merge_history(stores_doc: dict, expansions: list[dict], today: str) -> dict:
  """Merge current prereleaseNext into history; attach prereleasePast (last 1–2)."""
  hist = load_history()
  by = hist.setdefault("byStore", {})
  exp_by_code = {s["code"]: s for s in expansions}
  seen_day = today
  added = 0
  for store in stores_doc.get("stores", []):
    sid = str(store.get("id") or "")
    if not sid:
      continue
    rows = by.get(sid) or []
    have = {(r.get("set") or "", r.get("dateIso") or r.get("date") or "") for r in rows}
    for e in store.get("prereleaseNext") or []:
      code = e.get("set") or ""
      exp = exp_by_code.get(code) if code else None
      if not code:
        m = match_set(e.get("title") or "", expansions)
        if m:
          code = m["code"]
          exp = m
      hint = ""
      if exp:
        weekend = prerelease_weekend(exp["released"])
        hint = weekend.get("start") or exp.get("released") or ""
      date_iso = parse_event_date(e.get("date") or "", hint)
      # fallback: set prerelease start if date string missing but set known
      if not date_iso and hint:
        date_iso = hint[:10]
      key = (code, date_iso or (e.get("date") or ""))
      if not key[1]:
        continue
      if key in have:
        continue
      name = (exp["name"] if exp else "") or ""
      # strip subtitle noise for chip: keep primary name
      row = {
        "set": code,
        "name": name,
        "date": e.get("date") or "",
        "dateIso": date_iso,
        "title": (e.get("title") or "")[:100],
        "seen": seen_day,
      }
      rows.append(row)
      have.add(key)
      added += 1
    if rows:
      by[sid] = rows
    elif sid in by and not by[sid]:
      del by[sid]
    # Past = dateIso < today (or set prerelease end < today when dateIso missing)
    past_cand = []
    for r in rows:
      iso = r.get("dateIso") or ""
      if not iso and r.get("set") in exp_by_code:
        w = prerelease_weekend(exp_by_code[r["set"]]["released"])
        iso = w.get("end") or ""
      if not iso or iso >= today:
        continue
      past_cand.append({**r, "dateIso": iso})
    # unique by set, keep latest dateIso
    best: dict[str, dict] = {}
    for r in past_cand:
      code = r.get("set") or ("_" + (r.get("title") or "")[:40])
      prev = best.get(code)
      if not prev or (r.get("dateIso") or "") > (prev.get("dateIso") or ""):
        best[code] = r
    ordered = sorted(best.values(), key=lambda r: r.get("dateIso") or "", reverse=True)[:2]
    slim_past = []
    for r in ordered:
      name = r.get("name") or ""
      if not name and r.get("set") in exp_by_code:
        name = exp_by_code[r["set"]]["name"]
      label_date = ""
      iso = r.get("dateIso") or ""
      if iso:
        try:
          d = date.fromisoformat(iso)
          label_date = f"{d.strftime('%b')} {d.day}"
        except ValueError:
          label_date = r.get("date") or iso
      else:
        label_date = r.get("date") or ""
      slim_past.append({
        "set": r.get("set") or "",
        "name": name,
        "date": label_date,
        "dateIso": iso,
      })
    store["prereleasePast"] = slim_past
  hist["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
  hist["source"]["waybackSeed"] = bool(hist.get("source", {}).get("waybackSeed"))
  HISTORY.write_text(json.dumps(hist, ensure_ascii=False, separators=(",", ":")))
  with_past = sum(1 for s in stores_doc.get("stores", []) if s.get("prereleasePast"))
  print("History", HISTORY.name, "stores_tracked", len(by), "new_rows", added, "with_past", with_past)
  stores_doc.setdefault("counts", {})["withPastPrerelease"] = with_past
  return hist


def main() -> None:
  stores_doc = json.loads(STORES.read_text())
  print("Fetching Scryfall sets…")
  cache = Path("/tmp/scryfall-sets.json")
  try:
    scry = get_json("https://api.scryfall.com/sets")
    cache.write_text(json.dumps(scry))
  except Exception as e:
    print("scryfall fetch failed, using cache:", e)
    scry = json.loads(cache.read_text())
  time.sleep(0.1)
  today = date.today().isoformat()
  expansions = []
  for s in scry.get("data", []):
    if s.get("set_type") not in ("expansion", "draft_innovation", "commander", "core", "masters", "funny"):
      continue
    if s.get("digital"):
      continue
    rd = s.get("released_at") or ""
    if not rd:
      continue
    # keep recent past (~4 months) and next ~14 months for schedule
    if rd < "2025-08-01" or rd > "2028-01-01":
      continue
    expansions.append({
      "code": s["code"],
      "name": s["name"],
      "released": rd,
      "type": s["set_type"],
      "icon": s.get("icon_svg_uri") or "",
      "scryfall": s.get("scryfall_uri") or f"https://scryfall.com/sets/{s['code']}",
    })
  expansions.sort(key=lambda x: x["released"])

  # Which sets appear in store prerelease titles?
  title_hits: dict[str, int] = {}
  event_dates: dict[str, set[str]] = {}
  for store in stores_doc.get("stores", []):
    for e in store.get("prereleaseNext") or []:
      m = match_set(e.get("title") or "", expansions)
      if not m:
        continue
      title_hits[m["code"]] = title_hits.get(m["code"], 0) + 1
      ds = (e.get("date") or "").strip()
      if ds:
        event_dates.setdefault(m["code"], set()).add(ds)

  # Schedule set list: any hit in locator + upcoming expansions (main expansion type) from today
  schedule_codes = set(title_hits)
  for s in expansions:
    if s["type"] == "expansion" and s["released"] >= today:
      schedule_codes.add(s["code"])
    # also keep the most recent released expansion (for context)
    if s["type"] == "expansion" and s["released"] < today:
      pass
  # always include the latest released expansion
  past = [s for s in expansions if s["type"] == "expansion" and s["released"] < today]
  if past:
    schedule_codes.add(past[-1]["code"])

  ART.mkdir(parents=True, exist_ok=True)
  catalog = []
  art_bytes = 0
  for s in expansions:
    if s["code"] not in schedule_codes:
      continue
    print("set", s["code"], s["name"], s["released"], "events", title_hits.get(s["code"], 0))
    url, og = wizards_url(s["code"], s["name"])
    thumb_rel = ""
    if og:
      try:
        raw = get_bytes(og)
        tmp = ART / f"{s['code']}.src"
        tmp.write_bytes(raw)
        dest = ART / f"{s['code']}.webp"
        sz = compress_thumb(tmp, dest)
        tmp.unlink(missing_ok=True)
        thumb_rel = f"data/mtg-art/{s['code']}.webp"
        art_bytes += sz
        print("  thumb", sz, "B", "wizards", url)
      except Exception as e:
        print("  thumb fail", e)
    # also save tiny SVG icon from Scryfall when no og art
    icon_rel = ""
    if s["icon"]:
      try:
        svg = get_bytes(s["icon"].split("?")[0])
        ip = ART / f"{s['code']}.svg"
        if len(svg) < 20000:
          ip.write_bytes(svg)
          icon_rel = f"data/mtg-art/{s['code']}.svg"
          art_bytes += len(svg)
      except Exception as e:
        print("  icon fail", e)
    weekend = prerelease_weekend(s["released"])
    # Use observed event date range when present
    observed = sorted(event_dates.get(s["code"], []))
    catalog.append({
      "code": s["code"],
      "name": s["name"],
      "released": s["released"],
      "type": s["type"],
      "prerelease": weekend,
      "observedDates": observed[:12],
      "stores": title_hits.get(s["code"], 0),
      "wizards": url,
      "scryfall": s["scryfall"],
      "thumb": thumb_rel,
      "icon": icon_rel,
    })

  catalog.sort(key=lambda x: x["released"])

  # Enrich store prereleaseNext with set codes; drop unknown-set rows keep as set:""
  for store in stores_doc.get("stores", []):
    enriched = []
    for e in store.get("prereleaseNext") or []:
      m = match_set(e.get("title") or "", expansions)
      row = {
        "title": e.get("title", "")[:100],
        "date": e.get("date", ""),
        "time": e.get("time", ""),
        "format": e.get("format", "Other"),
        "set": m["code"] if m else "",
      }
      enriched.append(row)
    store["prereleaseNext"] = enriched
    # set codes on the store for quick filter
    store["prereleaseSets"] = sorted({r["set"] for r in enriched if r["set"]})

  merge_history(stores_doc, expansions, today)

  stores_doc["setsBuilt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
  stores_doc.setdefault("source", {})
  if isinstance(stores_doc["source"], dict):
    stores_doc["source"]["history"] = "data/mtg-prerelease-history.json"
  STORES.write_text(json.dumps(stores_doc, ensure_ascii=False, separators=(",", ":")))

  payload = {
    "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
    "source": {
      "scryfall": "https://api.scryfall.com/sets",
      "wizardsProducts": "https://magic.wizards.com/en/products/",
      "locator": "https://locator.wizards.com/",
      "note": "Set metadata from Scryfall (CC0-ish community DB, free). Key art from Wizards product og:image, resized. Event linkage from public locator scrape. Past hosts from accumulate-merge history (locator has no past API).",
    },
    "sets": catalog,
  }
  OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
  print("Wrote", OUT, "sets", len(catalog))
  print("Art bytes", art_bytes, "stores KB", round(STORES.stat().st_size / 1024, 1), "sets KB", round(OUT.stat().st_size / 1024, 1))

if __name__ == "__main__":
  main()
