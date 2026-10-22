// @ts-nocheck -- a one-off still shooter: page-side globals and playwright, which the site does not depend on
// usage: PORT_=8786 LANG_=zh SIZE=800x350 DPR=2 JOBS='[{"name":"a","pose":[x,z,h],"cam":{"pos":[..],"target":[..]},"fov":35,"ring":true,"hideCar":false}]' node still.mjs
// Waits for all 10 photographed sets (body[data-photo]) and body[data-still]=settled before each shot.
import { chromium } from 'playwright';
const [W, H] = (process.env.SIZE || '800x350').split('x').map(Number);
const LANG = process.env.LANG_ || 'zh';
const JOBS = JSON.parse(process.env.JOBS);
const DIR = new URL('./director.js', import.meta.url).pathname;
const PORT = process.env.PORT_ || 8786;
const NEED = ['sky', 'plaster', 'ground', 'roof', 'dougong', 'iron', 'wood', 'trees', 'ao', 'murals'];
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DPR || 2) })).newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  p.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') console.log('console', m.type(), m.text().slice(0, 200)); });
  await p.goto(`http://localhost:${PORT}/${LANG === 'en' ? 'en.html' : ''}?promo&quality=high&free`);
  await p.waitForFunction(() => document.getElementById('loading')?.hidden === true && window.__promo, null, { timeout: 90000 });
  await p.addStyleTag({ content: `.bar,.panel{display:none!important}#stage-overlay>*{display:none!important}.app{grid-template-rows:0 1fr!important;height:100vh}.layout{grid-template-columns:1fr!important;height:100vh}.stage.paused .stage-gl{filter:none!important}` });
  await p.addScriptTag({ path: DIR });
  await p.waitForFunction((need) => { const s = (document.body.dataset.photo || '').split(' '); return need.every((k) => s.includes(k)) && document.body.dataset.photoState === 'in'; }, NEED, { timeout: 120000 });
  console.log('photo:', await p.evaluate(() => document.body.dataset.photo));
  await p.evaluate(() => window.__setup());
  if (process.env.GRAIN !== '1') await p.evaluate(() => { const g = window.__promo.world.look.postfx.lens.uniforms.grain; Object.defineProperty(g, 'value', { get: () => 0, set() {} }); });
  for (const j of JOBS) {
    await p.evaluate((j) => {
      window.__job = j;
      window.__shot = (st, P) => {
        const j = window.__job;
        st.cmd = { fwd: 0, turn: 0 }; st.fov = j.fov || 35; st.cam = j.cam; st.dof = false;
        P.world.setTrails(false);
        P.world.ring.group.visible = j.ring !== false;
        P.world.holder.visible = !j.hideCar;
        const ns = !!j.noShadow;
        if (window.__ns !== ns) {
          window.__ns = ns;
          P.world.holder.traverse((o) => {
            if (o.name === 'contactShadow') o.visible = !ns;
            // the app resets castShadow every frame (look.js): pin it behind a getter
            if (o.isMesh && !o.userData.__pinned) {
              o.userData.__pinned = true; let v = o.castShadow;
              Object.defineProperty(o, 'castShadow', { get: () => v && !window.__ns, set: (x) => { v = x; }, configurable: true });
            }
          });
        }
        if (window.__resetAcc > 0 && P.world.look.postfx) { window.__resetAcc--; P.world.look.postfx.lastSig = null; }
        if (j.beams !== undefined) for (const k in P.world.beams) P.world.beams[k].mesh.visible = j.beams;
      };
      if (j.pose) window.__place(...j.pose);
      // restart the still average (hiding the car or the beams may not change its signature)
      window.__resetAcc = 3;
      delete document.body.dataset.still;
    }, j);
    await p.waitForTimeout(400);
    const t0 = Date.now();
    await p.waitForFunction(() => document.body.dataset.still === 'settled', null, { timeout: 60000 });
    await p.screenshot({ path: `${j.name}.png` });
    console.log('shot', j.name, 'settled after', Date.now() - t0, 'ms');
  }
} finally { await b.close(); }
