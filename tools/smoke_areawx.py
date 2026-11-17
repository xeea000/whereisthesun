# workspace/whereisthesun/tools/smoke_areawx.py
"""t418u-t420u: beach weather comes from the area grid in a few requests, and a busy weather service never dead-ends a popup."""
import __main__ as T
from smoke_pointer import ICON
NTH = ICON.replace("()=>{", "(k)=>{").replace("return {x:c.left+q.x,y:c.top+q.y}", "if(k--<=0)return {x:c.left+q.x,y:c.top+q.y}")
ALL = """()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click();map.jumpTo({center:[-79.45,43.63],zoom:10})}"""
GO = """()=>{SunnyLayers.set('beaches',true);const t=document.getElementById('toggle-sunny');if(t.checked)t.click();
  document.getElementById('btn-all').click()}"""
PEEK = "()=>{const p=document.getElementById('ip-peek');return p&&!p.hidden?p.innerText:''}"
async def run(b, busy):
    ctx, pg, errs = await T.boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"})
    om = {"n": 0, "busy": 0}
    async def route(r):
        if busy and om["busy"] < busy:
            om["busy"] += 1
            return await r.fulfill(status=429, headers={"Retry-After": "1", "Access-Control-Allow-Origin": "*"}, body="busy")
        await r.continue_()
    pg.on("request", lambda q: om.__setitem__("n", om["n"] + 1) if "api.open-meteo.com" in q.url else None)
    await pg.route("**/api.open-meteo.com/**", route)
    await pg.evaluate(ALL)
    await pg.wait_for_timeout(1000)
    await pg.mouse.click(680, 430)
    n0 = om["n"]
    await pg.evaluate(GO)
    at = None
    for _ in range(40):
        await pg.wait_for_timeout(500)
        at = await pg.evaluate("()=>/in view/.test(document.getElementById('status').textContent)&&!map.isMoving()") and await pg.evaluate(ICON)
        if at: break
    await pg.wait_for_timeout(2000)
    shown = await pg.evaluate("()=>map.getLayer('beaches-sun')?map.queryRenderedFeatures({layers:['beaches-sun']}).length:0")
    nAll = om["n"] - n0
    texts = []
    for i in range(3):
        at = await pg.evaluate(NTH, i * 7)
        if not at: break
        await pg.mouse.click(at["x"], at["y"])
        t = ""
        for _ in range(40):
            await pg.wait_for_timeout(500)
            t = await pg.evaluate(PEEK)
            if "area forecast" in t and "retrying" not in t: break
        texts.append(t.replace("\n", " | "))
        await pg.evaluate("()=>document.querySelectorAll('#ip-peek .pk-x').forEach(x=>x.click())")
        await pg.mouse.move(10, 790)
        await pg.wait_for_timeout(500)
    st = await pg.evaluate("()=>window.SunnyAreaWx?SunnyAreaWx.stats():null")
    await ctx.close()
    return {"all": nAll, "total": om["n"] - n0, "icons": shown, "texts": texts, "stats": st, "busy": om["busy"], "errs": errs}
async def area_wx(b):
    r = await run(b, 0)
    print("area_wx requests", {k: r[k] for k in ("all", "total", "icons", "stats")}, flush=True)
    T.check("All beaches gets weather for every icon in at most 3 requests", r["icons"] > 0 and r["all"] <= 3, r)
    T.check("three beach taps add no per-beach requests and say the forecast is an area estimate",
            r["total"] <= 3 and len(r["texts"]) == 3 and all("area forecast" in t and "Couldn't" not in t for t in r["texts"]), r)
    q = await run(b, 3)
    T.check("a busy (429) weather service is retried and every popup still gets a forecast, never a dead end",
            q["busy"] == 3 and q["stats"]["retries"] >= 1 and all("Couldn't" not in t and ("area forecast" in t or "retrying" in t) for t in q["texts"])
            and any("area forecast" in t for t in q["texts"]) and not q["errs"], q)
