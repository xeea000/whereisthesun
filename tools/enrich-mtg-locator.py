#!/usr/bin/env python3
"""SUNNY t361u: enrich data/mtg-stores.json from each store's public Wizards locator page
(https://locator.wizards.com/en/store/<id>, no key). Adds the store's own phone + website and
rebuilds prereleaseNext with day, time and format exactly as the locator lists them:
  format  = the event's listed format (e.g. "Sealed Deck")
  teams   = t376u, from the event's own fields only (never another event at the store):
            "Two-Headed Giant" = signup in teams of 2 AND this event's title/description says 2HG/Two-Headed;
            "Teams of two — variant not confirmed" = teams of 2 with no such wording;
            "Title says Two-Headed Giant · signup not set as teams" = wording in the TITLE but team size 1.
            Description-only 2HG wording on a solo event is ignored (stores often describe other sessions).
  notes   = only unambiguous words: one best-of variant, take-home in the title, title/format conflicts
  eid/src = the Wizards event id and its public page https://locator.wizards.com/en/event/<id>;
            teamEv = short literal snippet backing the teams label
  fee     = entry fee as listed
Nothing is guessed: missing fields stay empty. Run after build-mtg-stores.py, before build-mtg-sets.py.
Usage: python3 tools/enrich-mtg-locator.py [--limit N] [--raw-out DIR | --from-raw DIR]
  --raw-out saves each store page's raw events (with retrieval time); --from-raw rebuilds from those files.
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
THG = re.compile(r"two[- ]?headed|\b2[- ]?headed|\b2[- ]?hg\b", re.I)
NEG = re.compile(r"\b(?:no|not|non|without|isn'?t|cancel+ed)\b[^.!?\n]{0,25}$", re.I)
BO1 = re.compile(r"\bbo1\b|best[- ]of[- ](?:one|1)\b", re.I)
BO3 = re.compile(r"\bbo3\b|best[- ]of[- ](?:three|3)\b", re.I)
HOME = re.compile(r"\bat home\b|take[- ]home", re.I)
EVENT_URL = "https://locator.wizards.com/en/event/{}"

def thg_hit(text: str):
  """first un-negated 2HG mention in text, as a short literal snippet, else None"""
  for m in THG.finditer(text or ""):
    if NEG.search(text[max(0, m.start() - 30):m.start()]):
      continue
    a, b = max(0, m.start() - 30), min(len(text), m.end() + 30)
    return " ".join(text[a:b].split())
  return None

def classify(e: dict) -> dict:
  """teams label, notes and evidence from ONE event's own fields"""
  title = (e.get("title") or "").strip()
  desc = e.get("description") or ""
  team = e.get("requiredTeamSize") or 1
  fmt = ((e.get("eventFormat") or {}).get("name") or "").strip()
  t_hit, d_hit = thg_hit(title), thg_hit(desc)
  teams, ev = "", ""
  if team == 2 and (t_hit or d_hit):
    teams, ev = "Two-Headed Giant", "teams of 2 · " + (("title: " + t_hit) if t_hit else ("description: " + d_hit))
  elif team == 2:
    teams, ev = "Teams of two — variant not confirmed", "teams of 2 · no 2HG wording"
  elif team and team > 2:
    teams, ev = f"Teams of {team}", f"teams of {team}"
  elif t_hit:
    teams, ev = "Title says Two-Headed Giant · signup not set as teams", "teams of 1 · title: " + t_hit
  notes = []
  b1, b3 = bool(BO1.search(title + " " + desc)), bool(BO3.search(title + " " + desc))
  if b1 != b3:
    notes.append("Best of one" if b1 else "Best of three")
  if HOME.search(title):
    notes.append("Take-home kit")
  if re.search(r"\bdraft\b", title, re.I) and fmt and fmt != "Booster Draft":
    notes.append("Title says Draft · listed as " + fmt)
  return {"teams": teams, "teamEv": ev[:120], "notes": notes[:3]}

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
    ts = re.sub(r"(\.\d+)", "", e["scheduledStartTime"]).replace("Z", "+00:00")
    utc = datetime.fromisoformat(ts)
    utc = utc.replace(tzinfo=timezone.utc) if utc.tzinfo is None else utc.astimezone(timezone.utc)
    loc = utc.astimezone(ZoneInfo(e.get("timeZone") or "America/Toronto"))
  except Exception:
    return None
  fmt = ((e.get("eventFormat") or {}).get("name") or "").strip()
  c = classify(e)
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
    "format": fmt if fmt and fmt != "Other" else "Not listed",
    "teams": c["teams"],
    "teamEv": c["teamEv"],
    "notes": c["notes"],
    "eid": str(e.get("id") or ""),
    "src": EVENT_URL.format(e["id"]) if re.fullmatch(r"\d{1,12}", str(e.get("id") or "")) else "",
    "fee": fee,
    "seats": e.get("capacity") or None,
    "set": set_for(title, loc, sets),
  }

def main() -> None:
  arg = lambda k: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else ""
  lim = int(arg("--limit") or 0)
  raw_in, raw_out = arg("--from-raw"), arg("--raw-out")
  doc = json.loads(STORES.read_text())
  sets = json.loads(SETS.read_text()).get("sets", []) if SETS.exists() else []
  stores = doc["stores"]
  if lim:
    stores = stores[:lim]
  ok = phones = pre = 0
  for i, s in enumerate(stores):
    url = f"https://locator.wizards.com/en/store/{s['id']}"
    try:
      if raw_in:
        cached = json.loads((Path(raw_in) / f"{s['id']}.json").read_text())
        if cached.get("error"):
          raise RuntimeError(cached["error"])
        r = {"selectedStore": cached.get("store") or {}, "selectedStoreEvents": cached.get("events") or []}
      else:
        r = route(get(url))
        if raw_out:  # keep the source evidence behind every label
          Path(raw_out).mkdir(parents=True, exist_ok=True)
          (Path(raw_out) / f"{s['id']}.json").write_text(json.dumps({"url": url, "retrievedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "store": r.get("selectedStore") or {}, "events": r.get("selectedStoreEvents") or []}, ensure_ascii=False))
    except Exception as ex:
      print("fail", s["id"], s["name"], ex)
      if "404" in str(ex):  # the store's page is gone: its old event rows have no source left
        s["prereleaseNext"] = []
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
    s["preSrc"] = url
    s["prerelease"] = bool(rows) or bool(s.get("prerelease"))
    s["prereleaseSets"] = sorted({x["set"] for x in rows if x["set"]}) or s.get("prereleaseSets") or []
    phones += bool(s["phone"])
    pre += bool(rows)
    if i % 25 == 0:
      print(i, s["name"], s["phone"], len(rows))
    if not raw_in:
      time.sleep(0.4)
  doc["contactsBuilt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
  doc["source"]["contacts"] = "Phone, website and prerelease format from each store's public locator page (locator.wizards.com/en/store/<id>)."
  doc["counts"]["withPhone"] = sum(1 for s in doc["stores"] if s.get("phone"))
  doc["counts"]["withPrerelease"] = sum(1 for s in doc["stores"] if s.get("prereleaseNext"))
  STORES.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")))
  print("stores read", ok, "phones", phones, "with prerelease rows", pre)

if __name__ == "__main__":
  main()
