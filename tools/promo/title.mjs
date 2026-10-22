// @ts-nocheck -- lays the og:image title over comp.png (comp3.py) in a blank page
// usage: LANG_=zh|en DIR=f-zh node title.mjs  ->  DIR/titled.png (2400x1260)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const LANG = process.env.LANG_;
const D = process.env.DIR || `f-${LANG}`;
const img = "data:image/png;base64," + readFileSync(`${D}/comp.png`).toString("base64");
const zh = `<div class="z1">指南车</div><div class="z2">车怎么拐弯，木人都指着南门</div><div class="z3">一千年前的齿轮机器 · 在浏览器里开一开、拆一拆</div>`;
const en = `<div class="e0">THE SOUTH-POINTING CHARIOT</div><div class="e1">No magnets. Just gears.</div><div class="e2">The chariot turns. The wooden man keeps pointing south.</div><div class="e3">A 1,000-year-old machine. Drive it, X-ray it, take it apart.</div>`;
const html = `<!doctype html><meta charset=utf-8><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{background:url(${img}) center/1200px 630px}
.v{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,30,44,.6) 0%,rgba(18,30,44,.42) 36%,rgba(18,30,44,0) 56%)}
.t{position:absolute;left:56px;top:${LANG === 'zh' ? 40 : 38}px;text-shadow:0 2px 12px rgba(0,0,0,.5)}
.z1{font:400 96px/1 "Kaiti SC","STKaiti",serif;color:#fbf3e2;letter-spacing:.14em}
.z2{margin-top:16px;font:600 36px/1.25 "PingFang SC",sans-serif;color:#fff}
.z3{margin-top:10px;font:500 23px/1.3 "PingFang SC",sans-serif;color:#f3dfb8}
.e0{font:700 19px/1 "Helvetica Neue",sans-serif;letter-spacing:.14em;color:#f3dfb8}
.e1{margin-top:12px;font:400 72px/1.02 "Iowan Old Style",Palatino,serif;color:#fbf3e2}
.e2{margin-top:14px;font:600 28px/1.25 "Helvetica Neue",sans-serif;color:#fff}
.e3{margin-top:8px;font:500 21px/1.3 "Helvetica Neue",sans-serif;color:#f3dfb8}
</style><div class=v></div><div class=t>${LANG === 'zh' ? zh : en}</div>`;
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await (await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 })).newPage();
await p.setContent(html); await p.waitForTimeout(500);
await p.screenshot({ path: `${D}/titled.png` });
await b.close();
