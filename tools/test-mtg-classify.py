#!/usr/bin/env python3
"""SUNNY t376u fixtures: prerelease team/format labels come only from the event's own fields.
Usage: python3 tools/test-mtg-classify.py"""
import importlib.util, sys
from pathlib import Path
sp = importlib.util.spec_from_file_location("e", Path(__file__).with_name("enrich-mtg-locator.py"))
m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m)
SETS = [{"code": "trk", "name": "Star Trek", "prerelease": {"start": "2026-11-06", "end": "2026-11-12"}}]
def ev(i, title, desc="", team=1, fmt="Sealed Deck", t="2026-11-07T23:00:00.0000000Z", tz="America/Toronto"):
  return {"id": i, "title": title, "description": desc, "requiredTeamSize": team, "eventFormat": {"name": fmt},
          "tags": ["magic_prerelease"], "scheduledStartTime": t, "timeZone": tz}
bad = []
def eq(got, want, msg):
  print(("ok   " if got == want else "FAIL ") + msg + ("" if got == want else " got %r want %r" % (got, want)))
  if got != want: bad.append(msg)
r = m.row_of(ev(1, "Saturday 6pm 2hg Prerelease", team=2), SETS)
eq((r["format"], r["teams"]), ("Sealed Deck", "Two-Headed Giant"), "explicit 2HG + teams of 2 + Sealed")
eq(r["src"], "https://locator.wizards.com/en/event/1", "event source link")
eq(m.row_of(ev(2, "Star Trek Prerelease", team=2), SETS)["teams"], "Teams of two — variant not confirmed", "teams of 2 with no 2HG wording")
eq(m.row_of(ev(3, "Team Sealed Prerelease", "teams of two share a pool", team=1), SETS)["teams"], "", "generic team sealed wording, solo signup: no label")
eq(m.row_of(ev(4, "Prerelease", "No 2HG this time, regular sealed", team=2), SETS)["teams"], "Teams of two — variant not confirmed", "negated 2HG does not confirm")
eq(m.row_of(ev(5, "Saturday Prerelease", "Our 6:30 events are Two-Headed Giant", team=1), SETS)["teams"], "", "2HG text about another session does not label a solo event")
eq(m.row_of(ev(6, "Two-Headed Giant Prerelease", team=1), SETS)["teams"], "Title says Two-Headed Giant · signup not set as teams", "title/signup conflict shown, not asserted")
r = m.row_of(ev(7, "Prerelease", "Capacity: 44 Players, pods of four, Rounds 3", team=1), SETS)
eq((r["teams"], r["notes"]), ("", []), "four-player / pods wording is not 2HG and adds no label")
eq(m.row_of(ev(8, "Commander Prerelease", "four-player free-for-all", fmt="Commander"), SETS)["teams"], "", "Commander pods are not 2HG")
eq(m.row_of(ev(18, "Casual Star Trek Commander Night Prerelease"), SETS)["notes"], ["Title says Commander · listed as Sealed Deck"], "Commander title on a Sealed listing is labelled")
eq(m.row_of(ev(19, "Star Trek Sealed Commander Prerelease"), SETS)["notes"], [], "Sealed Commander matches its Sealed listing")
eq(m.row_of(ev(9, "Prerelease", "$50 for sealed and $40 for draft"), SETS)["notes"], [], "draft pricing for another session adds no Draft note")
eq(m.row_of(ev(10, "Prerelease", "Bo1 sealed; Bo3 on Sunday"), SETS)["notes"], [], "mixed best-of wording adds nothing")
eq(m.row_of(ev(11, "Prerelease", "3 rounds best of three"), SETS)["notes"], ["Best of three"], "single best-of variant kept")
eq(m.row_of(ev(12, "Prerelease", fmt="Other"), SETS)["format"], "Not listed", "Other format is unknown, not Sealed")
a = m.row_of(ev(13, "Fri Prerelease", t="2026-11-07T04:30:00.0000000Z"), SETS)
eq((a["date"], a["time"]), ("Fri, Nov 6", "11:30 PM"), "UTC after midnight groups on the local day")
b = m.row_of(ev(14, "Prerelease", t="2026-11-08T02:00:00+00:00", tz="America/Winnipeg"), SETS)
eq((b["date"], b["time"]), ("Sat, Nov 7", "8:00 PM"), "offset timestamp + store zone")
eq(m.row_of(ev(15, "Foundations Prerelease", t="2025-11-07T23:00:00Z"), SETS)["set"], "", "stale date outside the set window gets no set")
x, y = m.row_of(ev(16, "2HG Prerelease", team=2), SETS), m.row_of(ev(17, "Draft Prerelease", fmt="Booster Draft"), SETS)
eq((x["teams"], y["teams"], y["format"]), ("Two-Headed Giant", "", "Booster Draft"), "two events at one store keep their own formats")
eq(m.row_of(ev("1;alert(1)", "Prerelease"), SETS)["src"], "", "non-numeric event id gets no link")
# t376u store-page overlay: exact-slot agree upgrades, conflicts stay visible, bad URLs ignored
base = lambda team, title="Prerelease": m.row_of(ev(30, title, team=team), SETS) | {"fee": "CA$50"}
o = m.apply_official(base(2), {"url": "https://shop.example/products/x", "match": "agree", "says": "Two-Headed Giant", "evidence": "Sat 6 PM 2HG", "fee": "$100 per team"})
eq((o["teams"], o.get("feeStore")), ("Two-Headed Giant · store page", None), "teams of two + store page 2HG at same slot upgrades; per-team fee is not a conflict")
o = m.apply_official(base(2, "2HG Prerelease"), {"url": "https://shop.example/p", "match": "conflict", "says": "Sealed (solo)", "evidence": "regular", "fee": "$50"})
eq(o["teams"], "Wizards says Two-Headed Giant · store page differs", "Wizards 2HG vs store solo shows the conflict")
o = m.apply_official(base(1), {"url": "https://shop.example/p", "match": "conflict", "says": "Two-Headed Giant", "evidence": "Sun 2HG", "fee": ""})
eq(o["teams"], "Store page says Two-Headed Giant · Wizards lists solo", "store 2HG vs Wizards solo shows the conflict")
o = m.apply_official(base(1), {"url": "https://shop.example/p", "match": "agree", "says": "Sealed, best of 1", "evidence": "bo1", "fee": "$45"})
eq((o["feeStore"], o["notes"]), ("$45", ["Best of one (store page)"]), "store fee differs: kept beside the Wizards fee")
o = m.apply_official(base(2), {"url": "javascript:alert(1)", "match": "agree", "says": "Two-Headed Giant"})
eq((o["teams"], "off" in o), ("Teams of two — variant not confirmed", False), "non-https store URL is ignored")
eq(m.apply_official(base(2), None)["teams"], "Teams of two — variant not confirmed", "no store check: label unchanged")
print("classify:", "FAIL %d" % len(bad) if bad else "ok")
sys.exit(1 if bad else 0)
