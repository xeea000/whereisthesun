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
async def main():
    only = os.environ.get("SUNNY_BUGS_ONLY", "")
    tests = [lazy_legacy, share_restore, goes_slots, pixel_same, peek_closes, mtg_honest, labels_bar, radar_span, labels_base, beach_blade, share_more, maxdetail_boot, obs_kids, forest_404, undersea_state, update_flow, beach_size]
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
