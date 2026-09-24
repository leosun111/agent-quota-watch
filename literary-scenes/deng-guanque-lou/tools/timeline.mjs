import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('file://' + path.join(root, 'dist/deng-guanque-lou.html') + '?still=1&q=light');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
const r = await page.evaluate(() => {
  const out = {};
  const N = window.__dbg, S = () => N.state();
  // stepping helper without rendering cost: step(dt) renders; use it sparingly
  const run = (sec, dt = 0.25) => { for (let t = 0; t < sec; t += dt) N.step(dt); };
  // 1. continuous
  N.app.startTour();
  const acts = [];
  let last = -1, total = 0;
  while (!S().ended && total < 400) { N.step(0.5); total += 0.5; if (S().act !== last) { last = S().act; acts.push([last, total]); } }
  out.continuous = { acts, total, ended: S().ended };
  // 2. chapter mode
  document.getElementById('btn-pace').click();
  N.jump(0, 26, true);
  run(2, 0.5);
  out.chapter = { awaiting: S().awaiting, act: S().act, t: +S().t.toFixed(2) };
  document.getElementById('btn-continue').click();
  run(1, 0.5);
  out.chapterAfter = { act: S().act, awaiting: S().awaiting };
  document.getElementById('btn-pace').click();
  // 3. pause
  N.jump(2, 5, true);
  document.getElementById('btn-play').click();
  const t0 = S().t; run(2, 0.5);
  out.pause = { playing: S().playing, t0, t1: S().t };
  document.getElementById('btn-play').click();
  run(1, 0.5);
  out.resume = { playing: S().playing, t: +S().t.toFixed(2) };
  // 4. next / prev with dips
  document.getElementById('btn-next').click(); run(1.2, 0.1);
  out.next = S().act;
  document.getElementById('btn-prev').click(); run(1.2, 0.1);
  out.prev = S().act;
  // 5. speech hold: fake a long utterance
  const Sp = N.mods.Speech; const orig = Sp.busy;
  Sp.busy = () => true;
  N.jump(1, 16.8, true); run(3, 0.25);
  out.hold = { act: S().act, t: +S().t.toFixed(2), holding: S().holding };
  Sp.busy = orig; run(2, 0.25);
  out.release = { act: S().act, holding: S().holding };
  // 6. state rebuild: stork & poet at l4 start vs jump from later act
  N.jump(5, 10); N.step(0); const a = N.pose(4, 0);
  N.jump(4, 0); N.step(0); const b = N.pose(4, 0);
  out.rebuild = JSON.stringify(a) === JSON.stringify(b);
  return out;
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
