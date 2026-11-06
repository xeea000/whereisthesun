#!/usr/bin/env python3
"""SUNNY t361u: enrich data/mtg-stores.json from each store's public Wizards locator page
(https://locator.wizards.com/en/store/<id>, no key). Adds the store's own phone + website and
rebuilds prereleaseNext with day, time and format exactly as the locator lists them:
  format  = the event's listed format (e.g. "Sealed Deck")
  teams   = "Two-Headed Giant (teams of 2)" when the event requires 2-player teams
  notes   = format words found in the event title/description (e.g. "Best of one", "Two-Headed Giant")
  fee     = entry fee as listed
Nothing is guessed: missing fields stay empty. Run after build-mtg-stores.py, before build-mtg-sets.py.
Usage: python3 tools/enrich-mtg-locator.py [--limit N]
"""
from __future__ import annotations
import json, re, sys, time, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
STORES = ROOT / "data" / "mtg-stores.json"
SETS = ROOT / "data" / "mtg-sets.json"
UA = {"User-Agent": "SunnyBuild/1.0 (github.com/xeea000/whereisthesun; free public locator read)"}
NOTE_WORDS = [
  (r"(?:two|2)[- ]headed|\b2hg\b", "Two-Headed Giant"),
  (r"\bbo1\b|best[- ]of[- ](?:one|1)\b", "Best of one"),
  (r"\bbo3\b|best[- ]of[- ](?:three|3)\b", "Best of three"),
  (r"four[- ]player|4[- ]player|\bpods? of (?:4|four)\b", "Four-player pods"),
  (r"\bdraft\b", "Draft"),
  (r"\bat home\b|take[- ]home", "Take-home kit"),
  (r"\bkids?\b|\bjunior\b|\bfamily\b", "Family / kids"),
]

def decode(arr):
  memo = {}
  def h(i):
    if not isinstance(i, int):
      return i
    if i < 0:
      return None
    if i in memo:
      return memo[i]
    v = arr[i]
    if isinstance(v, dict):
      o = {}
      memo[i] = o
      for k, vi in v.items():
        o[arr[int(k[1:])]] = h(vi)
      return o
    if isinstance(v, list):
      if v and isinstance(v[0], str) and v[0] in ("D", "P", "Y", "R", "E", "S", "M", "Z", "U"):
        memo[i] = v[1] if len(v) == 2 else v[1:]
        return memo[i]
      o = []
      memo[i] = o
      o.extend(h(x) for x in v)
      return o
    memo[i] = v
    return v
  return h(0)

def route(html: str) -> dict:
  chunks = re.findall(r'streamController\.enqueue\((".*?")\);', html, re.S)
  s = "".join(json.loads(c) for c in chunks)
  d = decode(json.loads(s.split("\n")[0]))
  for k, v in (d.get("loaderData") or {}).items():
    if k.endswith(".search") and isinstance(v, dict):
      return v
  return {}

def get(url: str) -> str:
  req = urllib.request.Request(url, headers=UA)
  with urllib.request.urlopen(req, timeout=45) as r:
    return r.read().decode("utf-8", "replace")

def set_for(title: str, day: datetime, sets: list[dict]) -> str:
  t = title.lower()
  for s in sets:
    if s.get("name") and s["name"].lower() in t:
      return s["code"]
  for s in sets:
    pr = s.get("prerelease") or {}
    try:
      a = datetime.fromisoformat(pr["start"]).date() - timedelta(days=3)
      b = datetime.fromisoformat(pr["end"]).date() + timedelta(days=4)
    except Exception:
      continue
    if a <= day.date() <= b:
      return s["code"]
  return ""

def row_of(e: dict, sets: list[dict]) -> dict | None:
  tags = e.get("tags") or []
  title = (e.get("title") or "").strip()
  if "magic_prerelease" not in tags and "prerelease" not in title.lower():
    return None
  try:
    utc = datetime.fromisoformat(e["scheduledStartTime"].replace("Z", "")[:19]).replace(tzinfo=timezone.utc)
    loc = utc.astimezone(ZoneInfo(e.get("timeZone") or "America/Toronto"))
  except Exception:
    return None
  fmt = ((e.get("eventFormat") or {}).get("name") or "").strip()
  team = e.get("requiredTeamSize") or 1
  teams = "Two-Headed Giant (teams of 2)" if team == 2 else (f"Teams of {team}" if team and team > 2 else "")
  text = (title + " " + (e.get("description") or "")).lower()
  notes = []
  for rx, lab in NOTE_WORDS:
    if re.search(rx, text) and lab not in notes and not (lab == "Two-Headed Giant" and teams):
      notes.append(lab)
  fee = ""
  ef = e.get("entryFee") or {}
  if isinstance(ef.get("amount"), (int, float)):
    cur = ef.get("currency") or ""
    amt = ef["amount"] / 100
    fee = "" if amt == 0 else (("CA$" if cur == "CAD" else (cur + " ")) + (f"{amt:.0f}" if amt == int(amt) else f"{amt:.2f}"))
  return {
    "title": title[:100],
    "date": loc.strftime("%a, %b ") + str(loc.day),
    "time": loc.strftime("%I:%M %p").lstrip("0"),
    "iso": loc.isoformat(timespec="minutes"),
    "format": fmt or "Not listed",
    "teams": teams,
    "notes": notes[:3],
    "fee": fee,
    "seats": e.get("capacity") or None,
    "set": set_for(title, loc, sets),
  }

def main() -> None:
  lim = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 0
  doc = json.loads(STORES.read_text())
  sets = json.loads(SETS.read_text()).get("sets", []) if SETS.exists() else []
  stores = doc["stores"]
  if lim:
    stores = stores[:lim]
  ok = phones = pre = 0
  for i, s in enumerate(stores):
    try:
      r = route(get(f"https://locator.wizards.com/en/store/{s['id']}"))
    except Exception as ex:
      print("fail", s["id"], s["name"], ex)
      continue
    st = r.get("selectedStore") or {}
    if str(st.get("id")) != str(s["id"]):
      print("no store", s["id"], s["name"])
      continue
    ok += 1
    s["phone"] = (st.get("phoneNumber") or "").strip()
    w = (st.get("website") or "").strip()
    if w and not w.startswith("http"):
      w = "https://" + w
    s["web"] = w
    rows = [x for x in (row_of(e, sets) for e in (r.get("selectedStoreEvents") or [])) if x]
    cut = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat(timespec="minutes")
    rows = [x for x in rows if datetime.fromisoformat(x["iso"]).astimezone(timezone.utc).isoformat(timespec="minutes") >= cut]
    rows.sort(key=lambda x: x["iso"])
    s["prereleaseNext"] = rows[:8]
    s["prerelease"] = bool(rows) or bool(s.get("prerelease"))
    s["prereleaseSets"] = sorted({x["set"] for x in rows if x["set"]}) or s.get("prereleaseSets") or []
    phones += bool(s["phone"])
    pre += bool(rows)
    if i % 25 == 0:
      print(i, s["name"], s["phone"], len(rows))
    time.sleep(0.4)
  doc["contactsBuilt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
  doc["source"]["contacts"] = "Phone, website and prerelease format from each store's public locator page (locator.wizards.com/en/store/<id>)."
  doc["counts"]["withPhone"] = sum(1 for s in doc["stores"] if s.get("phone"))
  doc["counts"]["withPrerelease"] = sum(1 for s in doc["stores"] if s.get("prereleaseNext"))
  STORES.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
  print("stores read", ok, "phones", phones, "with prerelease rows", pre)

if __name__ == "__main__":
  main()
