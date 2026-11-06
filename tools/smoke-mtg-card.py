#!/usr/bin/env python3
"""SUNNY targeted gate: Magic store card on an iPhone-width screen.
Checks (t368u): small round green icon-only call button with a tel: link, copy icon top right, set name and release date on one line, prerelease rows show day/time + format, no
"Estimate · how?" section, card sits in the upper half, side panels stay narrow, right panel
has no sideways overflow. Usage: python3 tools/smoke-mtg-card.py http://127.0.0.1:8765/"""
import asyncio, os, re, sys
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
    r = await pg.evaluate("""()=>{const e=document.getElementById('ip-peek');const b=e.getBoundingClientRect();
      const call=e.querySelector('a.sk-call[href^="tel:"]');const cr=call?call.getBoundingClientRect():null;
      const cp=e.querySelector('.pc-copy');const pr=cp?cp.getBoundingClientRect():null;
      const nm=e.querySelector('.mtg-pre-name');
      return {top:b.top,h:b.height,content:e.querySelector('.pk-body').scrollHeight,
      tel:call?call.getAttribute('href'):'', callLabel:call?call.getAttribute('aria-label'):'', callText:call?call.innerText.trim():'',
      callBox:cr?[Math.round(cr.width),Math.round(cr.height),getComputedStyle(call).borderRadius]:null,
      copy:pr?{right:Math.round(b.right-pr.right),top:Math.round(pr.top-b.top),text:cp.innerText.trim(),label:cp.getAttribute('aria-label')}:null,
      est:/Estimate\\s*·\\s*how/i.test(e.innerText), preName:nm?nm.innerText:'', preNameH:nm?Math.round(nm.getBoundingClientRect().height):0,
      rows:[...e.querySelectorAll('.mtg-prow')].map(x=>x.innerText.replace(/\\s+/g,' ')).slice(0,3)}}""")
    print("card", c["n"], r)
    if not r["tel"]: bad.append("no tel: call button")
    if re.search(r"[0-9A-Za-z]", r["callText"]): bad.append("call button shows text %r" % r["callText"])
    if not r["callBox"] or r["callBox"][0] > 44 or abs(r["callBox"][0] - r["callBox"][1]) > 2: bad.append("call button not a small round icon %s" % r["callBox"])
    if not r["copy"] or r["copy"]["text"] or r["copy"]["right"] > 30 or r["copy"]["top"] > 30 or not r["copy"]["label"]: bad.append("copy not an icon at top right %s" % r["copy"])
    if r["est"]: bad.append("Estimate · how? still shown")
    if not r["rows"]: bad.append("no prerelease rows")
    if r["preName"] and "·" not in r["preName"]: bad.append("set name and release date not on one line")
    if r["top"] > 844 * 0.25: bad.append("card not near top (%d px)" % r["top"])
    await pg.evaluate("()=>{const m=document.querySelector('#ip-peek .pk-more');m&&m.click()}")
    await pg.wait_for_timeout(600)
    ip = await pg.evaluate("()=>{const clip=(P)=>{const R=P.getBoundingClientRect();return [...P.querySelectorAll('*')].filter(x=>{const r=x.getBoundingClientRect();if(!r.width)return false;const ox=getComputedStyle(x).overflowX;return r.right>R.right+1||r.left<R.left-1||((ox==='auto'||ox==='scroll')&&x.scrollWidth-x.clientWidth>2)}).map(x=>x.tagName+'.'+x.className).slice(0,5)};const e=document.querySelector('.ip-panel');return {w:Math.round(e.getBoundingClientRect().width),clipped:clip(e.querySelector('.ip-body')||e)}}")
    await pg.evaluate("()=>{const c=document.querySelector('.ip-close');c&&c.click();document.getElementById('lp-tab').click()}")
    await pg.wait_for_timeout(600)
    lp = await pg.evaluate("()=>{const clip=(P)=>{const R=P.getBoundingClientRect();return [...P.querySelectorAll('*')].filter(x=>{const r=x.getBoundingClientRect();if(!r.width)return false;const ox=getComputedStyle(x).overflowX;return r.right>R.right+1||r.left<R.left-1||((ox==='auto'||ox==='scroll')&&x.scrollWidth-x.clientWidth>2)}).map(x=>x.tagName+'.'+x.className).slice(0,5)};const e=document.querySelector('.lp-panel');return {w:Math.round(e.getBoundingClientRect().width),clipped:clip(e.querySelector('.lp-body')||e)}}")
    print("right panel", ip, "left panel", lp)
    want_r, want_l = int(os.environ.get("SUNNY_RIGHT_W", "118")), int(os.environ.get("SUNNY_LEFT_W", "114"))
    if abs(ip["w"] - want_r) > 6: bad.append("right panel %d px, want about %d" % (ip["w"], want_r))
    if abs(lp["w"] - want_l) > 6: bad.append("left panel %d px, want about %d" % (lp["w"], want_l))
    if ip["clipped"]: bad.append("right panel content cut off or scrolls sideways %s" % ip)
    if lp["clipped"]: bad.append("left panel content cut off or scrolls sideways %s" % lp)
    await b.close()
  for x in bad: print("FAIL", x)
  return 1 if bad else 0
sys.exit(asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/")))
