# workspace/whereisthesun/tools/smoke_pointer.py
"""t416u/t417u: All beaches, hover, move, drag: cards open only on click."""
import asyncio
import __main__ as T
VISIBLE = """()=>['ip-peek','hover-box','hover-tip'].filter(id=>{const e=document.getElementById(id);
 return e&&!e.hidden&&e.getClientRects().length&&getComputedStyle(e).display!=='none'}).join(',')"""
ICON = """()=>{const c=map.getContainer().getBoundingClientRect();
 const fs=map.queryRenderedFeatures({layers:['beaches-sun','beaches-dot'].filter(i=>map.getLayer(i))});
 for(const f of fs){const q=map.project(f.geometry.coordinates);if(q.y>100&&q.y<c.height-160&&q.x>70&&q.x<c.width-70&&
 document.elementFromPoint(c.left+q.x,c.top+q.y)===map.getCanvas())return {x:c.left+q.x,y:c.top+q.y}}return null}"""
async def pointer_only(b):
    ctx, pg, errs = await T.boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"})
    await pg.evaluate("""()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click();
      map.jumpTo({center:[-79.45,43.63],zoom:10})}""")
    await pg.wait_for_timeout(1000)
    await pg.mouse.click(680, 430)
    await pg.evaluate("""()=>{SunnyLayers.set('beaches',true);const t=document.getElementById('toggle-sunny');
      if(t.checked)t.click();document.getElementById('btn-all').click()}""")
    at = None
    for _ in range(30):
        await pg.wait_for_timeout(500)
        at = await pg.evaluate("()=>/in view/.test(document.getElementById('status').textContent)&&!map.isMoving()") and await pg.evaluate(ICON)
        if at: break
    T.check("All beaches has an icon for the pointer check", bool(at), errs)
    if not at:
        await ctx.close()
        return
    await pg.evaluate("()=>document.querySelectorAll('#ip-peek .pk-x').forEach(x=>x.click())")
    await pg.wait_for_timeout(1500)
    at = await pg.evaluate(ICON) or at
    n = await pg.evaluate("()=>{window._pointerClicks=0;map.on('click',()=>window._pointerClicks++);return 0}")
    for i in range(10):
        await pg.mouse.move(at["x"] - 27 + i * 3, at["y"])
        await pg.wait_for_timeout(40)
    await pg.wait_for_timeout(3200)
    T.check("hover on a beach icon opens nothing", not await pg.evaluate(VISIBLE), await pg.evaluate(VISIBLE))
    for i in range(15):
        await pg.mouse.move(at["x"] + i * 4, at["y"] + (i % 4) * 3)
        await pg.wait_for_timeout(35)
    await pg.mouse.down()
    for i in range(15): await pg.mouse.move(at["x"] - i * 10, at["y"] + i * 5)
    await pg.mouse.up()
    await pg.wait_for_timeout(3200)
    T.check("moving and dragging after All beaches never commits a click or card",
            await pg.evaluate("()=>window._pointerClicks") == n and not await pg.evaluate(VISIBLE), await pg.evaluate(VISIBLE))
    at = await pg.evaluate(ICON)
    if at:
        await pg.mouse.click(at["x"], at["y"])
        for _ in range(30):
            await pg.wait_for_timeout(300)
            if await pg.evaluate(VISIBLE): break
    T.check("a real beach icon click opens a card", bool(at) and "ip-peek" in await pg.evaluate(VISIBLE) and not errs, errs)
    await ctx.close()
