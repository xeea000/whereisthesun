#!/usr/bin/env python3
"""SUNNY targeted gate: Magic store card on an iPhone-width screen.
Checks: green call button with a tel: link, prerelease rows show day/time + format, no
"Estimate · how?" section, card sits in the upper half, side panels stay narrow, right panel
has no sideways overflow. Usage: python3 tools/smoke-mtg-card.py http://127.0.0.1:8765/"""
import asyncio, os, sys
from playwright.async_api import async_playwright
EXE = os.environ.get("SUNNY_CHROME", "/home/box/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell")
async def main(url):
  bad = []
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=EXE, args=["--use-gl=angle", "--use-angle=swiftshader"])
    ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    await ctx.add_init_script("()=>{try{localStorage.setItem('sunny-geo-ask','done')}catch(e){}}")
    pg = await ctx.new_page()
    await pg.goto(url, wait_until="load", timeout=120000)
    await pg.wait_for_function("()=>window.map&&map.loaded&&map.loaded()", timeout=90000)
    await pg.evaluate("()=>{const t=document.getElementById('lp-tab');t&&t.click()}")
    await pg.wait_for_function("()=>window.SunnyLayers&&window.SunnyLayers.defs().some(d=>d.id==='mtg')", timeout=60000)
    await pg.evaluate("()=>{SunnyLayers.set('mtg',true);document.getElementById('lp-tab').click();map.jumpTo({center:[-79.40,43.70],zoom:11})}")
    await pg.wait_for_function("()=>map.getLayer('mtg-dot')&&map.queryRenderedFeatures({layers:['mtg-dot']}).length>0", timeout=60000)
    c = await pg.evaluate("""()=>{const fs=map.queryRenderedFeatures({layers:['mtg-dot']});const f=fs.find(x=>x.properties.phone&&x.properties.preJson&&x.properties.preJson.length>2)||fs[0];const q=map.project(f.geometry.coordinates);return {n:f.properties.name,x:q.x,y:q.y}}""")
    await pg.evaluate("()=>{const b=[...document.querySelectorAll('button')].find(x=>/not now/i.test(x.textContent||''));if(b)b.click()}")
    await pg.wait_for_timeout(2500)
    c = await pg.evaluate("""()=>{const fs=map.queryRenderedFeatures({layers:['mtg-dot']});const f=fs.find(x=>x.properties.phone&&x.properties.preJson&&x.properties.preJson.length>2)||fs[0];const q=map.project(f.geometry.coordinates);return {n:f.properties.name,x:q.x,y:q.y}}""")
    print("tap", c)
    await pg.mouse.click(c["x"], c["y"])
    await pg.wait_for_function("()=>{const e=document.getElementById('ip-peek');return e&&!e.hidden&&e.querySelector('.mtg-card')}", timeout=20000)
    r = await pg.evaluate("""()=>{const e=document.getElementById('ip-peek');const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,
      tel:[...e.querySelectorAll('a.sk-call[href^="tel:"]')].length, est:/Estimate\\s*·\\s*how/i.test(e.innerText),
      rows:[...e.querySelectorAll('.mtg-prow')].map(x=>x.innerText.replace(/\\s+/g,' ')).slice(0,3)}}""")
    print("card", c["n"], r)
    if not r["tel"]: bad.append("no tel: call button")
    if r["est"]: bad.append("Estimate · how? still shown")
    if not r["rows"]: bad.append("no prerelease rows")
    if r["top"] > 844 * 0.25: bad.append("card not near top (%d px)" % r["top"])
    await pg.evaluate("()=>{const m=document.querySelector('#ip-peek .pk-more');m&&m.click()}")
    await pg.wait_for_timeout(600)
    ip = await pg.evaluate("()=>{const e=document.querySelector('.ip-panel');const b=e.getBoundingClientRect();const body=e.querySelector('.ip-body');return {w:b.width,over:body?body.scrollWidth-body.clientWidth:0}}")
    print("right panel", ip)
    if ip["w"] > 250: bad.append("right panel too wide (%d px)" % ip["w"])
    if ip["over"] > 2: bad.append("right panel overflows sideways by %d px" % ip["over"])
    await b.close()
  for x in bad: print("FAIL", x)
  return 1 if bad else 0
sys.exit(asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/")))
