# workspace/whereisthesun/tools/smoke_taps.py
"""t409u: every layer in the Layers panel, switched on alone, gives a card for a tap on what it draws (dot, cluster, line, area,
picture or field); a bare dropped-pin card does not count. Layers that draw nothing in the test views are listed, not failed.
SUNNY_TAP_LAYERS=a,b limits the loop."""
import os
import __main__ as T
VIEWS = [[-79.40, 43.66, 11], [-96, 55, 4], [0, 25, 2]]
FIND = """(a)=>{const c=map.getContainer().getBoundingClientRect(),own=window.SunnyTapCard?SunnyTapCard.owner:()=>'';
 const ids=map.getStyle().layers.map(l=>l.id).filter(i=>own(i)===a.id&&map.getLayoutProperty(i,'visibility')!=='none');
 const field=ids.some(i=>/raster|heatmap|hillshade/.test(map.getLayer(i).type));let best=null;
 for(let gy=2;gy<11;gy++)for(let gx=2;gx<9;gx++){const x=c.width*gx/10,y=c.height*gy/12;
  if(document.elementFromPoint(c.left+x,c.top+y)!==map.getCanvas())continue;
  const f=ids.length?map.queryRenderedFeatures([[x-4,y-4],[x+4,y+4]],{layers:ids}).filter(g=>!/raster|heatmap|hillshade/.test(g.layer.type)):[];
  if(!f.length)continue;let px=x,py=y;const g=f[0].geometry;
  if(g.type==='Point'){const q=map.project(g.coordinates);if(document.elementFromPoint(c.left+q.x,c.top+q.y)===map.getCanvas()){px=q.x;py=q.y}}
  const d=Math.hypot(px-c.width/2,py-c.height/2);if(!best||d<best.d)best={x:c.left+px,y:c.top+py,d}}
 if(best)return best;if(field||!ids.length&&SunnyLayers.isOn(a.id))return {x:c.left+c.width*0.62,y:c.top+c.height*0.45,field:true};return null}"""
CARD = """()=>{const p=document.getElementById('ip-peek');if(!p||p.hidden||!p.getClientRects().length)return '';
 return p.innerText.replace(/\\n+/g,' | ')}"""
async def fresh(b):
    ctx, pg, errs = await T.boot(b, {"sunny-layers-off-v1": "1", "sunny-geo-ask": "done"})
    await pg.evaluate("""async()=>{const d=document.querySelector('.geo-ask.is-on .geo-ask-deny');if(d)d.click();await SunnyLayerLazy.load();
      map.jumpTo({center:[-40,30],zoom:4})}""")
    await pg.wait_for_timeout(600)
    await pg.mouse.click(683, 400)
    await pg.wait_for_timeout(600)
    return ctx, pg, errs
async def taps_card(b):
    ctx, pg, errs = await fresh(b)
    ids = await pg.evaluate("()=>SunnyLayers.defs().filter(d=>d.group&&d.group!=='none'&&d.name).map(d=>d.id)")
    only = os.environ.get("SUNNY_TAP_LAYERS", "")
    ids = [i for i in ids if not only or i in only.split(",")]
    bad, none, n = [], [], 0
    for lid in ids:
        if n and n % 8 == 0:
            await ctx.close()
            ctx, pg, errs = await fresh(b)
        n += 1
        await pg.evaluate("()=>document.querySelectorAll('#ip-peek .pk-x').forEach(x=>x.click())")
        at = None
        for v in VIEWS:
            await pg.evaluate("(a)=>{SunnyLayers.defs().forEach(d=>{if(d.id!==a[3]&&SunnyLayers.isOn(d.id))SunnyLayers.set(d.id,false)});"
                              "map.jumpTo({center:[a[0],a[1]],zoom:a[2]});SunnyLayers.set(a[3],true)}", v + [lid])
            if lid == "beaches":
                await pg.evaluate("()=>{const b=document.getElementById('btn-all');if(b)b.click()}")
            for _ in range(5):
                await pg.wait_for_timeout(1200)
                at = await pg.evaluate(FIND, {"id": lid})
                if at and not at.get("field"): break
            if at and not at.get("field"): break
        if at and at.get("field"):
            sk = await pg.evaluate("""(did)=>{const own=window.SunnyTapCard?SunnyTapCard.owner:()=>'';
              const mid=g=>{if(!g)return null;if(g.type==='Point')return g.coordinates;
                if(g.type==='LineString')return g.coordinates[Math.floor(g.coordinates.length/2)];
                if(g.type==='MultiLineString'&&g.coordinates[0])return g.coordinates[0][0];
                if(g.type==='Polygon'&&g.coordinates[0])return g.coordinates[0][0];return null};
              for(const l of map.getStyle().layers){if(own(l.id)!==did||map.getLayoutProperty(l.id,'visibility')==='none')continue;
                if(/raster|heatmap|hillshade/.test(l.type))continue;
                let fs=[];try{fs=map.querySourceFeatures(l.source,l['source-layer']?{sourceLayer:l['source-layer']}:{})}catch(e){}
                const f=fs.find(x=>mid(x.geometry));if(!f)continue;const c=mid(f.geometry);
                return {lon:+c[0],lat:+c[1]}} return null}""", lid)
            if sk:
                await pg.evaluate("(a)=>{map.jumpTo({center:[a[0],a[1]],zoom:8})}", [sk["lon"], sk["lat"]])
                await pg.wait_for_timeout(2000)
                at = await pg.evaluate(FIND, {"id": lid}) or at
        if not at:
            none.append(lid)
            continue
        await pg.mouse.click(at["x"], at["y"])
        await pg.wait_for_timeout(2500)
        t = await pg.evaluate(CARD)
        if not t or ("Dropped pin" in t and len(t.split(" | ")) <= 6):
            bad.append([lid, t[:120]])
    await ctx.close()
    print("taps_card: %d layers, nothing drawn in the test views: %s" % (len(ids), ",".join(none) or "none"), flush=True)
    T.check("a tap on what each layer draws gives a card (%d layers)" % (len(ids) - len(none)), not bad, bad)
