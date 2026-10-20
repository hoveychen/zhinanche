// @ts-nocheck -- a one-off recorder: page-side globals and playwright, which the site does not depend on
// Frame-stepped promo recorder: the page clock only moves on __step, one
// screenshot per frame, ffmpeg joins them.
//   LANG_=zh|en W=1920 H=1080 SQ=0|1 OUT=dir [FROM=s TO=s EVERY=n] node rec.mjs
//   README loop: GIF=1 SHOTS=shots-gif.js W=1120 H=630 OUT=dir node rec.mjs
// Run from this folder with the site served on :8786 (PORT=8786 node tools/serve.mjs)
// and playwright installed beside it (not a dependency of the site); the page
// is opened with ?promo (js/main.js). enc.sh joins the frames: sh enc.sh dir out.mp4 [kbps]
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';

const LANG = process.env.LANG_ || 'en';
const FPS = 30, SUB = 2;
const W = Number(process.env.W || 1920), H = Number(process.env.H || 1080);
const SQ = process.env.SQ === '1';
const OUT = process.env.OUT || `frames-${LANG}`;
const EVERY = Number(process.env.EVERY || 1);
const CAPS = {
  zh: {
    hook: ['没有磁铁。', '木人却永远指着南方'],
    lines: [[2.75, 5.0, '车随便怎么拐'], [5.0, 7.15, '木人的手 始终指着南门'], [7.35, 10.85, '原地转一整圈 木人纹丝不动'], [11.1, 13.15, '全靠齿轮']],
    title: ['指南车', '在浏览器里开一开、拆一拆'],
  },
  en: {
    hook: ['No magnets.', 'Yet the little man always points south.'],
    lines: [[2.75, 5.0, 'Steer the cart any way you like…'], [5.0, 7.15, '…his hand stays on the south gate'], [7.35, 10.85, 'Spin it a full turn. He doesn’t budge.'], [11.1, 13.15, 'Just gears.']],
    title: ['The South-Pointing Chariot', 'Drive it and take it apart in your browser'],
  },
}[LANG];
const zh = LANG === 'zh';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const c = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await c.newPage();
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.addInitScript(() => {
    const realRaf = window.requestAnimationFrame.bind(window);
    const realNow = performance.now.bind(performance);
    let frozen = false, vt = 0, queue = [];
    performance.now = () => (frozen ? vt : realNow());
    window.requestAnimationFrame = (cb) => { if (!frozen) return realRaf(cb); queue.push(cb); return queue.length; };
    window.__freeze = () => { vt = realNow(); frozen = true; };
    window.__step = (ms) => { vt += ms; const q = queue; queue = []; for (const cb of q) cb(vt); };
  });
  await p.goto(`http://localhost:8786/?promo&quality=high&free&lang=${LANG}`);
  await p.waitForFunction(() => document.getElementById('loading')?.hidden === true && window.__promo, null, { timeout: 60000 });
  const u = (px) => `${(px / 1080) * 100}vmin`;
  await p.addStyleTag({ content: `
    .bar,.panel{display:none!important}#stage-overlay>*:not(.hud-dial){display:none!important}${process.env.GIF ? '.hud-dial{left:auto!important;right:96px!important}' : '.hud-dial{display:none!important}'}
    .app{grid-template-rows:0 1fr!important;height:100vh}.layout{grid-template-columns:1fr!important;height:100vh}
    .promo{position:absolute;inset:0;pointer-events:none;color:#fbf6ea;font-family:var(--kai)}
    .promo>div{position:absolute;left:0;right:0;text-align:center;opacity:0}
    .promo .hook{top:${SQ ? '7%' : '8%'};${SQ ? '' : 'text-align:left;left:6%;right:auto;'}text-shadow:0 ${u(3)} ${u(24)} rgba(20,12,4,.75),0 0 ${u(3)} rgba(20,12,4,.5)}
    .promo .hook b{display:block;font-weight:400;font-size:${u(SQ ? 128 : 136)};letter-spacing:${zh ? '0.14em' : '0.01em'};line-height:1.1}
    .promo .hook span{display:block;margin-top:${u(14)};font-size:${u(48)};letter-spacing:${zh ? '0.12em' : '0.01em'}}
    .promo .cap{bottom:${SQ ? '6%' : '5.5%'}}
    .promo .cap span{display:inline-block;max-width:88%;padding:${u(14)} ${u(34)};border-radius:${u(12)};background:rgba(28,22,16,.66);font-size:${u(SQ ? 50 : 54)};line-height:1.25;letter-spacing:${zh ? '0.12em' : '0.01em'}}
    .promo .veil{inset:0;opacity:0;background:linear-gradient(rgba(26,16,8,.85),rgba(26,16,8,.35) 55%,rgba(26,16,8,.1))}
    .promo .title{top:${SQ ? '12%' : '9%'};z-index:2}
    .promo .title b{display:block;font-weight:400;font-size:${u(zh ? 150 : (SQ ? 92 : 104))};letter-spacing:${zh ? '0.2em' : '0.01em'};line-height:1.1;color:#f4d27a;text-shadow:0 ${u(4)} ${u(20)} rgba(0,0,0,.5)}
    .promo .title span{display:block;margin-top:${u(28)};font-size:${u(50)};letter-spacing:${zh ? '0.12em' : '0.01em'}}
  ` });
  await p.evaluate((cfg) => { window.__cfg = cfg; }, { caps: CAPS, square: SQ });
  await p.addScriptTag({ path: 'director.js' });
  await p.waitForTimeout(8000); // courtyard, textures, post-processing
  await p.evaluate(() => window.__setup());
  await p.addScriptTag({ path: process.env.SHOTS || 'shots.js' });
  const END = await p.evaluate(() => window.__T.end);
  const FROM = Number(process.env.FROM || (await p.evaluate(() => window.__T.from)) || 0), TO = Number(process.env.TO || END);
  await p.evaluate(() => window.__freeze());
  const FRAMES = Math.round(TO * FPS);
  const t0 = Date.now();
  let n = 0;
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FPS;
    for (let k = 0; k < SUB; k++) await p.evaluate(([ms, t]) => { window.__dir.t = t; window.__step(ms); }, [1000 / FPS / SUB, t]);
    if (t + 1e-6 < FROM || f % EVERY) continue;
    await p.screenshot({ path: `${OUT}/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 95 });
    n++;
    if (f % 60 === 0) console.log(`frame ${f}/${FRAMES} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  console.log(`captured ${n} frames (${FRAMES} stepped) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} finally { await b.close(); }
