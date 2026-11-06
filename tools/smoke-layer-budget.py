#!/usr/bin/env python3
"""SUNNY shared layer bandwidth budget smoke (Kol hard rule).
Every named layer: cold-ish bytes at world z2 and Canada z4 after enable.
Fail if any view > BUDGET (1 MB). Basemap / app-shell traffic excluded.
Usage:
  python3 tools/smoke-layer-budget.py [base_url]
  SUNNY_BUDGET_OUT=/tmp/out.json python3 tools/smoke-layer-budget.py
Exit 0 = pass, 1 = budget fail, 2 = setup/runtime error.
"""
from __future__ import annotations
import asyncio, json, os, re, sys, time
from playwright.async_api import async_playwright

BUDGET = int(os.environ.get("SUNNY_BUDGET_BYTES", "1000000"))
EXE = os.environ.get(
  "SUNNY_PW_EXE",
  "/home/box/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell",
)
VIEWS = [
  ("world_z2", 0, 20, 2),
  ("canada_z4", -96, 56, 4),
]
SKIP_IDS = {
  "skycard-attach", "skydraw-attach", "famous-attach", "maxdetail-attach",
}
# App shell + basemap — not charged to a layer.
DENY = re.compile(
  r"(openfreemap|tile\.openstreetmap|fonts\.|maptiler|maplibre|"
  r"googleapis|gstatic|unpkg\.com|jsdelivr|"
  r"lag-o-meter|/sw\.js|version\.json|favicon|"
  r"\.js(\?|$)|\.css(\?|$)|\.woff2?(\?|$)|\.html(\?|$)|"
  r"data:)",
  re.I,
)
SETTLE_MS = int(os.environ.get("SUNNY_BUDGET_SETTLE_MS", "3500"))
OUT = os.environ.get("SUNNY_BUDGET_OUT", "/tmp/sunny-layer-budget.json")

def chargeable(url: str) -> bool:
  if not url or url.startswith("blob:"):
    return False
  return DENY.search(url) is None

async def main() -> int:
  base = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SUNNY_SMOKE_URL", "http://127.0.0.1:8765/")
  report = {
    "budget": BUDGET, "base": base, "at": time.strftime("%Y-%m-%d %H:%M %Z"),
    "layers": {}, "fails": [], "skipped": sorted(SKIP_IDS),
  }
  try:
    async with async_playwright() as p:
      b = await p.chromium.launch(
        executable_path=EXE,
        args=["--use-gl=angle", "--use-angle=swiftshader", "--disk-cache-size=1"],
      )
      ctx = await b.new_context(viewport={"width": 1280, "height": 900})
      page = await ctx.new_page()
      cdp = await ctx.new_cdp_session(page)
      await cdp.send("Network.enable")
      await cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
      await page.add_init_script("""()=>{try{
        localStorage.clear();
        localStorage.setItem('sunny-geo-ask','done');
        localStorage.setItem('sunny-geo-ok','0');
        localStorage.setItem('sunny-overlay-none','1');
      }catch(e){}}""")
      await page.goto(base, wait_until="load", timeout=120000)
      await page.wait_for_function("()=>window.map&&map.loaded&&map.loaded()", timeout=90000)
      await page.wait_for_timeout(800)
      await page.evaluate("""()=>{
        const b=[...document.querySelectorAll('button')].find(x=>/not now/i.test(x.textContent||''));
        if(b)b.click();
        (document.getElementById('lp-tab')||document.querySelector('.lp-tab'))?.click();
      }""")
      # Force lazy layer pack
      await page.evaluate("""async()=>{
        if(window.SunnyLayerLazy&&window.SunnyLayerLazy.load) await window.SunnyLayerLazy.load();
      }""")
      await page.wait_for_function("""()=>{
        try{return window.SunnyLayers&&window.SunnyLayers.defs().length>20;}catch(e){return false}
      }""", timeout=120000)
      await page.wait_for_timeout(1500)
      defs = await page.evaluate("""()=>window.SunnyLayers.defs()
        .filter(d=>d.name&&d.id)
        .map(d=>({id:d.id,name:d.name,group:d.group||''}))""")
      defs = [d for d in defs if d["id"] not in SKIP_IDS]
      _only = os.environ.get("SUNNY_BUDGET_ONLY", "")
      if _only:
        defs = [d for d in defs if d["id"] in _only.split(",")]
      print(f"layers: {len(defs)} budget={BUDGET}", flush=True)
      await page.evaluate("""()=>{
        for(const d of window.SunnyLayers.defs()){
          if(!d.name) continue;
          try{window.SunnyLayers.set(d.id,false);}catch(e){}
        }
      }""")
      await page.wait_for_timeout(400)

      for d in defs:
        lid = d["id"]
        layer_rep = {"name": d["name"], "group": d["group"], "views": {}}
        for vname, lon, lat, z in VIEWS:
          await page.evaluate("""(id)=>{try{window.SunnyLayers.set(id,false);}catch(e){}}""", lid)
          await page.evaluate(f"()=>map.jumpTo({{center:[{lon},{lat}],zoom:{z}}})")
          await page.wait_for_timeout(600)
          await page.evaluate("()=>{try{performance.clearResourceTimings()}catch(e){}}")
          sizes = []
          urls = []
          async def on_resp(resp):
            try:
              if resp.status and resp.status >= 400:
                return
              u = resp.url
              if not chargeable(u):
                return
              cl = resp.headers.get("content-length")
              n = int(cl) if cl and cl.isdigit() else 0
              if not n:
                try:
                  n = len(await resp.body())
                except Exception:
                  n = 0
              if n:
                sizes.append(n)
                urls.append((u.split("/")[-2:] and "/".join(u.split("/")[-3:]), n))
            except Exception:
              pass
          page.on("response", on_resp)
          await page.evaluate("""(id)=>{try{window.SunnyLayers.set(id,true);}catch(e){}}""", lid)
          await page.wait_for_timeout(SETTLE_MS)
          page.remove_listener("response", on_resp)
          total = sum(sizes)
          perf = await page.evaluate("""()=>{
            const ents=performance.getEntriesByType('resource');
            let b=0,n=0;
            for(const e of ents){
              const u=e.name||'';
              if(/openfreemap|fonts\\.|maplibre|\\.js(\\?|$)|\\.css(\\?|$)|lag-o-meter|favicon/i.test(u)) continue;
              if(/^data:|^blob:/.test(u)) continue;
              b+=(e.transferSize||e.encodedBodySize||0); n++;
            }
            return {b,n};
          }""")
          use = max(total, perf["b"])
          layer_rep["views"][vname] = {
            "bytes": use, "headerSum": total, "perfBytes": perf["b"], "perfN": perf["n"],
            "top": sorted(urls, key=lambda x: -x[1])[:6],
          }
          flag = "FAIL" if use > BUDGET else "ok"
          print(f"  {lid:24} {vname}: {use/1e6:.3f} MB ({flag})", flush=True)
          if use > BUDGET:
            report["fails"].append({"id": lid, "view": vname, "bytes": use, "name": d["name"]})
          await page.evaluate("""(id)=>{try{window.SunnyLayers.set(id,false);}catch(e){}}""", lid)
          await page.wait_for_timeout(150)
        report["layers"][lid] = layer_rep

      await b.close()
  except Exception as e:
    report["error"] = str(e)[:500]
    with open(OUT, "w") as f:
      json.dump(report, f, indent=2)
    print("SETUP_FAIL", e, flush=True)
    print("wrote", OUT, flush=True)
    return 2

  with open(OUT, "w") as f:
    json.dump(report, f, indent=2)
  print(f"\nFAILS: {len(report['fails'])}", flush=True)
  for f in report["fails"]:
    print(f"  {f['id']} {f['view']}: {f['bytes']/1e6:.2f} MB — {f['name']}", flush=True)
  print("wrote", OUT, flush=True)
  return 1 if report["fails"] else 0

if __name__ == "__main__":
  raise SystemExit(asyncio.run(main()))
