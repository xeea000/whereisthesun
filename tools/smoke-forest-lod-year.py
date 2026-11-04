#!/usr/bin/env python3
"""Forest LOD + year-slider smoke. Asserts overview/live year masks differ and coarse <1MB."""
import asyncio, json, math, sys, time
from playwright.async_api import async_playwright
BUDGET=1_000_000
EXE="/home/box/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell"
def xyz(lon,lat,z):
  n=2**z; x=int((lon+180)/360*n); lat_r=math.radians(lat)
  y=int((1-math.log(math.tan(lat_r)+1/math.cos(lat_r))/math.pi)/2*n); return x,y
async def main():
  base=sys.argv[1] if len(sys.argv)>1 else "http://127.0.0.1:8765/"
  report={"at":time.strftime("%Y-%m-%d %H:%M %Z"),"base":base}
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=EXE,args=["--use-gl=angle","--use-angle=swiftshader"])
    page=await (await b.new_context(viewport={"width":1280,"height":900})).new_page()
    await page.add_init_script("""()=>{try{localStorage.clear();localStorage.setItem('sunny-geo-ask','done');localStorage.setItem('sunny-geo-ok','0');localStorage.setItem('sunny-overlay-none','1')}catch(e){}}""")
    await page.goto(base,wait_until='load',timeout=120000)
    await page.wait_for_function('()=>window.map&&map.loaded&&map.loaded()',timeout=90000)
    await page.evaluate("""()=>{(document.getElementById('lp-tab')||document.querySelector('.lp-tab'))?.click();}""")
    await page.wait_for_function("""()=>window.__sunnyForestTest""",timeout=90000)
    early=await page.evaluate("""async()=>window.__sunnyForestTest.overviewCount(2001,2005,'loss')""")
    late=await page.evaluate("""async()=>window.__sunnyForestTest.overviewCount(2020,2024,'loss')""")
    x,y=xyz(-55,-10,10)
    e10=await page.evaluate("""async(a)=>window.__sunnyForestTest.liveCount(a[0],a[1],a[2],2001,2005)""",[10,x,y])
    l10=await page.evaluate("""async(a)=>window.__sunnyForestTest.liveCount(a[0],a[1],a[2],2020,2024)""",[10,x,y])
    report["year"]={"ov_early":early,"ov_late":late,"live10_early":e10,"live10_late":l10}
    assert early>1000 and late>100 and early!=late
    assert e10>0 and l10>0 and e10!=l10
    # coarse budget: overview assets only
    sizes=await page.evaluate("""async()=>{
      const urls=['data/human/forest-ov/ov-raw.png','data/human/forest-ov/ov-ifl.png'];
      let n=0; for(const u of urls){ const r=await fetch(u); n+=(await r.arrayBuffer()).byteLength; } return n;
    }""")
    report["coarseBytes"]=sizes
    assert sizes < BUDGET
    print("PASS", json.dumps(report))
    await b.close()
  return 0
if __name__=='__main__':
  raise SystemExit(asyncio.run(main()))
