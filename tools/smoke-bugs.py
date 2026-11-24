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
    check("t396u: no hidden Settings switches for craters, observatories or dark sky (the rows save their own state)",
          await pg.evaluate("()=>!document.querySelector('#toggle-craters,#toggle-observatories,#toggle-skyglow')"))
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
    left = await pg.evaluate("()=>{const p=document.getElementById('ip-peek');return p?p.innerText.slice(0,200):''}") if still else ""
    check("peek closes with its layer", opened and not still, {"opened": opened, "still": still, "left": left})
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
RADAR_SPAN = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));document.querySelector('#overlay-seg [data-overlay="radar"]').click();
  for(let i=0;i<60&&!(window.radarPast&&radarPast.length);i++)await s(1000);const out={};
  for(const h of ["6","12","24"]){document.querySelector('#range-seg [data-range="'+h+'"]').click();await s(1500);
    const p=window.radarPast||[];out[h]=[p.length,p.length?(p[p.length-1].time-p[0].time)/3600:0,document.querySelector('#range-seg [data-range="'+h+'"]').disabled]}
  out.kept=(window.radarPast||[]).filter((f,i)=>SunnyDataSaver.keepRadar(i)).length;return out}"""
async def radar_span(b):
    """t382u: Time span 24h/12h/6h changed nothing on Radar (frames were always the last 3 hours). Owner: radar follows the span
    at 10-minute steps from the IEM archive, and a Play loop over it fetches no missing frame."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1"})
    bad = []
    pg.on("response", lambda r: bad.append(r.status) if "mesonet.agron.iastate.edu" in r.url and r.status >= 400 else None)
    r = await pg.evaluate(RADAR_SPAN)
    for h, n in (("6", 37), ("12", 73), ("24", 145)):
        span_ok = r[h][0] in (n, n + 1) and abs(r[h][1] - int(h)) < 0.09
        check("radar shows the %s h span at 10-minute steps" % h, span_ok and not r[h][2], r)
    await pg.evaluate("()=>document.getElementById('btn-play').click()")
    await pg.wait_for_timeout(20000)
    played = await pg.evaluate("()=>document.getElementById('btn-play').getAttribute('aria-pressed')")
    check("radar Play over 24 h fetches no missing frame", played == "true" and not bad, {"pressed": played, "http": bad[:5]})
    check("Fewer frames keeps every 3rd radar frame", 47 <= r["kept"] <= 51, r["kept"])
    await ctx.close()
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-lowdata": "1"})
    r = await pg.evaluate(RADAR_SPAN)
    check("Low data keeps hourly radar frames", r["24"][0] in (145, 146) and 23 <= r["kept"] <= 27, r)
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
BEACH_BLADE = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));const n=[...document.querySelectorAll('button')].find(x=>/not now/i.test(x.textContent||''));if(n)n.click();
  map.jumpTo({center:[-79.4,43.65],zoom:10});document.getElementById('lp-tab').click();await s(1500);
  const g=[...document.querySelectorAll('#layers-panel .lp-head')].find(h=>/Outdoors/.test(h.textContent));
  const g0=g&&g.getAttribute('aria-expanded');if(g&&g.getAttribute('aria-expanded')!=='true')g.click();await s(300);
  const f=document.getElementById('beach-find'),b=document.getElementById('btn-sun'),sun=document.getElementById('toggle-sunny');
  const r={inControls:!!b.closest('.controls'),inBlade:!!(f&&f.closest('.lp-fold[data-layer="beaches"]')),seen:!!(b.offsetWidth&&b.offsetHeight),sunny:sun.checked,
    sunInBlade:!!sun.closest('.lp-fold[data-layer="beaches"]'),settingsRow:!!document.querySelector('#settings-pop #btn-all'),g0:g0};
  document.getElementById('status').textContent='';b.click();await s(2500);
  r.status=document.getElementById('status').textContent;r.shown=SunnyBeachToggle.isShown();r.rowOn=SunnyLayers.isOn('beaches');
  SunnyLayers.set('beaches',false);await s(500);r.off=!SunnyBeachToggle.isShown()&&document.body.classList.contains('beaches-hidden');return r}"""
async def beach_blade(b):
    """t384u: the legacy bottom-right Find Beaches button moved into the Beaches layer's controls (390 px phone)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
    r = await pg.evaluate(BEACH_BLADE)
    check("no Find Beaches button in the map's side controls", not r["inControls"], r)
    check("Find beaches, All beaches and Sunny only sit in the Beaches controls", r["inBlade"] and r["sunInBlade"] and r["seen"] and not r["settingsRow"], r)
    check("Outdoors group starts open", r["g0"] == "true", r)
    check("Sunny only starts on", r["sunny"], r)
    check("Find beaches runs the search, says so and turns the Beaches row on", bool(r["status"]) and r["shown"] and r["rowOn"], r)
    check("Beaches row off hides them again", r["off"], r)
    check("beach blade no page errors", not errs, errs)
    await ctx.close()
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-lp-g2-Outdoors": "0"}, w=390)
    g = await pg.evaluate("""async()=>{document.getElementById('lp-tab').click();await new Promise(r=>setTimeout(r,1500));
      const g=[...document.querySelectorAll('#layers-panel .lp-head')].find(h=>/Outdoors/.test(h.textContent));return g&&g.getAttribute('aria-expanded')}""")
    check("a saved folded Outdoors group stays folded", g == "false", g)
    await ctx.close()
SHARE_SET = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));
  document.querySelector('#basemap-seg [data-basemap="dark"]').click();document.querySelector('#range-seg [data-range="12"]').click();
  const op=document.getElementById('cloud-opacity');op.value='55';op.dispatchEvent(new Event('input'));
  document.getElementById('lp-tab').click();await SunnyLayerLazy.load();SunnyLayers.set('airbursts',true);await s(3000);
  const bx=document.querySelector('.air-year-range'),i=bx.querySelectorAll('input[type=range]');i[0].value='2000';i[1].value='2015';
  i[1].dispatchEvent(new Event('input'));await s(500);return SunnyShare.build()}"""
SHARE_GOT = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));for(let n=0;n<60&&!document.querySelector('.air-year-range');n++)await s(500);await s(3000);
  const on=(id)=>{const b=document.querySelector('#'+id+' .seg-btn.is-on');return b&&(b.dataset.basemap||b.dataset.range)};
  return {bm:on('basemap-seg'),h:on('range-seg'),op:document.getElementById('cloud-opacity').value,
    yr:(document.querySelector('.air-year-range .hi-year-range-val')||{}).textContent,f:JSON.stringify(map.getLayer('airburst-dot')?map.getFilter('airburst-dot'):null)}}"""
async def share_more(b):
    """owner: share links carry base map, time span, cloud opacity and layer year filters (round trip)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1"})
    st = await pg.evaluate(SHARE_SET)
    check("share writes base map, span, opacity and year filter", st.get("bm") == "dark" and st.get("h") == 12 and st.get("op") == 55
          and (st.get("y") or {}).get("airbursts") == "2000,2015", st)
    await pg.evaluate("()=>document.getElementById('btn-share').click()")
    await pg.wait_for_timeout(500)
    h = await pg.evaluate("()=>location.hash")
    await ctx.close()
    ctx = await b.new_context(viewport={"width": 1366, "height": 800}, service_workers="block")
    await ctx.add_init_script("(()=>{const s={'sunny-layers-off-v1':'1','sunny-air-year':'1990,1995','sunny-cloud-opacity':'90'};"
                              "for(const k in s)localStorage.setItem(k,s[k]);})()")
    pg = await ctx.new_page()
    errs2 = []
    pg.on("pageerror", lambda e: errs2.append(str(e)[:300]))
    await pg.goto(URL.split("#")[0] + h, wait_until="load", timeout=120000)
    await pg.wait_for_function("()=>window.map&&map.getStyle&&window.SunnyShare", timeout=90000)
    r = await pg.evaluate(SHARE_GOT)
    check("link restores Dark, 12 h and 55% clouds", r["bm"] == "dark" and r["h"] == "12" and r["op"] == "55", r)
    check("link restores the airburst years on the map and the slider", r["yr"] == "2000–2015" and "2000" in r["f"] and "2015" in r["f"], r)
    check("share round trip no page errors", not errs and not errs2, errs + errs2)
    await ctx.close()
async def maxdetail_boot(b):
    """t382u: the Max detail notice and its Settings switch only existed after the Layers panel loaded its scripts."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1"})
    r = await pg.evaluate("""async()=>{const s=t=>new Promise(r=>setTimeout(r,t));await s(3000);const sw=!!document.getElementById('toggle-maxdetail');
      map.jumpTo({center:[-79.38,43.65],zoom:19.8});await s(3000);const p=document.getElementById('max-detail');
      return {sw:sw,pill:p?p.style.display:'none',lazy:SunnyLayerLazy.ready()}}""")
    check("Max detail notice works without opening Layers", r["sw"] and r["pill"] == "block" and not r["lazy"], r)
    await ctx.close()
OBS_KIDS = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));document.getElementById('lp-tab').click();await SunnyLayerLazy.load();
  const d=SunnyLayers.defs().find(d=>d.id==='observatories');SunnyLayers.set('observatories',true);map.jumpTo({center:[-40,30],zoom:2});await s(5000);
  const tot=()=>map.queryRenderedFeatures({layers:['obs-cluster','obs-point']}).reduce((a,f)=>a+(f.properties.point_count||1),0);const all=tot();
  d.kids.forEach(k=>SunnyLayers.kidSet(k.id,k.id==='observatories-darksky'));await s(3000);const dark=tot();
  d.kids.forEach(k=>SunnyLayers.kidSet(k.id,true));await s(3000);return {all:all,dark:dark,back:tot()}}"""
async def obs_kids(b):
    """t382u: with only Dark Sky Reserves switched on, the group bubbles still counted 2,719 hidden telescopes and detectors."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1"})
    r = await pg.evaluate(OBS_KIDS)
    check("Observatories bubbles count only the classes switched on", 0 < r["dark"] <= 40 and r["all"] > 1000 and r["back"] == r["all"], r)
    await ctx.close()
FOREST_VIEWS = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));document.getElementById('lp-tab').click();await SunnyLayerLazy.load();
  const d=SunnyLayers.defs().find(d=>d.id==='forest');d.kids.forEach(k=>SunnyLayers.kidSet(k.id,true));SunnyLayers.set('forest',true);
  for(const v of [[-79.5,44,7],[-75,52,7]]){map.jumpTo({center:[v[0],v[1]],zoom:v[2]});await s(6000)}}"""
async def forest_404(b):
    """t385u: forest Intact-forest tiles were asked for where none exist (8+ 404s around Toronto); the manifest now lists what exists."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1"})
    seen = []
    pg.on("response", lambda r: seen.append(r.status) if "/forest-pack/" in r.url and r.url.endswith(".webp") else None)
    await pg.evaluate(FOREST_VIEWS)
    check("forest asks only for tiles that exist and still draws them", seen.count(200) > 0 and not [x for x in seen if x >= 400],
          {"ok": seen.count(200), "bad": [x for x in seen if x >= 400][:5]})
    await ctx.close()
UNDERSEA = """async(mode)=>{const s=t=>new Promise(r=>setTimeout(r,t));document.getElementById('lp-tab').click();await SunnyLayerLazy.load();
  SunnyKit.overpass=()=>mode==='slow'?new Promise(()=>{}):Promise.reject(new Error('overpass 504'));
  map.jumpTo({center:[-90.9,28.2],zoom:10});SunnyLayers.set('osm-undersea',true);await s(9000);
  const note=(document.querySelector('.lp-row[data-id="osm-undersea"] .lp-note')||{}).textContent||'';
  return {note:note,pipes:map.queryRenderedFeatures({layers:['osm-pipe']}).length}}"""
async def undersea_state(b):
    """t385u: zoomed in, Undersea pipelines went blank and silent while Overpass took about 30 s, and said nothing when it failed."""
    for mode, want in (("slow", "Loading OpenStreetMap detail"), ("fail", "did not answer")):
        ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1"})
        r = await pg.evaluate(UNDERSEA, mode)
        check("Undersea row says %s and keeps the overview pipelines" % mode, want in r["note"] and r["pipes"] > 0, r)
        await ctx.close()
async def update_flow(b):
    """t386u: a phone kept an old build; the banner took its "running" build from the server, so a page served from an
    older cache never offered the update. The page now names its own build, and coming back after 10 minutes updates."""
    ctx = await b.new_context(viewport={"width": 390, "height": 800}, service_workers="block")
    await ctx.add_init_script("localStorage.setItem('sunny-layers-off-v1','1')")
    pg = await ctx.new_page()
    await pg.route("**/version.json*", lambda r: r.fulfill(status=200, content_type="application/json", body='{"build":"opt999","hash":"x","at":"x"}'))
    loads = []
    pg.on("load", lambda: loads.append(1))
    await pg.goto(URL, wait_until="load", timeout=120000)
    await pg.wait_for_function("()=>window.SunnyUpdate", timeout=60000)
    await pg.evaluate("()=>{const n=document.querySelector('.geo-ask-deny');if(n)n.click();SunnyUpdate.check()}")
    await pg.wait_for_timeout(2500)
    r = await pg.evaluate("""()=>{const b=document.querySelector('.update-banner');return {mine:SunnyUpdate.running(),banner:!!(b&&!b.hidden),
      line:(document.getElementById('set-build')||{}).textContent||'',geo:(document.getElementById('geo-ask')||{hidden:'none'}).hidden,el:!!b}}""")
    check("a page behind the server offers UPDATE and says which build it runs", r["banner"] and r["mine"] != "opt999" and "update opt999 ready" in r["line"], r)
    await pg.evaluate("""()=>{const real=Date.now;let vis='hidden';Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>vis});
      document.dispatchEvent(new Event('visibilitychange'));Date.now=()=>real()+11*60000;vis='visible';document.dispatchEvent(new Event('visibilitychange'));}""")
    await pg.wait_for_timeout(6000)
    check("coming back after 10 minutes on an older build updates by itself", len(loads) >= 2, {"loads": len(loads)})
    await ctx.close()
BEACH_SIZE = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));const n=document.querySelector('.geo-ask-deny');if(n)n.click();
  map.jumpTo({center:[-80.3,26.4],zoom:8.6});await s(1500);document.getElementById('btn-all').click();
  for(let i=0;i<40&&!map.getLayer('beaches-sun');i++)await s(500);await s(1500);
  const sz=()=>JSON.stringify(map.getLayoutProperty('beaches-sun','icon-size'));const s0=sz();
  document.getElementById('lp-tab').click();await s(800);SunnyLayers.refresh();await s(800);
  const f=document.querySelector('.lp-fold[data-layer="beaches"] .lp-bscale input');const r={s0:s0,inBlade:!!f,seen:!!(f&&f.offsetHeight),val:f&&f.value};
  if(f){f.value='2';f.dispatchEvent(new Event('input'));await s(500);}r.s2=sz();r.saved=localStorage.getItem('sunny-beach-icon-size');r.share=SunnyShare.build().bi;return r}"""
async def beach_size(b):
    """t386u: beach icons overlapped when crowded; 1× now draws at 75 %, a size picked before stays on screen,
    and the Beach icon size slider stays in the Beaches controls after the panel rebuilds its rows (390 px)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1"}, w=390)
    r = await pg.evaluate(BEACH_SIZE)
    first = lambda js: json.loads(js)[4]
    check("beach icons start at 75 % of the earlier size", abs(first(r["s0"]) - 0.38 * 0.75) < 0.002, r)
    check("Beach icon size slider sits in the Beaches controls after a rebuild", r["inBlade"] and r["seen"] and r["val"] == "1", r)
    check("slider sizes the icons, is saved and shared", abs(first(r["s2"]) - 0.38 * 0.75 * 2) < 0.004 and r["saved"] == "2" and r["share"] == 2, r)
    await ctx.close()
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-beach-icon-scale": "1.5"}, w=390)
    v = await pg.evaluate("()=>SunnyBeachIcons.getScale()")
    check("a size saved before keeps its on-screen size (1.5 → 2 on the new scale)", v == 2, v)
    await ctx.close()
SUN_CARD = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));await SunnyLayerLazy.load();map.jumpTo({center:[-79.38,43.65],zoom:6});await s(800);
  const sec=()=>[...document.querySelectorAll('.ip-sec')].map(x=>x.innerText).join(' | ');const vis=(id)=>!!map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none';
  SunnyLayers.set('goldenhour',true);for(let i=0;i<30&&!/Sunset score \\d/.test(sec());i++)await s(500);
  const a={sec:sec(),path:vis('sun-path-line'),kinds:[...new Set(map.querySourceFeatures('sun-path').map(f=>f.properties.k))].sort().join()};
  SunnyLayers.kidSet('goldenhour-path',false);await s(400);a.pathOff=vis('sun-path-line');a.secOff=sec();SunnyLayers.kidSet('goldenhour-path',true);
  SunnyLayers.set('goldenhour',false);await s(400);a.gone=!/Sun here/.test(sec())&&!vis('sun-path-line')&&!vis('gold-fill');return a}"""
async def sun_card(b):
    """t388u: one Sun row holds the golden hour bands, the sun path and shadow, the sunset score and the UV burn timer;
    each kid switches its own part, and switching the row off clears the map and the info panel (390 px)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
    r = await pg.evaluate(SUN_CARD)
    check("Sun block lists golden hour, sunset score and UV burn timer", all(w in r["sec"] for w in ["Golden hour", "Sunset score", "UV"]), r)
    check("sun path draws the path and the rise and set directions", r["path"] and "path" in r["kinds"] and "rise" in r["kinds"], r)
    check("Sun path kid off hides the drawing and its line", not r["pathOff"] and "shadows point" not in r["secOff"] and "below the horizon" not in r["secOff"], r)
    check("Sun row off clears the map and the panel", r["gone"] and not errs, [r, errs])
    await ctx.close()
TONIGHT = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));await SunnyLayerLazy.load();map.jumpTo({center:[-79.38,43.65],zoom:7});await s(800);
  const sec=()=>[...document.querySelectorAll('.ip-sec')].map(x=>x.innerText).join(' | ');document.getElementById('lp-tab').click();await s(400);
  const tg=[...document.querySelectorAll('#layers-panel .lp-head')].find(h=>/Tonight/.test(h.textContent));
  const a={folder:tg?[...tg.nextElementSibling.querySelectorAll('.lp-row')].map(r=>r.dataset.id).sort().join():''};
  SunnyLayers.set('moon',true);await s(1200);a.moon=sec();a.moonRad=document.querySelectorAll('.sky-met').length;SunnyLayers.set('moon',false);
  SunnyLayers.set('showers',true);await s(1200);a.met=sec();a.metRad=document.querySelectorAll('.sky-met').length;SunnyLayers.set('showers',false);
  SunnyLayers.set('nightscore',true);for(let i=0;i<60&&!/Darkest sky within 100 km: (\\d|only water)/.test(sec());i++)await s(500);
  a.dark=sec();a.ring=!!map.getLayer('dark-spot')&&map.getLayoutProperty('dark-spot','visibility')!=='none';
  SunnyLayers.set('nightscore',false);await s(400);a.off=sec();a.ringOff=map.getLayoutProperty('dark-spot','visibility');return a}"""
async def tonight_sky(b):
    """t388u: Moon, Meteor showers, Night-sky score and Dark sky share one Tonight's sky folder; the next shower shows only
    under Meteor showers (no longer under Moon too), and Night-sky score adds the darkest land within 100 km (390 px)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
    r = await pg.evaluate(TONIGHT)
    check("Tonight's sky folder holds moon, showers, night-sky score and dark sky", r["folder"] == "moon,nightscore,showers,skyglow", r)
    check("Moon alone shows the moon and no meteor shower", "🌙" in r["moon"] and "☄" not in r["moon"] and r["moonRad"] == 0, r)
    check("Meteor showers shows the next peak and its radiant line", "☄" in r["met"] and "🌙" not in r["met"] and r["metRad"] == 1, r)
    check("Night-sky score names the darkest sky within 100 km and rings it", "Darkest sky within 100 km" in r["dark"] and r["ring"], r)
    check("Night-sky score off clears the block and the ring", r["off"] == "" and r["ringOff"] == "none" and not errs, [r, errs])
    await ctx.close()
SMOKE = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));await SunnyLayerLazy.load();map.jumpTo({center:[-100,50],zoom:3});await s(800);
  const vis=(id)=>!!map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none';
  SunnyLayers.set('fires',true);for(let i=0;i<40&&!(vis('smoke-aod')&&map.getLayer('fire-dot'));i++)await s(500);
  const a={smoke:vis('smoke-aod'),dot:vis('fire-dot')};SunnyLayers.kidSet('fires-hot',false);await s(400);a.dotOff=!vis('fire-dot')&&vis('smoke-aod');
  SunnyLayers.kidSet('fires-smoke',false);await s(400);a.smokeOff=!vis('smoke-aod');a.rowOff=SunnySmoke.on();
  SunnyLayers.kidSet('fires-hot',true);SunnyLayers.kidSet('fires-smoke',true);await s(400);a.row=await SunnySmoke.row(43.65,-79.38);
  SunnyLayers.set('fires',false);await s(400);a.allOff=!vis('smoke-aod')&&!vis('fire-dot');return a}"""
async def smoke_aq(b):
    """t388u: Wildfires & smoke holds two kids, Fires & hotspots and Smoke & air quality (NASA aerosol map plus PM2.5 and the
    air quality index in the Weather card); each kid switches only its own part (390 px)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
    r = await pg.evaluate(SMOKE)
    check("Wildfires & smoke draws the hotspots and the smoke map", r["smoke"] and r["dot"], r)
    check("each kid hides only its own part", r["dotOff"] and r["smokeOff"] and r["rowOff"] is False, r)
    check("Weather card air row spells out PM2.5 units and the air quality index", "micrograms per cubic metre" in r["row"] and "air quality index" in r["row"], r)
    check("Wildfires & smoke off clears both", r["allOff"] and not errs, [r, errs])
    await ctx.close()
CURRENTS = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));await SunnyLayerLazy.load();map.jumpTo({center:[-65,40],zoom:4});await s(800);
  const vis=(id)=>!!map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none';
  const n=()=>map.getSource('cur-line')?map.getSource('cur-line')._data.features.length:-1;
  SunnyLayers.set('watertemp',true);for(let i=0;i<40&&!(n()>0&&vis('sst'));i++)await s(500);
  const a={sst:vis('sst'),cur:vis('cur-line'),n:n()};map.jumpTo({center:[0,20],zoom:1});await s(500);for(let i=0;i<20&&n()<a.n+1;i++)await s(500);a.nWorld=n();
  SunnyLayers.kidSet('watertemp-sst',false);await s(400);a.sstOff=!vis('sst')&&vis('cur-line');
  SunnyLayers.kidSet('watertemp-cur',false);await s(400);a.curOff=!vis('cur-line')&&!SunnyCurrents.on();
  SunnyLayers.kidSet('watertemp-sst',true);SunnyLayers.kidSet('watertemp-cur',true);await s(300);
  SunnyLayers.set('watertemp',false);await s(400);a.allOff=!vis('cur-line')&&!vis('sst');return a}"""
async def currents(b):
    """t388u: Water temperature & currents holds two kids, Surface temperature and Currents (arrows at every zoom from
    Open-Meteo Marine); each kid switches only its own part (390 px)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
    r = await pg.evaluate(CURRENTS)
    check("Water temperature & currents draws the temperature and current arrows", r["sst"] and r["cur"] and r["n"] > 5, r)
    check("current arrows show on the whole-world view too", r["nWorld"] > 5, r)
    check("each kid hides only its own part", r["sstOff"] and r["curOff"], r)
    check("Water temperature & currents off clears both", r["allOff"] and not errs, [r, errs])
    await ctx.close()
VOLC = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));await SunnyLayerLazy.load();map.jumpTo({center:[15,38],zoom:5});await s(800);
  SunnyLayers.set('volcanoes',true);for(let i=0;i<40&&!map.getLayer('volc-dot');i++)await s(500);await s(1500);
  const d=SunnyLayers.defs().find(d=>d.id==='volcanoes');const rows=SunnyLayers.defs().filter(d=>d.name&&/olcan/.test(d.name)).map(d=>d.id).join();
  return {rec:map.querySourceFeatures('volcanoes').filter(f=>f.properties.rc>0).map(f=>f.properties.name),leg:d.legend(),rows,
    col:JSON.stringify(map.getPaintProperty('volc-dot','circle-color')).slice(0,80)}}"""
async def volc_recent(b):
    """t388u: recent eruptions are a colour of the Volcanoes dots (no new switch): erupting, or an eruption that ended in the
    12 months before the data build, with that date in the legend (390 px)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
    r = await pg.evaluate(VOLC)
    check("recent eruptions marked on the Volcanoes dots (Etna or Stromboli in view)", any(n in r["rec"] for n in ["Etna", "Stromboli"]) and "rc" in r["col"], r)
    check("legend names the recent class and the build date", "erupting, or an eruption ended in the 12 months before 20" in r["leg"], r)
    check("no extra volcano switch", r["rows"] == "volcanoes,volcdue" and not errs, [r, errs])
    await ctx.close()
SHIPS = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));await SunnyLayerLazy.load();map.jumpTo({center:[23,60.5],zoom:5});await s(800);
  const vis=(id)=>!!map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none';
  SunnyLayers.set('ships',true);for(let i=0;i<40&&!vis('ship-dot');i++)await s(500);
  const n=map.getSource('ship-dot')?map.getSource('ship-dot')._data.features.length:-1;map.jumpTo({center:[0,30],zoom:1});await s(800);
  const d=SunnyLayers.defs().find(d=>d.id==='ships');const a={n,world:vis('ship-dot'),tip:d.tip};SunnyLayers.set('ships',false);await s(300);a.off=!vis('ship-dot');return a}"""
async def ships_live(b):
    """t388u: Ships draws the live Digitraffic AIS feed (Finnish waters) at every zoom, and its tip says where it covers (390 px)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
    r = await pg.evaluate(SHIPS)
    check("Ships draws live AIS positions", r["n"] > 50 and r["world"], r)
    check("Ships tip names its coverage and turning it off hides it", "Finnish waters" in r["tip"] and r["off"] and not errs, [r, errs])
    await ctx.close()
WG = """async(a)=>{const s=t=>new Promise(r=>setTimeout(r,t));await SunnyLayerLazy.load();map.jumpTo({center:a.c,zoom:a.z});await s(800);
  const vis=(id)=>!!map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none';SunnyLayers.set(a.id,true);
  for(let i=0;i<40&&!vis(a.l[0]);i++)await s(500);await s(2500);const f=map.queryRenderedFeatures({layers:a.l});
  const d=SunnyLayers.defs().find(d=>d.id===a.id);const r=map.getContainer().getBoundingClientRect();
  const ps=f.map(g=>map.project(g.geometry.coordinates)).filter(q=>document.elementFromPoint(r.left+q.x,r.top+q.y)===map.getCanvas());
  const p=ps.sort((u,v)=>Math.hypot(u.x-r.width/2,u.y-r.height/2)-Math.hypot(v.x-r.width/2,v.y-r.height/2))[0]||{x:0,y:0};
  const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  return {n:f.length,np:ps.length,at:e.tagName+'.'+e.className,x:r.left+p.x,y:r.top+p.y,tip:d.tip,leg:typeof d.legend==='function'?d.legend():d.legend}}"""
async def wrecks_ghost(b):
    """t388u: Shipwrecks (Ocean) and Ghost towns & abandoned places (History) draw Wikidata worldwide plus OpenStreetMap in
    Canada at every zoom, and a tap shows the place with its source link (390 px)."""
    for id, c, z, l, word in [("wrecks", [-63.6, 44.6], 6, ["wreck-hist", "wreck-chart"], "Shipwreck"),
                              ("ghost", [-110, 45], 4, ["ghost-town", "ghost-other"], "Ghost")]:
        ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
        await pg.evaluate("()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click()}")
        r = await pg.evaluate(WG, {"id": id, "c": c, "z": z, "l": l})
        check(id + " draws points and names both sources", r["n"] > 3 and "Wikidata" in r["tip"] and "OpenStreetMap" in r["leg"], r)
        await pg.mouse.click(r["x"], r["y"])
        await pg.wait_for_timeout(3000)
        t = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c?[c.innerText,c.innerHTML]:['','']}")
        check(id + " tap shows the place with a source link", ("wikidata.org/wiki/Q" in t[1] or "openstreetmap.org/" in t[1])
              and len(t[0]) > 10 and not errs, [t[0][:300], errs, {k: r[k] for k in ('np', 'at', 'x', 'y')}])
        await ctx.close()
LBL = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));const idle=()=>new Promise(r=>{const t=setTimeout(r,15000);map.once('idle',()=>{clearTimeout(t);setTimeout(r,800)})});
  const ids=SunnyLabelTiers.ids.filter(i=>map.getLayer(i));const cls=()=>[...new Set(map.queryRenderedFeatures({layers:ids}).map(f=>f.properties.class))].sort().join();
  const names=()=>map.queryRenderedFeatures({layers:ids}).map(f=>f.properties.name_en||f.properties.name);
  const a={n:ids.length};map.jumpTo({center:[-96,56],zoom:1});await idle();a.z1=cls();map.jumpTo({center:[-96,50],zoom:3});await idle();a.z3=cls();
  map.jumpTo({center:[-79.4,43.7],zoom:4.5});await idle();a.z45=cls();map.jumpTo({center:[-79.4,43.7],zoom:6.5});await idle();
  a.z65=[...new Set(map.queryRenderedFeatures({layers:ids}).map(f=>f.layer.id.replace('ov-place-','')))].sort().join();
  map.jumpTo({center:[-79.4,43.7],zoom:9});await idle();a.z9=cls();
  a.caps=map.getLayoutProperty('ov-place-country-xl','text-transform');a.cont=SunnyLabelTiers.TIERS[0].rank;
  map.jumpTo({center:[-17,63.5],zoom:3});await idle();a.ice3=names().includes('Iceland');map.jumpTo({center:[-17,63.5],zoom:4.5});await idle();a.ice45=names().includes('Iceland');
  const white=/^(#fff|#ffffff|white|rgb\\(255, ?255, ?255\\)|rgba\\(255, ?255, ?255, ?1\\))$/i;
  a.white=map.getStyle().layers.filter(l=>l.type==='symbol'&&/^(ov-|vb-)/.test(l.id)&&l.layout&&l.layout.visibility!=='none').filter(l=>white.test(String((l.paint||{})['text-color']||''))).map(l=>l.id);
  a.vbPlace=map.getStyle().layers.filter(l=>/^vb-/.test(l.id)&&l['source-layer']==='place').length;
  a.road=map.getLayer('ov-road')?map.getPaintProperty('ov-road','line-opacity'):null;
  const L=SunnyLabelTiers,R=L.RANKS,th=L.mode(),lum=c=>{const v=[1,3,5].map(i=>parseInt(c.substr(i,2),16));return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]};
  a.mono=[];for(const z of [3,5,7,9,12]){const vis=L.TIERS.filter(t=>t.rank!=='continent'&&z>=t.min&&z<(t.max||24)&&map.getLayer('ov-place-'+t.id))
    .map(t=>({r:R.indexOf(t.rank),id:t.id,s:L.sizeAt(L.sizeKey(t),t.from||t.min,z),c:map.getPaintProperty('ov-place-'+t.id,'text-color')}));
    if(z>=L.STREET_MIN)vis.push({r:R.indexOf('street'),id:'street',s:L.sizeAt('street',L.STREET_MIN,z),c:L.colourOf('street',th)});
    vis.sort((p,q)=>p.r-q.r);for(let i=1;i<vis.length;i++){const p=vis[i-1],q=vis[i];if(q.r===p.r)continue;
      const brighter=th==='roads'?lum(q.c)<lum(p.c):lum(q.c)>lum(p.c);if(q.s>p.s||brighter)a.mono.push(z+':'+q.id+'>'+p.id+' '+q.s+'/'+p.s+' '+q.c+'/'+p.c)}}
  a.tableColour=L.TIERS.filter(t=>map.getLayer('ov-place-'+t.id)).every(t=>map.getPaintProperty('ov-place-'+t.id,'text-color')===L.colourOf(t.rank,th));
  const st=()=>map.queryRenderedFeatures({layers:['ov-place-state']}).map(f=>f.properties.name_en);
  map.jumpTo({center:[-85,50],zoom:5});await idle();a.on5=st();map.jumpTo({center:[-95,40],zoom:5});await idle();a.us5=st();
  map.jumpTo({center:[-89,43],zoom:6.5});await idle();a.z65s=cls();
  a.fixed=!map.getStyle().layers.some(l=>/view/.test(l.id))&&!map.getSource('country-view')&&!window.SunnyCountryView;
  const on=(l)=>map.queryRenderedFeatures({layers:[l]}).map(f=>f.properties.name_en);
  map.jumpTo({center:[-79.4,43.7],zoom:4.5});await idle();a.code45=on('ov-place-state-code').length;a.full45=on('ov-place-state').length;
  a.codeOf=[L.codeOf('Ontario'),L.codeOf('New York'),L.codeOf('Quebec'),L.codeOf('Bavaria')].join();
  a.codeExpr=JSON.stringify(map.getLayoutProperty('ov-place-state-code','text-field')).includes('"Ontario","ON"');
  map.jumpTo({center:[-79.4,43.7],zoom:5.5});await idle();a.code55=on('ov-place-state-code').length;a.full55=on('ov-place-state').length;
  map.jumpTo({center:[-79.4,44],zoom:6});await idle();a.spotTo=on('ov-place-state-2');a.mainTo=on('ov-place-state');
  map.jumpTo({center:[-85,50],zoom:5.5});await idle();a.spotOn=on('ov-place-state-2');a.mainOn=on('ov-place-state');
  SunnyKit.mapBrightness.set(0.5);await s(300);a.dim=map.getPaintProperty(ids[0],'text-opacity');SunnyKit.mapBrightness.set(1);
  document.getElementById('toggle-map').click();await s(800);a.off=ids.every(i=>map.getLayoutProperty(i,'visibility')==='none');return a}"""
async def label_tiers(b):
    """t389u: base-map place names follow one tier table on Roads and Dark: continents far out, countries by size (Iceland
    later than Canada), regions and national capitals, then cities and towns; no pure white text; Map brightness dims them;
    the Labels switch hides them all (390 px). t394u: province and state names show at z5, every name stays one fixed
    label, and country names end where province and state names take over. t396u: two-letter codes first, then full
    names; the largest regions get a second fixed label spot shown only while their main label point is off screen."""
    for th in ["dark", "roads"]:
        ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done", "sunny-basemap": th, "sunny-labels": "1"}, w=390)
        r = await pg.evaluate(LBL)
        check(th + " far out shows continents only, then countries", r["n"] == 17 and r["z1"] == "continent" and r["z3"] == "country", r)
        check(th + " regions and capitals next, cities and towns closer, no villages at 9",
              "village" not in r["z45"] and "town" not in r["z45"] and "state" in r["z45"] and "town" in r["z9"] and "village" not in r["z9"], r)
        check(th + " Iceland waits until a closer zoom", (not r["ice3"]) and r["ice45"], r)
        check(th + " cities show by zoom 6.5 (t391u: city tiers start 1 to 1.5 zooms sooner)",
              any(k in r["z65"].split(",") for k in ["city", "city-major"]) and "capital-region" in r["z65"], r)
        check(th + " country names in capitals, continents styled apart", r["caps"] == "uppercase" and r["cont"] == "continent", r)
        check(th + " no pure white text, no second set of place names", not r["white"] and r["vbPlace"] == 0, r)
        check(th + " roads drawn at the shared road dim", r["road"] is not None and r["road"] < 1, r)
        check(th + " brightness and size never rise down the importance order (z3,5,7,9,12), colours from the table",
              not r["mono"] and r["tableColour"], r)
        check(th + " province and state names show at z5 (Ontario; Kansas), one fixed label each, no view-following names",
              "Ontario" in r["on5"] and "Kansas" in r["us5"] and r["fixed"], r)
        check(th + " two-letter ISO 3166-2 codes at z4.5 (ON, NY, QC; other regions keep names), full names from z5",
              r["code45"] > 3 and r["full45"] == 0 and r["codeOf"] == "ON,NY,QC," and r["codeExpr"] and r["code55"] == 0 and r["full55"] > 0, r)
        check(th + " Ontario's second spot names it near Toronto (z6) while its main point is off screen, never both",
              "Ontario" in r["spotTo"] and "Ontario" not in r["mainTo"] and "Ontario" in r["mainOn"] and "Ontario" not in r["spotOn"], r)
        check(th + " country names end where province and state names take over (z6.5: states, no countries)",
              "state" in r["z65s"].split(",") and "country" not in r["z65s"].split(","), r)
        check(th + " brightness dims labels and Labels off hides them", r["dim"] < 1 and r["off"] and not errs, [r, errs])
        await ctx.close()
RAIL = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));await SunnyLayerLazy.load();const d=SunnyLayers.defs().find(d=>d.id==='rail-abandoned');
  map.jumpTo({center:[-79.42,43.69],zoom:7});SunnyLayers.set('rail-abandoned',true);await s(1500);const far=typeof d.note==='function'?d.note():'';
  map.jumpTo({center:[-79.418,43.695],zoom:13});const ids=['rail-ab-line','rail-ab-dash'];let n=0,t0=Date.now();
  for(let i=0;i<200&&!n;i++){await s(1000);n=ids.some(i=>map.getLayer(i))?map.queryRenderedFeatures({layers:ids.filter(i=>map.getLayer(i))}).length:0}
  const f=n?map.queryRenderedFeatures({layers:['rail-ab-hit']}):[];const r=map.getContainer().getBoundingClientRect();
  const g=f[0]&&f[0].geometry;const c=g?(g.type==='LineString'?g.coordinates[Math.floor(g.coordinates.length/2)]:g.coordinates[0][0]):null;
  const p=c?map.project(c):{x:0,y:0};const kinds=[...new Set(map.queryRenderedFeatures({layers:ids.filter(i=>map.getLayer(i))}).map(x=>x.properties.k))].sort().join();
  return {group:d.group,far,n,kinds,ms:Date.now()-t0,leg:typeof d.legend==='function'?d.legend():d.legend,x:r.left+p.x,y:r.top+p.y,dflt:!!d.dflt}}"""
async def rail_abandoned(b):
    """t396u: Abandoned railways (History) loads live OpenStreetMap lines at zoom 9 and in, says so when zoomed out, draws the
    Toronto Belt Line and other old lines, and a tap names the line with its OpenStreetMap link (390 px)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
    await pg.evaluate("()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click()}")
    r = await pg.evaluate(RAIL)
    check("abandoned railways sit in History, off by default, with a legend and a zoom-in note when far out",
          r["group"] == "History" and not r["dflt"] and "rail trail" in r["leg"] and "Zoom in" in r["far"], r)
    check("abandoned railways draw around Toronto from live OpenStreetMap", r["n"] > 0, r)
    await pg.mouse.click(r["x"], r["y"])
    await pg.wait_for_timeout(2500)
    t = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');const q=document.querySelector('.maplibregl-popup');" +
                          "return [(c?c.innerHTML:'')+(q?q.innerHTML:''),(c?c.innerText:'')+(q?q.innerText:'')]}")
    check("abandoned railway tap names the line with its OpenStreetMap link", "openstreetmap.org/way/" in t[0] and not errs, [t[1][:300], errs])
    await ctx.close()
WAR_IN = """()=>{const h=[...document.querySelectorAll('.lp-head')].find(e=>/Wars$/.test(e.textContent));const box=h&&h.nextElementSibling;
  const ids=[...(box?box.querySelectorAll('.lp-row'):[])].map(r=>r.dataset.id);const on=ids.filter(i=>SunnyLayers.isOn(i));
  const par=h&&h.parentElement&&h.parentElement.previousElementSibling;return {ids,on,parent:par?par.textContent:''}}"""
async def wars(b):
    """t399u-t401u: History has a Wars section with one row per war (WW1, WW2, Korea, Vietnam) and grouped rows for the rest, all
    off at start; WW2 draws Normandy and the War of 1812 draws Niagara, and a tap shows the place with its Wikidata link (390 px)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
    await pg.evaluate("()=>SunnyLayerLazy.load()")
    await pg.wait_for_timeout(800)
    r = await pg.evaluate(WAR_IN)
    want = ["war-ww1", "war-ww2", "war-korea", "war-vietnam", "war-indep", "war-civil", "war-colonial", "war-modern", "war-early"]
    check("Wars section under History holds every war row, all off at start", r["ids"] == want and not r["on"] and "History" in r["parent"], r)
    await ctx.close()
    kinds = ["battle", "landing", "fort", "memorial", "cemetery", "site"]
    for id, c, z, word in [("war-ww2", [-0.6, 49.33], 8, "World War"), ("war-modern", [-79.05, 43.1], 8, "1812")]:
        ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
        await pg.evaluate("()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click()}")
        r = await pg.evaluate(WG, {"id": id, "c": c, "z": z, "l": [id + "-" + k for k in kinds]})
        check(id + " draws its places with a legend by kind", r["n"] > 3 and "Battle or siege" in r["leg"] and "Wikidata" in r["tip"], {k: r[k] for k in ("n", "np", "tip")})
        await pg.mouse.click(r["x"], r["y"])
        await pg.wait_for_timeout(3000)
        t = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c?[c.innerText,c.innerHTML]:['','']}")
        check(id + " tap shows the place with its Wikidata link", "wikidata.org/wiki/Q" in t[1] and len(t[0]) > 10 and not errs, [t[0][:300], errs])
        print("  ", id, r["n"], t[0][:160].replace("\n", " | "), flush=True)
        await ctx.close()
async def wifi(b):
    """t404u: Wi-Fi spots, Canada sits in Transmission, off at start, with a legend by fee; Halifax shows OpenStreetMap spots with an
    OpenStreetMap link and Montréal shows MTLWiFi spots credited to the city (390 px)."""
    ids = ["wifi-f", "wifi-c", "wifi-p", "wifi-u", "wifi-m"]
    for c, z, l, want in [([-63.575, 44.645], 14, ids, "openstreetmap.org/"), ([-73.6551, 45.4227], 15, ["wifi-m"], "donnees.montreal.ca")]:
        ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
        await pg.evaluate("()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click()}")
        off = await pg.evaluate("async()=>{await SunnyLayerLazy.load();const d=SunnyLayers.defs().find(d=>d.id==='wifi');return [d.group,SunnyLayers.isOn('wifi')]}")
        r = await pg.evaluate(WG, {"id": "wifi", "c": c, "z": z, "l": l})
        check("wifi in Transmission, off at start, legend by fee, draws " + l[-1], off == ["Transmission", False] and r["n"] > 0 and "Fee not stated" in r["leg"], [off, r["n"], r["tip"]])
        await pg.mouse.click(r["x"], r["y"])
        await pg.wait_for_timeout(3000)
        t = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c?[c.innerText,c.innerHTML]:['','']}")
        check("wifi tap shows the spot, its fee and source link (" + want + ")", want in t[1] and "Wi-Fi:" in t[0] and not errs, [t[0][:300], errs])
        print("  ", r["n"], t[0][:200].replace("\n", " | "), flush=True)
        await ctx.close()
async def ancient(b):
    """t397u-t398u: Ancient cities, ruins & digs, Viking sites and Expeditions & first landings sit in History, off at start, and
    draw Rome, Birka and Ross Island; a tap shows the place with its source link (390 px)."""
    for id, c, z, l in [("ancient", [12.49, 41.89], 11, ["anc-city", "anc-settle", "anc-ruin", "anc-arch"]),
                        ("vikings", [17.54, 59.335], 9, ["vik-vsite", "vik-vstone"]), ("expeditions", [166.7, -77.85], 8, ["exp-hsm", "exp-land"])]:
        ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
        await pg.evaluate("()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click()}")
        off = await pg.evaluate("async(id)=>{await SunnyLayerLazy.load();const d=SunnyLayers.defs().find(d=>d.id===id);return [d.group,SunnyLayers.isOn(id)]}", id)
        r = await pg.evaluate(WG, {"id": id, "c": c, "z": z, "l": l})
        check(id + " in History, off at start, draws its places", off == ["History", False] and r["n"] > 0, [off, r["n"]])
        await pg.mouse.click(r["x"], r["y"])
        await pg.wait_for_timeout(3000)
        t = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c?[c.innerText,c.innerHTML]:['','']}")
        check(id + " tap shows the place with its source link", ("wikidata.org/wiki/Q" in t[1] or "openstreetmap.org/" in t[1] or "doi.org/" in t[1])
              and len(t[0]) > 10 and not errs, [t[0][:300], errs])
        print("  ", id, r["n"], t[0][:200].replace("\n", " | "), flush=True)
        await ctx.close()
async def smells(b):
    """t406u: Stinky map sits in Human impact, off at start, draws emoji badges by type with a legend that says strength is estimated by
    type, draws a downwind plume over the Vancouver Landfill from the current wind, and a tap shows the source (390 px)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
    await pg.evaluate("()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click()}")
    off = await pg.evaluate("async()=>{await SunnyLayerLazy.load();const d=SunnyLayers.defs().find(d=>d.id==='smells');return [d.group,SunnyLayers.isOn('smells')]}")
    ids = ["smell-" + k for k in ["landfill", "sewage", "manure", "pulp", "meat", "refinery", "compost", "sulphur"]]
    r = await pg.evaluate(WG, {"id": "smells", "c": [-123.005, 49.098], "z": 11, "l": ids})
    pl = 0
    for i in range(30):
        pl = await pg.evaluate("()=>map.getLayer('smell-plume-fill')?map.queryRenderedFeatures({layers:['smell-plume-fill']}).length:0")
        if pl: break
        await pg.wait_for_timeout(1000)
    check("smells in Human impact, off at start, emoji legend says estimated by type", off == ["Human impact", False] and r["n"] > 0
          and "ls-emo" in r["leg"] and "estimated" in r["leg"], [off, r["n"], r["leg"][-300:]])
    check("smells draw a downwind plume from the current wind", pl > 0, pl)
    await pg.mouse.click(r["x"], r["y"])
    await pg.wait_for_timeout(3000)
    t = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c?[c.innerText,c.innerHTML]:['','']}")
    check("smells tap shows the source, its strength and source link", "openstreetmap.org/" in t[1] and "strength" in t[0] and not errs, [t[0][:300], errs])
    print("  ", r["n"], pl, t[0][:200].replace("\n", " | "), flush=True)
    await ctx.close()
async def reefs(b):
    """t397u: Coral bleaching watch and Reefs & underwater sit in Ocean, Launch sites & rocket factories in Sky & Space, Artificial,
    Ports, marinas & shipyards in Travel and Zoos, theme parks & climbing in Fun & Games, all off at start; each draws its places, and a tap shows the NOAA alert or the place with its source link (390 px)."""
    for lid, ids, c, z, want in [("bleaching", ["crw-%d" % i for i in range(5)], [146.5, -18.5], 5, "coralreefwatch.noaa.gov"),
                                 ("reefs", ["reef-" + k for k in ["coral", "atoll", "reef", "hole"]], [73.2, 3.5], 6, "wikidata.org/wiki/Q"),
                                 ("space", ["space-" + k for k in ["port", "pad", "centre", "factory"]], [-80.6, 28.5], 9, "wikidata.org/wiki/Q"),
                                 ("maritime", ["sea-" + k for k in ["port", "marina", "ramp", "yard", "dry"]], [-63.57, 44.64], 12, "openstreetmap.org/"),
                                 ("fun", ["fun-" + k for k in ["zoo", "park", "arcade", "paint", "cgym", "bgym", "crag", "rock"]], [-79.39, 43.65], 11,
                                  "openstreetmap.org/")]:
        ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
        await pg.evaluate("()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click()}")
        off = await pg.evaluate("async(id)=>{await SunnyLayerLazy.load();const d=SunnyLayers.defs().find(d=>d.id===id);return [d.group,SunnyLayers.isOn(id)]}", lid)
        r = await pg.evaluate(WG, {"id": lid, "c": c, "z": z, "l": ids})
        grp = {"space": "Sky & Space/Artificial", "maritime": "Travel", "fun": "Fun & Games"}.get(lid, "Ocean")
        check(lid + " in " + grp + ", off at start, draws its places", off == [grp, False] and r["n"] > 0, [off, r["n"]])
        await pg.mouse.click(r["x"], r["y"])
        await pg.wait_for_timeout(3000)
        t = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c?[c.innerText,c.innerHTML]:['','']}")
        check(lid + " tap shows the place with its source link", want in t[1] and not errs, [t[0][:300], errs])
        print("  ", lid, r["n"], t[0][:220].replace("\n", " | "), flush=True)
        await ctx.close()
FLIGHT = """async(a)=>{const s=t=>new Promise(r=>setTimeout(r,t));await SunnyLayerLazy.load();SunnyLayers.set('flighttime',true);await s(1500);
  const st=()=>{const o=SunnyFlightOrigin();const l=map.getLayer('flight-band');return {o:o?[+o.lat.toFixed(1),+(o.lon!=null?o.lon:o.lng).toFixed(1)]:null,
    vis:!!l&&map.getLayoutProperty('flight-band','visibility')!=='none',url:(map.getSource('flight-band')||{}).url||''}};return st()}"""
FLIGHT_ST = """()=>{const o=SunnyFlightOrigin();const l=map.getLayer('flight-band');return {o:o?[+o.lat.toFixed(1),+(o.lon!=null?o.lon:o.lng).toFixed(1)]:null,
  vis:!!l&&map.getLayoutProperty('flight-band','visibility')!=='none',url:((map.getSource('flight-band')||{}).url||'').length}}"""
async def flight_pin(b):
    """t410u: Flight time from pin measures from the red pin of the last map tap: the bands draw around a tapped place and
    move when you tap somewhere else, with no page errors (390 px)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
    await pg.evaluate("()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click();map.jumpTo({center:[-40,45],zoom:3})}")
    await pg.evaluate(FLIGHT, {})
    pts = []
    for x, y in [(120, 380), (300, 520)]:
        await pg.mouse.click(x, y)
        await pg.wait_for_timeout(2500)
        ll = await pg.evaluate("(p)=>{const q=map.unproject(p);return [+q.lat.toFixed(1),+q.lng.toFixed(1)]}", [x, y])
        pts.append([ll, await pg.evaluate(FLIGHT_ST)])
    near = lambda a, o: o and abs(a[0] - o[0]) < 1.5 and abs(a[1] - o[1]) < 1.5
    check("flight time draws around the tapped pin", pts[0][1]["vis"] and near(pts[0][0], pts[0][1]["o"]), pts)
    check("flight time follows the pin to the next tap", pts[1][1]["vis"] and near(pts[1][0], pts[1][1]["o"]) and not errs, [pts, errs])
    await ctx.close()
BEACH_FLOW = """async()=>{const s=t=>new Promise(r=>setTimeout(r,t));map.jumpTo({center:[-79.45,43.63],zoom:10});await s(1500);
  const c=map.getContainer().getBoundingClientRect();map.fire('click',{point:{x:c.width/2,y:c.height/2},lngLat:map.getCenter()});await s(800);
  document.getElementById('lp-tab').click();await s(1000);const st=()=>document.getElementById('status').textContent;
  const sun=document.getElementById('toggle-sunny');if(!sun.checked){sun.checked=true;sun.dispatchEvent(new Event('change'))}
  document.getElementById('btn-sun').click();for(let i=0;i<40&&!/sunny beach|No beaches/.test(st());i++)await s(500);const a=st();
  sun.checked=false;sun.dispatchEvent(new Event('change'));for(let i=0;i<40&&!/beach(es)? found|Nearest:/.test(st());i++)await s(500);const b=st();
  const shown=SunnyBeachToggle.isShown();document.getElementById('btn-all').click();
  let n=0;for(let i=0;i<40&&!n;i++){await s(500);n=map.getLayer('beaches-sun')?map.queryRenderedFeatures({layers:['beaches-sun']}).length:0}
  return {a,b,shown,n,all:st()}}"""
async def beach_flow(b):
    """t411u: Find beaches with Sunny only says what it found or what to do next; turning Sunny only off runs Find again at once
    and lists the nearest beaches; All beaches draws the beach weather icons (390 px)."""
    from smoke_areawx import stand_in
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
    await pg.route("**/api.open-meteo.com/**", stand_in)
    await pg.evaluate("()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click()}")
    r = await pg.evaluate(BEACH_FLOW)
    check("Find beaches with Sunny only reports sunny beaches or how to see the nearest", "sunny beach" in r["a"] or "Turn off Sunny only" in r["a"], r)
    check("turning Sunny only off runs Find again and lists the nearest beaches", ("found" in r["b"] or "Nearest:" in r["b"]) and r["shown"], r)
    check("All beaches draws beach weather icons, no page errors", r["n"] > 0 and not errs, [r, errs])
    await ctx.close()
CRED = """()=>{const R=e=>{if(!e)return null;const r=e.getBoundingClientRect();return r.width&&r.height?[r.left,r.top,r.right,r.bottom]:null};
  const hit=(a,b)=>!!(a&&b&&a[0]<b[2]&&b[0]<a[2]&&a[1]<b[3]&&b[1]<a[3]);const at=document.querySelector('.maplibregl-ctrl-attrib');
  const btn=R(at.querySelector('.maplibregl-ctrl-attrib-button'));const lag=R(document.querySelector('lag-o-meter'));const fps=document.getElementById('fps');
  return {open:at.classList.contains('maplibregl-compact-show'),btn:!!btn,lagHit:hit(btn,lag),fpsHit:hit(btn,R(fps)),
    fpsShown:getComputedStyle(fps).visibility!=='hidden',osm:!!at.querySelector('a[href*="openstreetmap.org/copyright"]'),
    text:at.querySelector('.maplibregl-ctrl-attrib-inner').textContent}}"""
from smoke_pointer import pointer_only
from smoke_areawx import area_wx

async def land_value(b):
    """t435u: Land value sits in Human impact, off at start, has a legend with source and year, draws the
    overview at low zoom and each area at z7+, a tap shows a real assessed or census figure with its source,
    blank ground is no data, and the layer still draws with the Stinky map on (under the plume)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"})
    await pg.evaluate("()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click()}")
    off = await pg.evaluate("""async()=>{await SunnyLayerLazy.load();const d=SunnyLayers.defs().find(d=>d.id==='landvalue');
      return [d&&d.group, d&&SunnyLayers.isOn('landvalue'), typeof d.legend==='function'?d.legend():(d&&d.legend)||'']}""")
    check("land value in Human impact, off at start", off[0] == "Human impact" and off[1] is False, off[:2])
    # overview at Canada z4
    ov = await pg.evaluate("""async()=>{const s=t=>new Promise(r=>setTimeout(r,t));
      map.jumpTo({center:[-96,56],zoom:4});SunnyLayers.set('landvalue',true);
      for(let i=0;i<30;i++){if(map.getLayer('land-ov-land-raster')&&map.getLayoutProperty('land-ov-land-raster','visibility')!=='none')break;await s(400)}
      await s(800);
      const vis=id=>!!map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none';
      const d=SunnyLayers.defs().find(d=>d.id==='landvalue');
      return {ov:vis('land-ov-land-raster'),fill:!!map.getLayer('land-fill')&&vis('land-fill'),
        leg:typeof d.legend==='function'?d.legend():'',note:typeof d.note==='function'?d.note():''}}""")
    leg = (ov.get("leg") or "") + (off[2] or "")
    check("land value overview draws at z4", ov["ov"] is True, ov)
    low = leg.lower()
    check("land value legend cites Quebec 2026, Vancouver 2025, FHFA 2022, Census 2021, and no data",
          "quebec" in low and "2026" in leg and "vancouver" in low and "2025" in leg
          and ("fhfa" in low or "2022" in leg) and "2021" in leg and "census" in low
          and ("no data" in low or "blank" in low), leg[-500:])
    # Montreal Ville-Marie: real land value, tap card
    card = await pg.evaluate("""async()=>{const s=t=>new Promise(r=>setTimeout(r,t));
      map.jumpTo({center:[-73.56513,45.50157],zoom:12});
      for(let i=0;i<40;i++){const n=map.getLayer('land-fill')?map.queryRenderedFeatures({layers:['land-fill']}).length:0;if(n>0)break;await s(500)}
      await s(800);
      const n=map.getLayer('land-fill')?map.queryRenderedFeatures({layers:['land-fill']}).length:0;
      const vis=id=>!!map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none';
      return {n,ov:vis('land-ov-land-raster'),fill:vis('land-fill')}}""")
    check("land value fills draw in Montreal at z12 and the overview is off", card["n"] > 0 and card["fill"] and not card["ov"], card)
    pt = await pg.evaluate("()=>{const p=map.project([-73.56513,45.50157]);const r=map.getContainer().getBoundingClientRect();return [r.left+p.x,r.top+p.y]}")
    await pg.mouse.click(pt[0], pt[1])
    await pg.wait_for_timeout(3000)
    t = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c&&!c.hidden?[c.innerText,c.innerHTML]:['','']}")
    lowt = (t[0] or "").lower()
    check("land value tap shows a Quebec land figure, CAD per m², market date and source link",
          "per m" in lowt and ("cad" in lowt or "$" in t[0]) and "donneesquebec.ca" in (t[1] or "")
          and "no data" not in lowt and not errs, [t[0][:400], errs])
    # Stinky map together: a Montreal landfill, land stays under the plume
    both = await pg.evaluate("""async()=>{const s=t=>new Promise(r=>setTimeout(r,t));
      SunnyLayers.set('smells',true);
      map.jumpTo({center:[-73.62727,45.51842],zoom:12});
      let pl=0,n=0;
      for(let i=0;i<40;i++){
        n=map.getLayer('land-fill')?map.queryRenderedFeatures({layers:['land-fill']}).length:0;
        pl=map.getLayer('smell-plume-fill')?map.queryRenderedFeatures({layers:['smell-plume-fill']}).length:0;
        if(n>0&&(pl>0||map.getLayer('smell-landfill')))break;await s(500)
      }
      await s(1500);
      n=map.getLayer('land-fill')?map.queryRenderedFeatures({layers:['land-fill']}).length:0;
      pl=map.getLayer('smell-plume-fill')?map.queryRenderedFeatures({layers:['smell-plume-fill']}).length:0;
      const ids=map.getStyle().layers.map(l=>l.id);
      const li=ids.indexOf('land-fill'), pi=ids.indexOf('smell-plume-fill');
      const badges=['smell-landfill','smell-sewage','smell-manure','smell-pulp','smell-meat','smell-refinery','smell-compost','smell-sulphur'];
      const bn=badges.filter(id=>map.getLayer(id)).reduce((a,id)=>a+map.queryRenderedFeatures({layers:[id]}).length,0);
      return {n,pl,bn,order:li+' < '+pi,under:li>=0&&pi>=0?li<pi:null,landOn:SunnyLayers.isOn('landvalue'),smellOn:SunnyLayers.isOn('smells')}}""")
    check("land value and Stinky map both stay on and draw, land under the plume",
          both["landOn"] and both["smellOn"] and both["n"] > 0 and (both["pl"] > 0 or both["bn"] > 0)
          and (both["under"] is True or both["pl"] <= 0), both)
    print("  ", card, t[0][:180].replace("\n"," | ") if t else "", both, flush=True)
    await ctx.close()

from smoke_taps import taps_card
async def credits(b):
    """t390u: map credits sit behind one small "i" button, closed at load on phone and desktop, clear of the Lag-O-Meter and
    FPS; a tap shows every credit with its links."""
    for w in [390, 1366]:
        ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=w)
        await pg.wait_for_timeout(2500)
        await pg.evaluate("()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click()}")
        await pg.wait_for_timeout(500)
        r = await pg.evaluate(CRED)
        check("%d credits closed behind one i button, clear of the meters" % w, r["btn"] and not r["open"] and not r["lagHit"] and not r["fpsHit"]
              and await pg.locator(".maplibregl-ctrl-attrib-button").count() == 1, r)
        await pg.click(".maplibregl-ctrl-attrib-button")
        await pg.wait_for_timeout(500)
        o = await pg.evaluate(CRED)
        check("%d tap shows all credits with links" % w, o["open"] and o["osm"] and "Open-Meteo" in o["text"] and "NASA GIBS" in o["text"]
              and not o["fpsShown"] and not errs, [o, errs])
        await ctx.close()

async def camps_split(b):
    """opt291: Outdoors has Campsites & RV parks (campsites and RV/trailer park switches) and Lookouts &
    viewpoints; fire lookout towers are not under Towers; a campsite, an RV park, a viewpoint and a fire
    lookout each open a card with their source; phone status text has a dark pill behind it (390 px)."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=390)
    await pg.evaluate("()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click()}")
    meta = await pg.evaluate("""async()=>{await SunnyLayerLazy.load();
      const camps=SunnyLayers.defs().find(d=>d.id==='camps');
      const look=SunnyLayers.defs().find(d=>d.id==='lookouts');
      const towers=SunnyLayers.defs().find(d=>d.id==='towers');
      return {cg:camps&&camps.group, cn:camps&&camps.name, ck:(camps.kids||[]).map(k=>k.name),
        lg:look&&look.group, ln:look&&look.name, tg:towers&&towers.group,
        tk:(towers.kids||[]).map(k=>k.name), coff: !SunnyLayers.isOn('camps'), loff:!SunnyLayers.isOn('lookouts')}}""")
    check("camps and lookouts sit in Outdoors, off at start, with RV and campsite switches",
          meta["cg"]=="Outdoors" and meta["cn"]=="Campsites & RV parks" and meta["coff"]
          and meta["ck"]==["Campsites", "RV / trailer parks"]
          and meta["lg"]=="Outdoors" and meta["ln"]=="Lookouts & viewpoints" and meta["loff"]
          and "Fire lookout towers" not in meta["tk"], meta)
    # RV park: Flamboro Valley; campsite nearby stays hidden when only the RV switch is on
    r = await pg.evaluate(WG, {"id": "camps", "c": [-80.07768, 43.36576], "z": 13, "l": ["pack-camps-dot"]})
    check("RV parks draw at Flamboro Valley with a camps legend", r["n"]>0 and "RV / trailer parks" in (r["leg"] or ""), r)
    await pg.mouse.click(r["x"], r["y"])
    await pg.wait_for_timeout(3000)
    t = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c?[c.innerText,c.innerHTML]:['','']}")
    check("RV park tap shows the park with an OpenStreetMap link", "openstreetmap.org/" in t[1] and ("RV" in t[0] or "Flamboro" in t[0] or "trailer" in t[0].lower()) and not errs, [t[0][:300], errs])
    # campsite: Algonquin area, campsites switch only
    await pg.evaluate("""()=>{const k=[...document.querySelectorAll('#layers-panel input[data-kid]')];
      const rv=k.find(i=>i.dataset.kid==='camps-rv'); const c=k.find(i=>i.dataset.kid==='camps-c');
      if(rv&&rv.checked){rv.checked=false;rv.dispatchEvent(new Event('change'))}
      if(c&&!c.checked){c.checked=true;c.dispatchEvent(new Event('change'))}}""")
    await pg.wait_for_timeout(500)
    r2 = await pg.evaluate(WG, {"id": "camps", "c": [-78.59, 45.53], "z": 10, "l": ["pack-camps-dot"]})
    check("campsites draw in Algonquin when only the campsites switch is on", r2["n"]>0, r2)
    await pg.mouse.click(r2["x"], r2["y"])
    await pg.wait_for_timeout(3000)
    t2 = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c?[c.innerText,c.innerHTML]:['','']}")
    check("campsite tap shows a campground with an OpenStreetMap link", "openstreetmap.org/" in t2[1] and ("Camp" in t2[0] or "camp" in t2[0]) and not errs, [t2[0][:300], errs])
    # viewpoint in Toronto and a fire lookout tower
    await pg.evaluate("()=>SunnyLayers.set('camps',false)")
    r3 = await pg.evaluate(WG, {"id": "lookouts", "c": [-79.36501, 43.68583], "z": 14, "l": ["pack-lookouts-dot"]})
    check("lookouts draw a Toronto viewpoint with a legend", r3["n"]>0 and "Viewpoint" in (r3["leg"] or ""), r3)
    await pg.mouse.click(r3["x"], r3["y"])
    await pg.wait_for_timeout(3000)
    t3 = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c?[c.innerText,c.innerHTML]:['','']}")
    check("viewpoint tap shows the lookout with an OpenStreetMap link", "openstreetmap.org/" in t3[1] and ("Viewpoint" in t3[0] or "Lookout" in t3[0] or "Governor" in t3[0]) and not errs, [t3[0][:300], errs])
    r4 = await pg.evaluate(WG, {"id": "lookouts", "c": [-80.02773, 45.33935], "z": 12, "l": ["fire-look-dot"]})
    check("fire lookout towers draw on Lookouts & viewpoints, not Towers", r4["n"]>0, r4)
    await pg.mouse.click(r4["x"], r4["y"])
    await pg.wait_for_timeout(3000)
    t4 = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c?[c.innerText,c.innerHTML]:['','']}")
    check("fire lookout tap shows the tower with a source link",
          ("openstreetmap.org/" in t4[1] or "wikidata.org/" in t4[1]) and ("lookout" in t4[0].lower() or "Lookout" in t4[0] or "Scenic" in t4[0]) and not errs,
          [t4[0][:300], errs])
    st = await pg.evaluate("""()=>{const e=document.getElementById('status');e.textContent='Finding beaches…';
      const s=getComputedStyle(e);const bg=s.backgroundColor;const m=/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(bg);
      return {bg, color:s.color, display:s.display, pad:s.padding, dark:m&&+m[1]<40&&+m[2]<40&&+m[3]<50}}""")
    check("phone status text sits on a dark pill so it reads over light tiles", st["dark"] and "rgb(255" in st["color"].replace(" ",""), st)
    print("  camps_split", meta["cn"], r["n"], t[0][:80].replace("\n"," | "), r4["n"], t4[0][:80].replace("\n"," | "), flush=True)
    await ctx.close()

async def civic(b):
    """t435u: Civic section has Capitals (national and provincial/state switches) and Population density,
    all off at start; Ottawa and Toronto open cards; density draws a GHSL 2020 legend and an opacity slider."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=1366)
    await pg.evaluate("()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click()}")
    meta = await pg.evaluate("""async()=>{await SunnyLayerLazy.load();
      const cap=SunnyLayers.defs().find(d=>d.id==='capitals');
      const dens=SunnyLayers.defs().find(d=>d.id==='popdens');
      return {cg:cap&&cap.group, cn:cap&&cap.name, ck:(cap&&cap.kids||[]).map(k=>k.name),
        coff:!SunnyLayers.isOn('capitals'),
        dg:dens&&dens.group, dn:dens&&dens.name, doff:!SunnyLayers.isOn('popdens'),
        groups:[...document.querySelectorAll('#layers-panel .lp-sec-input')].map(i=>i.dataset.section)}}""")
    check("Civic section has Capitals and Population density, off at start, with two capital switches",
          meta["cg"]=="Civic" and meta["cn"]=="Capitals" and meta["coff"]
          and meta["ck"]==["National capitals", "Provincial & state capitals"]
          and meta["dg"]=="Civic" and meta["dn"]=="Population density" and meta["doff"]
          and "Civic" in (meta["groups"] or []), meta)
    r = await pg.evaluate(WG, {"id": "capitals", "c": [-75.6972, 45.4215], "z": 8, "l": ["cap-nat"]})
    check("national capitals draw at Ottawa with a Civic legend", r["n"]>0 and "National capitals" in (r["leg"] or ""), r)
    await pg.mouse.click(r["x"], r["y"])
    await pg.wait_for_timeout(3000)
    t = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c?[c.innerText,c.innerHTML]:['','']}")
    check("Ottawa tap shows the national capital of Canada and a source link",
          ("wikidata.org/" in t[1] or "naturalearthdata.com" in t[1]) and "Ottawa" in t[0]
          and "Canada" in t[0] and "National capital" in t[0] and not errs, [t[0][:300], errs])
    await pg.evaluate("()=>{SunnyLayers.set('capitals',false);const k=[...document.querySelectorAll('#layers-panel input[data-kid]')];"+
      "const nat=k.find(i=>i.dataset.kid==='capitals-cap-nat');const a=k.find(i=>i.dataset.kid==='capitals-cap-adm1');"+
      "if(nat&&nat.checked){nat.checked=false;nat.dispatchEvent(new Event('change'))}"+
      "if(a&&!a.checked){a.checked=true;a.dispatchEvent(new Event('change'))}}")
    r2 = await pg.evaluate(WG, {"id": "capitals", "c": [-79.3832, 43.6532], "z": 8, "l": ["cap-adm1"]})
    check("provincial capitals draw at Toronto", r2["n"]>0, r2)
    await pg.mouse.click(r2["x"], r2["y"])
    await pg.wait_for_timeout(3000)
    t2 = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c?[c.innerText,c.innerHTML]:['','']}")
    check("Toronto tap shows the capital of Ontario and a source link",
          ("wikidata.org/" in t2[1] or "naturalearthdata.com" in t2[1]) and "Toronto" in t2[0]
          and "Ontario" in t2[0] and not errs, [t2[0][:300], errs])
    await pg.evaluate("()=>SunnyLayers.set('capitals',false)")
    dens = await pg.evaluate("""async()=>{
      const s=t=>new Promise(r=>setTimeout(r,t));
      await SunnyLayerLazy.load();map.jumpTo({center:[-79.4,43.7],zoom:5});
      SunnyLayers.set('popdens',true);
      for(let i=0;i<30;i++){if(map.getLayer('popdens-raster')&&map.getLayoutProperty('popdens-raster','visibility')!=='none')break;await s(400)}
      const d=SunnyLayers.defs().find(x=>x.id==='popdens');
      const vis=!!map.getLayer('popdens-raster')&&map.getLayoutProperty('popdens-raster','visibility')!=='none';
      const slider=!!document.querySelector('.popdens-opa input[type=range]');
      return {vis, leg: typeof d.legend==='function'?d.legend():d.legend, slider, tip:d.tip}}""")
    check("population density draws, names GHSL and 2020 in the legend, and has an opacity slider",
          dens["vis"] and "GHSL" in (dens["leg"] or "") and "2020" in (dens["leg"] or "") and dens["slider"], dens)
    print("  civic", meta["cn"], r["n"], t[0][:80].replace("\n"," | "), r2["n"], t2[0][:80].replace("\n"," | "), flush=True)
    await ctx.close()
async def gamedev(b):
    """t436u/t437u: Fun & Games has Game dev studios, off at start, with tier switches (Closed and Former locations off);
    a studio near Montreal opens a card with its tier and a source link; Reykjavik shows CCP's former harbour office."""
    ctx, pg, errs = await boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"}, w=1366)
    await pg.evaluate("()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click()}")
    meta = await pg.evaluate("""async()=>{await SunnyLayerLazy.load();const g=SunnyLayers.defs().find(d=>d.id==='gamedev');
      return {g:g&&g.group, off:!SunnyLayers.isOn('gamedev'), k:(g&&g.kids||[]).map(k=>k.name+':'+k.dflt)}}""")
    check("Game dev studios sits in Fun & Games, off, with publisher to former-location switches",
          meta["g"]=="Fun & Games" and meta["off"] and len(meta["k"])==8 and meta["k"][0].startswith("Publishers")
          and meta["k"][-1]=="Former locations:false", meta)
    r = await pg.evaluate(WG, {"id": "gamedev", "c": [-73.6, 45.52], "z": 9, "l": ["gd-aaa"]})
    check("AAA studios draw in Montreal with the tier rule in the legend", r["n"]>0 and "250+" in (r["leg"] or ""), r)
    await pg.mouse.click(r["x"], r["y"])
    await pg.wait_for_timeout(3000)
    t = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c?[c.innerText,c.innerHTML]:['','']}")
    check("Montreal studio tap shows the AAA tier and a source link", "AAA" in t[0] and ("wikidata.org/" in t[1] or "openstreetmap.org/" in t[1]) and not errs, [t[0][:300], errs])
    await pg.evaluate("()=>{const k=[...document.querySelectorAll('#layers-panel input[data-kid]')].find(i=>i.dataset.kid==='gamedev-gd-former');"
      "if(k&&!k.checked){k.checked=true;k.dispatchEvent(new Event('change'))}}")
    r2 = await pg.evaluate(WG, {"id": "gamedev", "c": [-21.9487, 64.1533], "z": 15, "l": ["gd-former"]})
    check("CCP's former Grandagarður office draws as a former location", r2["n"]>0, r2)
    # opt308 (t442u): Scale by Headcount (default) or Game revenue; badges grow on log10 steps; legend follows
    sc = await pg.evaluate("""async()=>{const s=t=>new Promise(r=>setTimeout(r,t));
      const d=SunnyLayers.defs().find(x=>x.id==='gamedev');const leg=()=>typeof d.legend==='function'?d.legend():'';
      const sz=()=>JSON.stringify(map.getLayoutProperty('gd-pub','icon-size'));
      const btn=!!document.querySelector('.gd-scale button[data-m=rev]');
      map.jumpTo({center:[10,35],zoom:1.5});await s(2500);const fs=map.querySourceFeatures('w-gamedev');const hl=new Set(fs.map(f=>f.properties.hl)).size,rl=new Set(fs.map(f=>f.properties.rl)).size;
      const h={mode:SunnyGameScale.get(),size:sz(),leg:leg()};
      SunnyGameScale.set('rev');await s(800);
      const r={mode:SunnyGameScale.get(),size:sz(),leg:leg(),op:JSON.stringify(map.getPaintProperty('gd-pub','icon-opacity'))};
      SunnyGameScale.set('head');await s(300);
      return {btn,hl,rl,h,r}}""")
    check("Scale by toggle: headcount by default, game revenue on demand, badge sizes read hl then rl",
          sc["btn"] and sc["h"]["mode"]=="head" and '"hl"' in sc["h"]["size"] and sc["r"]["mode"]=="rev" and '"rl"' in sc["r"]["size"]
          and sc["hl"]>3 and sc["rl"]>1, sc)
    check("legend shows headcount sizes then revenue sizes, with the fixed Publishers line",
          "10k+" in sc["h"]["leg"] and "$10B+" in sc["r"]["leg"] and "3+ subsidiaries" in sc["h"]["leg"], [sc["h"]["leg"][-300:], sc["r"]["leg"][-200:]])
    await pg.evaluate("()=>{const p=document.getElementById('ip-peek');const x=p&&p.querySelector('.ip-x,.pp-close,button[aria-label=Close]');if(x)x.click()}")
    r3 = await pg.evaluate(WG, {"id": "gamedev", "c": [135.7561, 34.9697], "z": 14, "l": ["gd-pub"]})
    await pg.mouse.click(r3["x"], r3["y"])
    await pg.wait_for_timeout(3000)
    t3 = await pg.evaluate("()=>{const c=document.getElementById('ip-peek');return c?[c.innerText,c.innerHTML]:['','']}")
    check("Nintendo card shows its Wikidata headcount and reported game revenue with a source, no console errors",
          "Headcount" in t3[0] and "Game revenue" in t3[0] and "$" in t3[0] and "wikipedia.org" in t3[1] and not errs, [t3[0][:400], errs])
    print("  gamedev", meta["k"], r["n"], t[0][:90].replace("\n"," | "), r2["n"], t3[0][:160].replace("\n"," | "), flush=True)
    await ctx.close()
async def main():
    only = os.environ.get("SUNNY_BUGS_ONLY", "")
    tests = [lazy_legacy, share_restore, goes_slots, pixel_same, peek_closes, mtg_honest, labels_bar, radar_span, labels_base, beach_blade, share_more, maxdetail_boot, obs_kids, forest_404, undersea_state, update_flow, beach_size, sun_card, tonight_sky, smoke_aq, currents, volc_recent, ships_live, wrecks_ghost, label_tiers, credits, rail_abandoned, wars, wifi, ancient, smells, reefs, flight_pin, beach_flow, pointer_only, area_wx, camps_split, land_value, civic, gamedev, taps_card]
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
