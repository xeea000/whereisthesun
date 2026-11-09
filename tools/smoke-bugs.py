#!/usr/bin/env python3
"""SUNNY focused regressions for provable bugs fixed in t378u (opt241+). Usage: smoke-bugs.py URL
Each check prints PASS/FAIL; exit 1 on any FAIL. Headless Chromium, no network needed beyond the local server
(map tiles may fail offline; checks read the map style, not pixels)."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
EXE = os.environ.get("SUNNY_CHROME", "/home/box/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"
FAILS = []
def check(name, ok, info=""):
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  " + str(info)[:400]), flush=True)
    if not ok: FAILS.append(name)
async def boot(b, store=None, w=1366, url=None):
    ctx = await b.new_context(viewport={"width": w, "height": 800}, service_workers="block")
    if store:
        await ctx.add_init_script("(()=>{const s=%s;for(const k in s)localStorage.setItem(k,s[k]);})()" % json.dumps(store))
    pg = await ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    await pg.goto(url or URL, wait_until="load", timeout=120000)
    await pg.wait_for_function("()=>window.map&&map.loaded&&map.loaded()&&window.SunnyLayers", timeout=90000)
    return ctx, pg, errs
LEGACY = {"craters": "craters-dot", "observatories": "obs-point", "skyglow": "skyglow-raster", "crown": "crown-land"}
VIS = "(id)=>!!map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none'"
async def lazy_legacy(b):
    """Bug 1: lazily loaded older layers (craters, observatories, light pollution, Crown land) drew nothing
    when switched on from the Layers panel, and their saved on-state did not restore at boot."""
    ctx, pg, errs = await boot(b)
    await pg.evaluate("()=>document.getElementById('lp-tab').click()")
    await pg.wait_for_function("()=>SunnyLayerLazy.ready()", timeout=60000)
    await pg.evaluate("()=>map.jumpTo({center:[-79.4,45],zoom:5})")
    for lid, mid in LEGACY.items():
        await pg.evaluate("(id)=>SunnyLayers.set(id,true)", lid)
        try:
            await pg.wait_for_function("(id)=>!!map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none'", arg=mid, timeout=45000)
            ok = True
        except Exception:
            ok = False
        check("lazy layer draws: " + lid, ok, await pg.evaluate("()=>map.getStyle().layers.map(l=>l.id).join(',')"))
        await pg.evaluate("(id)=>SunnyLayers.set(id,false)", lid)
        await pg.wait_for_timeout(400)
        check("lazy layer hides: " + lid, not await pg.evaluate(VIS, mid))
    check("lazy legacy no page errors", not errs, errs)
    await ctx.close()
    store = {"sunny-layers-off-v1": "1", "sunny-craters": "1", "sunny-skyglow": "1"}
    ctx, pg, errs = await boot(b, store)
    try:
        await pg.wait_for_function("()=>map.getLayer('craters-dot')&&map.getLayer('skyglow-raster')", timeout=30000)
        ok = True
    except Exception:
        ok = False
    check("saved legacy layers restore at boot without opening the panel", ok)
    check("saved legacy rows read on", await pg.evaluate("()=>SunnyLayers.isOn('craters')&&SunnyLayers.isOn('skyglow')"))
    await ctx.close()
SEG = "()=>{const b=document.querySelector('#overlay-seg .seg-btn.is-on');return b?b.getAttribute('data-overlay'):'none'}"
def enc(st):
    import base64
    return base64.urlsafe_b64encode(json.dumps(st, separators=(",", ":")).encode()).decode().rstrip("=")
async def share_restore(b):
    """Bug 2: share links lost the overlay (Clouds was never written, and a link's mode switched the
    recipient's same saved mode off) and a shared layer with every sub-switch off came back with defaults."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1"})
    await pg.evaluate("()=>document.querySelector('#overlay-seg [data-overlay=\"clouds\"]').click()")
    await pg.wait_for_timeout(500)
    st = await pg.evaluate("()=>SunnyShare.build()")
    check("share writes Clouds", st.get("o") == "clouds", st)
    await pg.evaluate("()=>document.querySelector('#overlay-seg [data-overlay=\"clouds\"]').click()")
    await pg.wait_for_timeout(300)
    st = await pg.evaluate("()=>SunnyShare.build()")
    check("share writes none", st.get("o") == "none", st)
    await pg.evaluate("()=>document.getElementById('lp-tab').click()")
    await pg.wait_for_function("()=>SunnyLayerLazy.ready()", timeout=60000)
    await pg.evaluate("()=>{SunnyLayers.set('mtg',true);SunnyLayers.defs().find(d=>d.id==='mtg').kids.forEach(k=>SunnyLayers.kidSet(k.id,false))}")
    st = await pg.evaluate("()=>SunnyShare.build()")
    check("share writes empty kid list", st.get("k") == [], st)
    await ctx.close()
    base = URL.split("#")[0]
    for mode, store in (("clouds", {}), ("radar", {"sunny-overlay": "radar", "sunny-overlay-none": "0"})):
        h = enc({"v": 1, "c": [43.65, -79.38, 6, 0, 0], "o": mode})
        st0 = dict(store); st0["sunny-layers-off-v1"] = "1"; st0["sunny-geo-ask"] = "done"
        ctx = await b.new_context(viewport={"width": 1366, "height": 800}, service_workers="block")
        await ctx.add_init_script("(()=>{const s=%s;for(const k in s)localStorage.setItem(k,s[k]);})()" % json.dumps(st0))
        pg = await ctx.new_page()
        await pg.goto(base + "#s=" + h, wait_until="load", timeout=120000)
        await pg.wait_for_function("()=>window.map&&map.loaded&&map.loaded()&&window.SunnyLayers", timeout=90000)
        try:
            await pg.wait_for_function(SEG.replace("return b?", "return (b?").replace(":'none'}", ":'none')===%s}" % json.dumps(mode)), timeout=20000)
        except Exception:
            pass
        got = await pg.evaluate(SEG)
        check("share link restores %s (recipient saved %s)" % (mode, store.get("sunny-overlay", "nothing")), got == mode, got)
        await ctx.close()
    h = enc({"v": 1, "c": [43.65, -79.38, 6, 0, 0], "l": ["mtg"], "k": []})
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1"}, url=base + "#s=" + h)
    await pg.wait_for_function("()=>window.SunnyLayers&&SunnyLayers.isOn('mtg')", timeout=60000)
    await pg.wait_for_timeout(1500)
    kids = await pg.evaluate("()=>SunnyLayers.defs().find(d=>d.id==='mtg').kids.filter(k=>localStorage.getItem('sunny-L-'+k.id)==='1'||(localStorage.getItem('sunny-L-'+k.id)==null&&k.dflt)).map(k=>k.id)")
    check("share link restores all sub-switches off", kids == [], kids)
    await ctx.close()
async def goes_slots(b):
    """Bug 3: Clouds asked GIBS for GOES slots it never published (a plain 10-min grid; GIBS skips slots
    and can run over an hour late), so turning Clouds on or playing gave runs of 404 tiles."""
    ctx = await b.new_context(viewport={"width": 1366, "height": 800}, service_workers="block")
    await ctx.add_init_script("(()=>{localStorage.setItem('sunny-layers-off-v1','1');localStorage.setItem('sunny-geo-ask','done');})()")
    pg = await ctx.new_page()
    bad = []
    pg.on("response", lambda r: bad.append(r.url[-90:]) if r.status >= 400 and "gibs.earthdata" in r.url else None)
    await pg.goto(URL, wait_until="load", timeout=120000)
    await pg.wait_for_function("()=>window.map&&map.loaded&&map.loaded()", timeout=90000)
    try:
        await pg.wait_for_function("()=>typeof goesDomain!=='undefined'&&goesDomain", timeout=20000)
        known = True
    except Exception:
        known = False
    check("GOES published slots known at boot (DescribeDomains)", known)
    await pg.evaluate("()=>map.jumpTo({center:[-79.4,43.7],zoom:6})")
    await pg.evaluate("()=>document.querySelector('#overlay-seg [data-overlay=\"clouds\"]').click()")
    await pg.wait_for_timeout(12000)
    miss = await pg.evaluate("()=>typeof goesHas==='function'?cloudTimes.filter(t=>!goesHas(Date.parse(t),-79)):['no domain check']")
    check("timeline holds only published GOES slots", known and not miss, miss[:5])
    await pg.evaluate("()=>{const b=document.getElementById('btn-play');if(b)b.click();}")
    await pg.wait_for_timeout(10000)
    check("no GIBS 4xx with Clouds on and Play", not bad, bad[:5])
    await ctx.close()
PIXEL_JS = """async()=>{
  const w=64,h=48,c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  const cols=['#415b9e','#d2d4b4','#00ff00','#ff0000','#4bd690','#808cb0'];
  for(let i=0;i<cols.length;i++){x.fillStyle=cols[i];x.fillRect(i*10,0,10,h);}
  const url=URL.createObjectURL(await new Promise(r=>c.toBlob(r,'image/png')));
  const job=SunnyRadarKey.keyUrl(url,w,h);if(!job)return {skip:true};
  const bmp=await job;const a=document.createElement('canvas');a.width=w;a.height=h;
  const ax=a.getContext('2d',{willReadFrequently:true});ax.drawImage(bmp,0,0);const d1=ax.getImageData(0,0,w,h).data;
  const img=new Image();img.src=url;await img.decode();const p=document.createElement('canvas');p.width=w;p.height=h;
  const px=p.getContext('2d',{willReadFrequently:true});px.imageSmoothingEnabled=true;px.imageSmoothingQuality='high';
  px.drawImage(img,0,0,w,h);SunnyRadarKey.keyCanvas(px,w,h);const d2=px.getImageData(0,0,w,h).data;
  let diff=0,clear=0;for(let i=0;i<d1.length;i++)if(d1[i]!==d2[i])diff++;for(let i=3;i<d1.length;i+=4)if(!d1[i])clear++;
  return {diff,clear}}"""
async def pixel_same(b):
    """opt247 perf guard: the radar weak-echo filter in pixel-worker.js gives the same pixels as the page path."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"})
    r = await pg.evaluate(PIXEL_JS)
    check("pixel worker matches the page radar filter", not r.get("skip") and r["diff"] == 0 and r["clear"] > 0, r)
    await ctx.close()
PEEK_FIND = """async(id)=>{const s=t=>new Promise(r=>setTimeout(r,t));const d=SunnyLayers.defs().find(x=>x.id===id);
  for(const v of [[-79.4,43.7,7],[-81,46,6],[-100,50,4]]){map.jumpTo({center:[v[0],v[1]],zoom:v[2]});await s(3500);
    const taps=(d.taps||[]).filter(t=>map.getLayer(t));let fs=[];try{fs=map.queryRenderedFeatures({layers:taps})}catch(e){}
    const W=map.getCanvas().clientWidth,H=map.getCanvas().clientHeight,r=map.getCanvas().getBoundingClientRect();
    for(const f of fs){if(f.geometry.type!=='Point'||f.properties.point_count)continue;const p=map.project(f.geometry.coordinates);
      if(p.x<200||p.x>W-200||p.y<150||p.y>H-150)continue;const e=document.elementFromPoint(r.left+p.x,r.top+p.y);
      if(e===map.getCanvas())return {x:r.left+p.x,y:r.top+p.y}}}
  return null}"""
PEEK_SHOWN = "()=>{const p=document.getElementById('ip-peek');return !!p&&!p.hidden&&p.innerText.length>0}"
async def peek_closes(b):
    """t382u bug: the info peek from a layer stayed open after that layer was switched off."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done", "sunny-lp-open": "0"})
    await pg.evaluate("()=>{const n=[...document.querySelectorAll('button')].find(x=>/not now/i.test(x.textContent||''));if(n)n.click();}")
    await pg.evaluate("()=>SunnyLayerLazy.load()")
    await pg.evaluate("()=>SunnyLayers.set('parks',true)")
    await pg.wait_for_timeout(3000)
    pt = await pg.evaluate(PEEK_FIND, "parks")
    if not pt:
        check("peek closes with its layer (found a park to tap)", False, "no tappable park")
        return await ctx.close()
    await pg.mouse.click(pt["x"], pt["y"])
    await pg.wait_for_timeout(3000)
    opened = await pg.evaluate(PEEK_SHOWN)
    await pg.evaluate("()=>SunnyLayers.set('quakes',false)")
    await pg.wait_for_timeout(800)
    check("peek stays when another layer goes off", await pg.evaluate(PEEK_SHOWN))
    await pg.evaluate("()=>SunnyLayers.set('parks',false)")
    await pg.wait_for_timeout(1200)
    still = await pg.evaluate(PEEK_SHOWN)
    check("peek closes with its layer", opened and not still, {"opened": opened, "still": still})
    await ctx.close()
MTG_JS = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));await SunnyLayerLazy.load();
  map.jumpTo({center:[-90,52],zoom:3});await s(6000);
  const d=SunnyLayers.defs().find(x=>x.id==='mtg');const leg=d&&d.legend?String(d.legend()):'';
  const n=map.getLayer('mtg-dot')?map.queryRenderedFeatures({layers:['mtg-dot']}).length:-1;
  const f=map.getLayer('mtg-dot')?map.queryRenderedFeatures({layers:['mtg-dot']})[0]:null;
  const today=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const pre=f?JSON.parse(f.properties.preJson).filter(e=>String(e.iso||'').slice(0,10)<today&&/^\\d{4}/.test(e.iso||'')).length:-1;
  return {leg:/Legendary/.test(leg),n,preGone:pre}}"""
async def mtg_honest(b):
    """t382u missed promises: the Past prerelease switch matched no store (snapshot "next" events never aged into past),
    and the legend keyed a Legendary star no store in the data carries."""
    store = {"sunny-layers-off-v1": "1", "sunny-L-mtg": "1", "sunny-L-mtg-pre": "0", "sunny-L-mtg-past": "1",
             "sunny-L-mtg-fnm-cmd": "0", "sunny-L-mtg-fnm-std": "0", "sunny-L-mtg-fnm-oth": "0"}
    ctx, pg, errs = await boot(b, store)
    r = await pg.evaluate(MTG_JS)
    check("mtg Past switch alone shows stores with a past prerelease", r["n"] > 0, r)
    check("mtg cards list no gone-by day as an upcoming prerelease", r["preGone"] == 0, r)
    leg = await pg.evaluate("()=>fetch('data/mtg-stores.json').then(r=>r.json()).then(d=>d.stores.some(x=>x.legendary))")
    check("mtg legend keys Legendary only when the data has one", r["leg"] == leg, {"legend": r["leg"], "data": leg})
    await ctx.close()
async def labels_bar(b):
    """t382u: with Labels saved on, the bottom-bar Labels box showed unchecked for the first seconds after load."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-labels": "1"})
    r = await pg.evaluate("()=>[document.getElementById('bar-labels').checked,document.getElementById('toggle-map').checked]")
    check("bar Labels box matches the saved Labels setting at load", r == [True, True], r)
    await ctx.close()
async def radar_span(b):
    """t382u missed promise: Time span 24h/12h/6h changed nothing on Radar (frames are always the last 3 hours)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1"})
    span = "()=>[[...document.querySelectorAll('#range-seg [data-range]')].every(x=>x.disabled),!(document.getElementById('range-radar-note')||{hidden:true}).hidden]"
    check("time span buttons work while Clouds is on", await pg.evaluate(span) == [False, False])
    await pg.evaluate("()=>document.querySelector('#overlay-seg [data-overlay=\"radar\"]').click()")
    await pg.wait_for_timeout(800)
    check("radar turns the time span off and says the last 3 hours", await pg.evaluate(span) == [True, True])
    await ctx.close()
BASE_SYM = """async(mode)=>{const s=t=>new Promise(r=>setTimeout(r,t));map.jumpTo({center:[-79.4,43.7],zoom:9});
  [...document.querySelectorAll('#basemap-seg .seg-btn')].find(b=>b.getAttribute('data-basemap')===mode).click();await s(6000);
  const n=()=>map.queryRenderedFeatures().filter(f=>f.layer.type==='symbol'&&f.layer.id.indexOf('vb-')===0).length;
  const tm=document.getElementById('toggle-map');if(tm.checked)tm.click();await s(2500);const off=n();tm.click();await s(4000);const on=n();
  return {off,on}}"""
async def labels_base(b):
    """t382u: with Labels off, the Dark base map still drew its own place and road names (57 on screen)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-labels": "0"})
    for mode in ("dark", "roads"):
        r = await pg.evaluate(BASE_SYM, mode)
        check("Labels off hides the %s base map's own names" % mode, r["off"] == 0 and r["on"] > 0, r)
    await ctx.close()
async def main():
    only = os.environ.get("SUNNY_BUGS_ONLY", "")
    tests = [lazy_legacy, share_restore, goes_slots, pixel_same, peek_closes, mtg_honest, labels_bar, radar_span, labels_base]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE, args=["--use-gl=angle", "--use-angle=swiftshader"])
        for t in tests:
            if only and t.__name__ not in only.split(","): continue
            try:
                await t(b)
            except Exception as e:
                check(t.__name__ + " ran", False, e)
        await b.close()
    print("smoke-bugs: %d fail" % len(FAILS))
    sys.exit(1 if FAILS else 0)
asyncio.run(main())
