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
async def main():
    only = os.environ.get("SUNNY_BUGS_ONLY", "")
    tests = [lazy_legacy, share_restore, goes_slots]
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
