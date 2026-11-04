#!/usr/bin/env python3
"""Forest LOD + year-slider smoke. Overview + pack year masks; coarse <1MB; no GFW at z6 Canada."""
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
    b=await p.chromium.launch(executable_path=EXE,args=["--use-gl=angle","--use-angle=swiftshader","--disk-cache-size=1"])
    ctx=await b.new_context(viewport={"width":1280,"height":900}, device_scale_factor=2)
    page=await ctx.new_page()
    cdp=await ctx.new_cdp_session(page)
    await cdp.send("Network.setCacheDisabled",{"cacheDisabled":True})
    await page.add_init_script("""()=>{try{localStorage.clear();localStorage.setItem('sunny-geo-ask','done');localStorage.setItem('sunny-geo-ok','0');localStorage.setItem('sunny-overlay-none','1')}catch(e){}}""")
    await page.goto(base,wait_until='load',timeout=120000)
    await page.wait_for_function('()=>window.map&&map.loaded&&map.loaded()',timeout=90000)
    await page.evaluate("""()=>{
      const b=[...document.querySelectorAll('button')].find(x=>/not now/i.test(x.textContent||''));
      if(b)b.click();
      (document.getElementById('lp-tab')||document.querySelector('.lp-tab'))?.click();
    }""")
    await page.wait_for_function("""()=>window.__sunnyForestTest""",timeout=90000)
    early=await page.evaluate("""async()=>window.__sunnyForestTest.overviewCount(2001,2005,'loss')""")
    late=await page.evaluate("""async()=>window.__sunnyForestTest.overviewCount(2020,2024,'loss')""")
    # Canada z8 pack (in coverage)
    x,y=xyz(-96,56,8)
    e8=await page.evaluate("""async(a)=>window.__sunnyForestTest.liveCount(a[0],a[1],a[2],2001,2005)""",[8,x,y])
    l8=await page.evaluate("""async(a)=>window.__sunnyForestTest.liveCount(a[0],a[1],a[2],2020,2024)""",[8,x,y])
    # Amazon z8 if present
    ax,ay=xyz(-55,-10,8)
    eA=await page.evaluate("""async(a)=>window.__sunnyForestTest.liveCount(a[0],a[1],a[2],2001,2005)""",[8,ax,ay])
    lA=await page.evaluate("""async(a)=>window.__sunnyForestTest.liveCount(a[0],a[1],a[2],2020,2024)""",[8,ax,ay])
    report["year"]={"ov_early":early,"ov_late":late,"ca8_early":e8,"ca8_late":l8,"am8_early":eA,"am8_late":lA}
    assert early>1000 and late>100 and early!=late
    assert e8>0 and l8>0 and e8!=l8, report["year"]
    sizes=await page.evaluate("""async()=>{
      const urls=['data/human/forest-ov/ov-raw.png','data/human/forest-ov/ov-ifl.png'];
      let n=0; for(const u of urls){ const r=await fetch(u); n+=(await r.arrayBuffer()).byteLength; } return n;
    }""")
    report["coarseBytes"]=sizes
    assert sizes < BUDGET
    # z6 Canada must not hit GFW
    gfw={"n":0}
    def on_req(req):
      if "globalforestwatch.org" in req.url: gfw["n"]+=1
    page.on("request", on_req)
    await page.evaluate("""()=>{
      SunnyLayers.set('forest',true);
      SunnyLayers.kidSet('forest-loss',true);
      SunnyLayers.kidSet('forest-drv',true);
      SunnyLayers.kidSet('forest-ifl',true);
      map.jumpTo({center:[-96,56],zoom:6});
    }""")
    await page.wait_for_timeout(5000)
    page.remove_listener("request", on_req)
    report["z6_gfw_requests"]=gfw["n"]
    assert gfw["n"]==0, report
    print("PASS", json.dumps(report))
    await b.close()
  return 0
if __name__=='__main__':
  raise SystemExit(asyncio.run(main()))
