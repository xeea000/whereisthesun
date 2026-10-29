#!/usr/bin/env python3
"""SUNNY Fun & Games: Magic stores from the public Wizards Store & Event Locator HTML
(no API key). Canada-first city search, deduped by store id. Also pulls upcoming
Friday Night Magic and Prerelease events and attaches them to stores.
Usage: python3 tools/build-mtg-stores.py
Writes data/mtg-stores.json
"""
from __future__ import annotations
import json, re, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "mtg-stores.json"
UA = {"User-Agent": "SunnyBuild/1.0 (github.com/xeea000/whereisthesun; research; free public locator scrape)"}
BASE = "https://locator.wizards.com/en/search"

# Canada-first cities / regions. Overlap is fine; stores merge by id.
CITIES = [
  "Toronto", "Mississauga", "Brampton", "Hamilton", "London ON", "Kitchener", "Waterloo",
  "Cambridge ON", "Guelph", "St. Catharines", "Niagara Falls ON", "Windsor", "Oshawa",
  "Barrie", "Kingston ON", "Ottawa", "Gatineau", "Montreal", "Laval", "Longueuil",
  "Quebec City", "Sherbrooke", "Trois-Rivieres", "Saguenay", "Gatineau",
  "Vancouver", "Burnaby", "Surrey BC", "Richmond BC", "Victoria", "Kelowna", "Kamloops",
  "Nanaimo", "Abbotsford", "Coquitlam",
  "Calgary", "Edmonton", "Red Deer", "Lethbridge", "Medicine Hat",
  "Winnipeg", "Brandon MB",
  "Saskatoon", "Regina",
  "Halifax", "Dartmouth NS", "Sydney NS",
  "Moncton", "Saint John NB", "Fredericton",
  "St. John's NL", "Corner Brook",
  "Charlottetown",
  "Whitehorse", "Yellowknife", "Iqaluit",
  "Thunder Bay", "Sudbury", "Sault Ste. Marie", "North Bay", "Peterborough ON",
  "Belleville ON", "Chatham ON", "Sarnia", "Brantford", "Ajax ON", "Pickering ON",
  "Whitby ON", "Markham", "Vaughan", "Richmond Hill ON", "Oakville", "Burlington ON",
  "Newmarket ON", "Aurora ON", "Milton ON",
]

FMT_WORDS = [
  ("commander", "Commander"), ("edh", "Commander"), ("cEDH", "Commander"),
  ("standard", "Standard"), ("modern", "Modern"), ("pioneer", "Pioneer"),
  ("pauper", "Pauper"), ("legacy", "Legacy"), ("vintage", "Vintage"),
  ("sealed", "Sealed"), ("draft", "Draft"), ("limited", "Limited"),
]

def get(url: str) -> str:
  req = urllib.request.Request(url, headers=UA)
  with urllib.request.urlopen(req, timeout=45) as r:
    return r.read().decode("utf-8", "replace")

def pages(total: int, per: int = 10) -> int:
  if not total:
    return 1
  return max(1, (total + per - 1) // per)

def parse_total(html: str) -> int | None:
  m = re.search(r"Showing\s+\d+[–\-]\d+\s+of\s+(\d+)", html)
  return int(m.group(1)) if m else None

def parse_stores(html: str) -> dict[str, dict]:
  """Pull stores from the Remix flight stream: id/name/lat/lon/address (+ phone/web from cards)."""
  out: dict[str, dict] = {}
  # Full keyed form
  for m in re.finditer(
    r'\\"id\\",\\"(\d+)\\",\\"name\\",\\"((?:\\\\.|[^\\"\\\\])*)\\",\\"latitude\\",(-?\d+\.?\d*),\\"longitude\\",(-?\d+\.?\d*),\\"postalAddress\\",\\"((?:\\\\.|[^\\"\\\\])*)\\"',
    html,
  ):
    sid, name, lat, lon, addr = m.groups()
    name = unescape(name.replace("\\'", "'").replace('\\"', '"').replace("\\\\", "\\"))
    addr = unescape(addr.replace("\\n", ", ").replace("\\'", "'").replace('\\"', '"'))
    out[sid] = {
      "id": sid, "name": name, "lat": float(lat), "lon": float(lon),
      "addr": re.sub(r"\s+,", ",", addr).strip(" ,"),
      "phone": "", "web": "", "wpn": True, "events": [],
    }
  # Compact interleaved form: "id","Name",lat,lon,"addr"
  for m in re.finditer(
    r'\\"(\d{3,})\\",\\"((?:\\\\.|[^\\"\\\\]){2,100})\\",(-?\d+\.\d+),(-?\d+\.\d+),\\"((?:\\\\.|[^\\"\\\\])*)\\"',
    html,
  ):
    sid, name, lat, lon, addr = m.groups()
    if sid in out:
      continue
    # skip non-store numeric noise (event ids etc.) by requiring plausible CA coords
    la, lo = float(lat), float(lon)
    if not (41.0 <= la <= 84.0 and -141.0 <= lo <= -52.0):
      continue
    name = unescape(name.replace("\\'", "'").replace('\\"', '"'))
    if name.startswith("_") or name in ("id", "name", "latitude"):
      continue
    addr = unescape(addr.replace("\\n", ", ").replace("\\'", "'"))
    out[sid] = {
      "id": sid, "name": name, "lat": la, "lon": lo,
      "addr": re.sub(r"\s+,", ",", addr).strip(" ,"),
      "phone": "", "web": "", "wpn": True, "events": [],
    }
  # Phone / website from HTML cards near storeId links
  for m in re.finditer(r'storeId=(\d+)[\s\S]{0,2500}?data-testid="storeCardWebsite"[^>]*>\s*<a[^>]+href="([^"]+)"', html):
    sid, web = m.group(1), unescape(m.group(2))
    if sid in out and web.startswith("http"):
      out[sid]["web"] = web
  for m in re.finditer(r'storeId=(\d+)[\s\S]{0,2500}?data-testid="storeCardPhone"[^>]*>([^<]+)', html):
    sid, phone = m.group(1), unescape(m.group(2)).strip()
    if sid in out and phone:
      out[sid]["phone"] = phone
  # Legendary badge
  for m in re.finditer(r'storeId=(\d+)[\s\S]{0,1200}?storeCardWpnLegendaryBadge', html):
    if m.group(1) in out:
      out[m.group(1)]["legendary"] = True
  return out

def fmt_of(title: str) -> str:
  t = title.lower()
  for key, label in FMT_WORDS:
    if key.lower() in t:
      return label
  return "Other"

def is_fnm(title: str) -> bool:
  t = title.lower()
  return "friday night" in t or t.startswith("fnm") or " friday night magic" in f" {t}"

def is_prerelease(title: str) -> bool:
  t = title.lower()
  return "prerelease" in t or "pre-release" in t

def parse_events(html: str) -> list[dict]:
  """Parse event cards from HTML testids."""
  events = []
  parts = html.split('data-testid="searchResultsEventItem"')
  for part in parts[1:]:
    chunk = part[:8000]
    def window(tid: str, width: int = 1500) -> str:
      m = re.search(rf'data-testid="{tid}"[^>]*>([\s\S]{{0,{width}}})', chunk)
      if not m:
        return ""
      raw = re.sub(r"<svg[\s\S]*?</svg>", " ", m.group(1))
      raw = re.sub(r"<[^>]+>", " ", raw)
      raw = re.sub(r"<[^>]*$", " ", raw)  # truncated tag at window end
      return unescape(raw)
    title = window("eventCardTitle", 500)
    title = re.split(r"\bToggle favorite|\bOpen favorite", title)[0]
    title = re.sub(r"\s+", " ", title).strip()
    date_win = window("eventCardDate", 900)
    dm = re.search(r"((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Za-z]{3}\s+\d{1,2})", date_win)
    date = dm.group(1) if dm else ""
    tim_win = window("eventCardTime", 200)
    tm = re.search(r"(\d{1,2}:\d{2}\s*[AP]M)", tim_win)
    tim = tm.group(1) if tm else ""
    # prefer the location link text
    loc = ""
    lm = re.search(r'data-testid="eventCardLocationLink"[^>]*>([\s\S]*?)</a>', chunk)
    if lm:
      loc = unescape(re.sub(r"<[^>]+>", " ", lm.group(1)))
    if not loc:
      loc = window("eventCardLocation", 1000)
    loc = re.sub(r"\s+", " ", loc).strip()
    loc = re.split(r"\s+\d+(?:\.\d+)?\s*mi\b|\s+Capacity:|\s+CA\$|\s+\$\d", loc)[0].strip()
    loc = re.sub(r"[^A-Za-z0-9].*$", lambda m: m.group(0) if re.search(r"[A-Za-z]", m.group(0)[:20]) else "", loc)
    # final cleanup: cut at first stray HTML-ish leftover
    loc = re.split(r"\s+<|\s+span class|\s+div class|\s+svg |\s+relative ", loc)[0].strip(" -|,")
    if not title or not loc or len(loc) < 2:
      continue
    events.append({
      "title": title[:160],
      "date": date,
      "time": tim,
      "store": loc[:120],
      "fnm": is_fnm(title),
      "prerelease": is_prerelease(title),
      "format": fmt_of(title),
    })
  return events

def scrape_type(city: str, typ: str, sleep: float = 0.45) -> tuple[dict[str, dict], list[dict]]:
  stores: dict[str, dict] = {}
  events: list[dict] = []
  q = urllib.parse.quote(city)
  url0 = f"{BASE}?query={q}&searchType={typ}&page=1"
  try:
    html = get(url0)
  except Exception as e:
    print("fail", city, typ, e)
    return stores, events
  total = parse_total(html) or 0
  n = min(pages(total), 12)  # cap pages per city to stay light
  for page in range(1, n + 1):
    if page > 1:
      time.sleep(sleep)
      try:
        html = get(f"{BASE}?query={q}&searchType={typ}&page={page}")
      except Exception as e:
        print("fail page", city, typ, page, e)
        break
    if typ == "stores":
      batch = parse_stores(html)
      stores.update(batch)
    else:
      events.extend(parse_events(html))
  print(f"  {typ:12} {city:22} total≈{total} got_stores={len(stores)} got_events={len(events)}")
  return stores, events

def canadaish(s: dict) -> bool:
  addr = (s.get("addr") or "").lower()
  if any(x in addr for x in (", can", ", ca", " canada", " on,", " qc,", " bc,", " ab,", " mb,", " sk,", " ns,", " nb,", " nl,", " pe,", " yt,", " nt,", " nu,")):
    return True
  # lat/lon Canada box (includes Alaska edge but we filter addr when possible)
  return 41.5 <= s["lat"] <= 84.0 and -141.0 <= s["lon"] <= -52.0 and (
    "united states" not in addr and ", us" not in addr and ", usa" not in addr
  )

def match_store(events_store: str, stores: dict[str, dict]) -> str | None:
  es = events_store.strip().lower()
  if not es:
    return None
  # exact / startswith
  for sid, s in stores.items():
    n = s["name"].lower()
    if n == es or n.startswith(es) or es.startswith(n):
      return sid
  # token overlap
  best, score = None, 0
  et = set(re.findall(r"[a-z0-9]+", es))
  for sid, s in stores.items():
    nt = set(re.findall(r"[a-z0-9]+", s["name"].lower()))
    sc = len(et & nt)
    if sc >= 2 and sc > score and sc >= min(3, len(et)):
      best, score = sid, sc
  return best

def main() -> None:
  all_stores: dict[str, dict] = {}
  all_events: list[dict] = []
  print("Scraping Wizards locator (public HTML, no key), Canada cities…")
  for city in CITIES:
    st, _ = scrape_type(city, "stores")
    all_stores.update(st)
    time.sleep(0.35)
  # events for the bigger cities only (enough to tag FNM / prerelease)
  event_cities = [
    "Toronto", "Ottawa", "Montreal", "Vancouver", "Calgary", "Edmonton",
    "Winnipeg", "Halifax", "Victoria", "Quebec City", "Saskatoon", "Regina",
    "Hamilton", "Kitchener", "London ON", "Windsor", "Kelowna", "Moncton",
    "Mississauga", "Markham", "Gatineau", "Sherbrooke",
  ]
  for city in event_cities:
    _, ev = scrape_type(city, "magic-events")
    all_events.extend(ev)
    time.sleep(0.35)

  # Keep Canada; drop obvious US leaks from border searches
  ca = {sid: s for sid, s in all_stores.items() if canadaish(s)}
  # Attach events
  for ev in all_events:
    sid = match_store(ev["store"], ca)
    if not sid:
      continue
    # dedupe event rows on store
    key = (ev["title"], ev["date"], ev["time"])
    have = {(e["title"], e.get("date"), e.get("time")) for e in ca[sid]["events"]}
    if key in have:
      continue
    ca[sid]["events"].append({
      "title": ev["title"], "date": ev["date"], "time": ev["time"],
      "fnm": ev["fnm"], "prerelease": ev["prerelease"], "format": ev["format"],
    })

  for s in ca.values():
    s["fnm"] = any(e["fnm"] for e in s["events"]) or any("friday night" in e["title"].lower() for e in s["events"])
    s["prerelease"] = any(e["prerelease"] for e in s["events"])
    # formats from FNM (and commander nights labelled FNM)
    fmts = []
    for e in s["events"]:
      if e["fnm"] or "friday night" in e["title"].lower():
        if e["format"] not in fmts:
          fmts.append(e["format"])
    s["fnmFormats"] = fmts
    # upcoming prerelease date strings
    s["prereleaseDates"] = [f'{e["date"]} {e["time"]}'.strip() for e in s["events"] if e["prerelease"]][:5]
    # WPN partner stores can run prereleases; flag partners (all locator stores are WPN)
    s["partner"] = True

  rows = sorted(ca.values(), key=lambda s: (s["name"].lower(), s["id"]))
  slim = []
  for s in rows:
    fnm_ev, pre_ev = [], []
    for e in s.get("events") or []:
      row = {"title": e["title"][:100], "date": e.get("date", ""), "time": e.get("time", ""), "format": e.get("format", "Other")}
      if e.get("fnm") and len(fnm_ev) < 3:
        fnm_ev.append(row)
      if e.get("prerelease") and len(pre_ev) < 4:
        pre_ev.append(row)
    slim.append({
      "id": s["id"], "name": s["name"], "lat": round(s["lat"], 5), "lon": round(s["lon"], 5),
      "addr": s.get("addr") or "", "phone": s.get("phone") or "", "web": s.get("web") or "",
      "partner": True, "legendary": bool(s.get("legendary")),
      "fnm": bool(s.get("fnm")), "fnmFormats": s.get("fnmFormats") or [], "fnmNext": fnm_ev,
      "prerelease": bool(s.get("prerelease")), "prereleaseNext": pre_ev,
    })
  payload = {
    "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
    "source": {
      "name": "Wizards Store & Event Locator",
      "url": "https://locator.wizards.com/",
      "note": "Public HTML search pages, no API key. Snapshot of Canadian WPN stores and nearby upcoming Magic events.",
    },
    "counts": {
      "stores": len(slim),
      "withFnm": sum(1 for s in slim if s["fnm"]),
      "withPrerelease": sum(1 for s in slim if s["prerelease"]),
    },
    "stores": slim,
  }
  rows = slim
  OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
  print("Wrote", OUT, "stores", len(rows), "fnm", payload["counts"]["withFnm"], "prerelease", payload["counts"]["withPrerelease"])

if __name__ == "__main__":
  main()
