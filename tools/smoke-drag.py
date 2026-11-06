#!/usr/bin/env python3
"""SUNNY targeted gate (t370u): drag-kit.js gestures on a 390 px phone, driven by synthetic CDP touch.
DOM-level checks only, not a real device. Usage: python3 tools/smoke-drag.py http://127.0.0.1:8765/"""
import asyncio, os, sys
from playwright.async_api import async_playwright
EXE = os.environ.get("SUNNY_CHROME", "/home/box/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
bad = []
def check(ok, msg):
  print(("ok   " if ok else "FAIL ") + msg)
  if not ok: bad.append(msg)
async def main(url):
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=EXE, args=["--use-gl=angle", "--use-angle=swiftshader"])
    ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    await ctx.add_init_script("()=>{try{localStorage.setItem('sunny-geo-ask','done')}catch(e){}}")
    pg = await ctx.new_page()
    cdp = await ctx.new_cdp_session(pg)
    async def touch(kind, x, y):
      pts = [] if kind == "touchEnd" else [{"x": x, "y": y}]
      await cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": pts})
    async def gesture(x, y, dx, dy, hold):
      await touch("touchStart", x, y)
      await pg.wait_for_timeout(hold)
      n = max(6, int((abs(dx) + abs(dy)) / 40))
      for i in range(1, n + 1):
        await touch("touchMove", x + dx * i / n, y + dy * i / n)
        await pg.wait_for_timeout(16)
      await touch("touchEnd", 0, 0)
      await pg.wait_for_timeout(150)
    async def rect(sel):
      return await pg.evaluate("(s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height,open:e.classList.contains('is-open')}}", sel)
    async def center(sel):
      return await pg.evaluate("(s)=>{const e=document.querySelector(s);const r=e.getBoundingClientRect();return [r.left+Math.min(r.width/2,40),r.top+r.height/2]}", sel)
    await pg.goto(url, wait_until="load", timeout=120000)
    await pg.wait_for_function("()=>window.map&&map.loaded&&map.loaded()&&window.SunnyDrag", timeout=90000)
    await pg.evaluate("()=>{const b=[...document.querySelectorAll('button')].find(x=>/not now/i.test(x.textContent||''));if(b)b.click();document.getElementById('lp-tab').click()}")
    await pg.wait_for_function("()=>window.SunnyLayers&&SunnyLayers.defs().some(d=>d.id==='mtg')", timeout=60000)
    await pg.evaluate("()=>{SunnyLayers.set('mtg',true);document.getElementById('lp-tab').click();map.jumpTo({center:[-79.40,43.70],zoom:11})}")
    await pg.wait_for_function("()=>map.getLayer('mtg-dot')&&map.queryRenderedFeatures({layers:['mtg-dot']}).length>0", timeout=60000)
    await pg.wait_for_timeout(1500)
    c = await pg.evaluate("()=>{const f=map.queryRenderedFeatures({layers:['mtg-dot']}).find(x=>x.properties.phone)||map.queryRenderedFeatures({layers:['mtg-dot']})[0];const q=map.project(f.geometry.coordinates);return [q.x,q.y]}")
    await pg.mouse.click(c[0], c[1])
    await pg.wait_for_function("()=>{const e=document.getElementById('ip-peek');return e&&!e.hidden&&e.querySelector('.mtg-card-head')}", timeout=20000)
    await pg.wait_for_timeout(500)
    # 1 hold on the title row then drag
    r0 = await rect("#ip-peek"); x, y = await center(".mtg-card-title")
    await gesture(x, y, 0, 80, 520)
    r1 = await rect("#ip-peek")
    check(abs((r1["t"] - r0["t"]) - 80) < 12, "hold-drag on title moves card down ~80 px (moved %d)" % (r1["t"] - r0["t"]))
    # 2 moving before the hold does not drag
    x, y = await center(".mtg-card-title")
    await gesture(x, y, 0, 60, 60)
    r2 = await rect("#ip-peek")
    check(abs(r2["t"] - r1["t"]) < 2, "quick swipe before hold does not move card")
    # 3 buttons never start a drag
    x, y = await center(".pc-copy")
    await gesture(x, y, 0, 60, 520)
    r3 = await rect("#ip-peek")
    check(abs(r3["t"] - r2["t"]) < 2, "hold on Copy button does not move card")
    # 4 card body content stays a scroll area
    x, y = await center(".mtg-pday")
    await gesture(x, y, 0, -60, 520)
    r4 = await rect("#ip-peek")
    check(abs(r4["t"] - r3["t"]) < 2 and abs(r4["l"] - r3["l"]) < 2, "hold in scroll content does not move card")
    # 5 clamp to the screen; close, copy and call stay reachable
    await pg.evaluate("()=>{document.querySelector('#ip-peek .pk-body').scrollTop=0}")
    x, y = await center(".mtg-card-title")
    await gesture(x, y, -900, -1500, 520)
    r5 = await rect("#ip-peek")
    check(r5["t"] <= 12 and r5["l"] <= 12 and r5["t"] >= 0 and r5["l"] >= 0 and r5["r"] <= 390, "card clamped on screen after a far drag %s" % r5)
    reach = await pg.evaluate("()=>['.pk-x','.pc-copy','.sk-call'].map(s=>{const e=document.querySelector('#ip-peek '+s);if(!e)return s+':none';const r=e.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight?'':s})")
    check(not any(reach), "close/copy/call reachable %s" % reach)
    # 6 orientation: landscape then back, still on screen
    await pg.set_viewport_size({"width": 844, "height": 390}); await pg.wait_for_timeout(500)
    r6 = await rect("#ip-peek")
    check(r6["w"] > 0 and r6["t"] >= 0 and r6["b"] <= 390 + 1 and r6["r"] <= 844, "card on screen after rotate to landscape %s" % r6)
    await pg.set_viewport_size({"width": 390, "height": 844}); await pg.wait_for_timeout(500)
    await pg.evaluate("()=>{const x=document.querySelector('#ip-peek .pk-x');x&&x.click()}")
    # 7 triangle tap toggles
    x, y = await center("#lp-tab")
    await pg.touchscreen.tap(x, y); await pg.wait_for_timeout(400)
    o1 = (await rect(".lp-panel"))["open"]
    x, y = await center("#lp-tab")
    await pg.touchscreen.tap(x, y); await pg.wait_for_timeout(400)
    o2 = (await rect(".lp-panel"))["open"]
    check(o1 and not o2, "tapping the left tab opens then closes the panel (%s, %s)" % (o1, o2))
    # 8 left: drag out opens, then widen; vertical move
    x, y = await center("#lp-tab")
    await gesture(x, y, 60, 0, 30); await pg.wait_for_timeout(400)
    lp = await rect(".lp-panel")
    check(lp["open"], "dragging the closed left tab outward opens it")
    w0 = lp["w"]; x, y = await center("#lp-tab")
    await gesture(x, y, 80, 0, 30)
    lp2 = await rect(".lp-panel")
    check(abs((lp2["w"] - w0) - 80) < 12, "left panel widens by drag (%d -> %d)" % (w0, lp2["w"]))
    x, y = await center("#lp-tab")
    await gesture(x, y, 0, 50, 30)
    lp3 = await rect(".lp-panel")
    check(abs((lp3["t"] - lp2["t"]) - 50) < 10 and abs(lp3["w"] - lp2["w"]) < 2, "left panel moves down ~50 without resizing")
    clip = await pg.evaluate("()=>{const P=document.querySelector('.lp-body');const R=P.getBoundingClientRect();return [...P.querySelectorAll('*')].filter(x=>{const r=x.getBoundingClientRect();return r.width&&(r.right>R.right+1)}).length}")
    check(clip == 0, "left panel content fits at new width")
    x, y = await center("#lp-tab"); await pg.touchscreen.tap(x, y); await pg.wait_for_timeout(400)
    # right: open by tap, then widen by dragging left
    x, y = await center("#ip-tab"); await pg.touchscreen.tap(x, y); await pg.wait_for_timeout(500)
    ip = await rect(".ip-panel")
    x, y = await center("#ip-tab")
    await gesture(x, y, -70, 0, 30)
    ip2 = await rect(".ip-panel")
    check(ip["open"] and abs((ip2["w"] - ip["w"]) - 70) < 12, "right panel widens by dragging its tab inward (%d -> %d)" % (ip["w"], ip2["w"]))
    check(ip2["r"] <= 391 and ip2["l"] > 60, "right panel stays on its edge and leaves map visible")
    await gesture(x - 70, y, -2000, 0, 30)
    ip3 = await rect(".ip-panel")
    check(ip3["w"] <= 390 * 0.72 + 1, "right panel width capped (%d)" % ip3["w"])
    await b.close()
  print("drag gate:", "FAIL %d" % len(bad) if bad else "ok")
  return 1 if bad else 0
sys.exit(asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/")))
