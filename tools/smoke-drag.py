#!/usr/bin/env python3
"""SUNNY targeted gate (t370u, t374u): drag-kit.js gestures on a 390 px phone, driven by synthetic CDP touch.
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
    # 0 t374u hold timing: one 500 ms timer from finger-down, instant pressed cue, no drag before 500
    await pg.evaluate("""()=>{window.__t={};document.addEventListener('pointerdown',e=>{__t.down=e.timeStamp},true);
      new MutationObserver(()=>{if(document.body.classList.contains('sk-dragging')&&!__t.act)__t.act=performance.now()}).observe(document.body,{attributes:true})}""")
    x, y = await center(".mtg-card-title")
    await touch("touchStart", x, y); await pg.wait_for_timeout(60)
    cue = await pg.evaluate("()=>document.getElementById('ip-peek').classList.contains('is-pressing')")
    await pg.wait_for_timeout(360)
    early = await pg.evaluate("()=>document.body.classList.contains('sk-dragging')")
    await pg.wait_for_timeout(160)
    late = await pg.evaluate("()=>document.body.classList.contains('sk-dragging')")
    lat = await pg.evaluate("()=>__t.act-__t.down")
    await touch("touchEnd", 0, 0); await pg.wait_for_timeout(150)
    check(cue, "pressed cue shows within 60 ms of finger-down")
    check(not early and late, "not dragging at ~420 ms, ready by ~580 ms (%s, %s)" % (early, late))
    check(480 <= lat <= 560, "drag activates %d ms after finger-down (want 500, no extra dwell)" % lat)
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
    # 4b four edge grips: present, clear of buttons/links, and each one drags (touch hold, then mouse at once)
    await pg.evaluate("()=>{document.querySelector('#ip-peek .pk-body').scrollTop=0}")
    ov = await pg.evaluate("""()=>{const P=document.getElementById('ip-peek');const gs=[...P.querySelectorAll('.pk-grip')];
      const hit=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
      const ctl=[...P.querySelectorAll('a,button,input,label,[role=button]')].map(e=>e.getBoundingClientRect()).filter(r=>r.width);
      return {n:gs.length,bad:gs.filter(g=>ctl.some(c=>hit(g.getBoundingClientRect(),c))).map(g=>g.className)}}""")
    check(ov["n"] == 4 and not ov["bad"], "4 grips, none over a button or link %s" % ov)
    for k, dx, dy in (("n", 0, 30), ("s", 0, -30), ("e", -20, 0), ("w", 20, 0)):
      a = await rect("#ip-peek"); x, y = await center(".pk-grip-" + k)
      await gesture(x, y, dx, dy, 540)
      z = await rect("#ip-peek")
      check(abs((z["l"] - a["l"]) - dx) < 8 and abs((z["t"] - a["t"]) - dy) < 8, "touch hold-drag on %s grip moves card (%d,%d)" % (k, z["l"] - a["l"], z["t"] - a["t"]))
    a = await rect("#ip-peek"); x, y = await center(".pk-grip-n")
    await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.move(x + 25, y + 25, steps=5); await pg.mouse.up(); await pg.wait_for_timeout(150)
    z = await rect("#ip-peek")
    check(abs((z["t"] - a["t"]) - 25) < 8, "mouse drags a grip at once, no hold (%d)" % (z["t"] - a["t"]))
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
    # 7b default widths (no saved resize) and the tab nudge, driven with synthetic times
    dw = await pg.evaluate("async()=>{const out={};for(const [t,p] of [['lp-tab','.lp-panel'],['ip-tab','.ip-panel']]){document.getElementById(t).click();await new Promise(r=>setTimeout(r,350));out[t]=Math.round(document.querySelector(p).getBoundingClientRect().width);document.getElementById(t).click();await new Promise(r=>setTimeout(r,350))}return out}")
    check(dw == {"lp-tab": 150, "ip-tab": 156}, "default portrait widths 150/156 %s" % dw)
    nz = await pg.evaluate("""async()=>{const N=SunnyDrag.nudge,S=N.state,o={};const lp=document.getElementById('lp-tab'),ip=document.getElementById('ip-tab');
      const P=document.querySelector('.lp-panel'),Q=document.querySelector('.ip-panel');const op=(el,p,v)=>{if(p.classList.contains('is-open')!==v)el.click()};
      document.activeElement&&document.activeElement.blur();S.lastNudge=-Infinity;S.seen={};S.busy={};
      o.closed=N.due(1e6);N.schedule();o.timerClosed=N.timerLive();
      op(lp,P,true);await new Promise(r=>setTimeout(r,300));document.activeElement&&document.activeElement.blur();
      const T=1e6;o.seed=N.due(T);o.at6900=N.due(T+6900);N.engaged('lp',T+5000);o.engaged=N.due(T+11000);o.at12100=N.due(T+12100);
      o.tick=N.tick(T+12100);o.cls=lp.classList.contains('sk-nudge');o.sizeSame=Math.round(P.getBoundingClientRect().width);
      op(ip,Q,true);await new Promise(r=>setTimeout(r,300));document.activeElement&&document.activeElement.blur();N.due(T+12200);
      o.cool=N.due(T+12100+19900);o.after=N.due(T+12100+20000);
      const cb=P.querySelector('input');if(cb){cb.focus();o.focusedPick=N.due(T+90000)}cb&&cb.blur();
      Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});o.hidden=N.due(T+200000);delete document.hidden;
      N.schedule();o.timerOpen=N.timerLive();
      op(ip,Q,false);op(lp,P,false);await new Promise(r=>setTimeout(r,300));N.schedule();o.timerAfterClose=N.timerLive();o.closed2=N.due(T+500000);return o}""")
    print("nudge", nz)
    check(nz["closed"] is None and not nz["timerClosed"], "no nudge and no timer with both panels closed")
    check(nz["seed"] is None and nz["at6900"] is None and nz["engaged"] is None and nz["at12100"] == "lp-tab", "nudge only after 7 s open and 7 s untouched")
    check(nz["tick"] == "lp-tab" and nz["cls"], "nudge animates the tab only")
    check(nz["cool"] is None and nz["after"] is not None, "20 s cooldown shared across both panels")
    check(nz.get("focusedPick") != "lp-tab", "a focused control in the panel defers its nudge")
    check(nz["hidden"] is None, "no nudge while the page is hidden")
    check(nz["timerOpen"] and not nz["timerAfterClose"] and nz["closed2"] is None, "timer only lives while a panel is open")
    await pg.emulate_media(reduced_motion="reduce")
    rm = await pg.evaluate("()=>{document.getElementById('lp-tab').click();const N=SunnyDrag.nudge;N.state.lastNudge=-Infinity;N.state.seen={lp:1};N.state.busy={};const r=[N.due(1e7),(N.schedule(),N.timerLive())];document.getElementById('lp-tab').click();return r}")
    await pg.emulate_media(reduced_motion="no-preference")
    check(rm == [None, False], "reduced motion: no nudge, no timer %s" % rm)
    await pg.wait_for_timeout(400)
    check(not await pg.evaluate("()=>SunnyDrag.nudge.learned()"), "tab taps and card drags do not count as learning")
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
    lr = await pg.evaluate("()=>[SunnyDrag.nudge.learned(),localStorage.getItem('sunny-blade-learned'),SunnyDrag.nudge.due(1e9),SunnyDrag.nudge.timerLive()]")
    check(lr == [True, "1", None, False], "first real width drag ends hints for good %s" % lr)
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
    # persistence across reload: saved width kept, hints stay off
    await pg.reload(wait_until="load"); await pg.wait_for_function("()=>window.SunnyDrag&&document.querySelector('.ip-panel')", timeout=90000)
    await pg.wait_for_timeout(1500)
    pr = await pg.evaluate("async()=>{document.getElementById('ip-tab').click();await new Promise(r=>setTimeout(r,400));return [Math.round(document.querySelector('.ip-panel').getBoundingClientRect().width),SunnyDrag.nudge.learned()]}")
    check(pr[0] == round(ip3["w"]) and pr[1], "after reload: saved width %d kept, hints off %s" % (ip3["w"], pr))
    await b.close()
  print("drag gate:", "FAIL %d" % len(bad) if bad else "ok")
  return 1 if bad else 0
sys.exit(asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/")))
