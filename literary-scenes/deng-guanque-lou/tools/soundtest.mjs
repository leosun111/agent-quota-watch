import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT/.test(m.text())) errs.push(m.text()); });
await page.goto('file://' + path.join(root, 'dist/deng-guanque-lou.html') + '?still=1&q=light');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
const t0 = Date.now();
await page.click('#btn-l-sound');
await page.waitForFunction(() => document.getElementById('btn-l-sound').getAttribute('aria-pressed') === 'true', null, { timeout: 30000 });
console.log('enable ms', Date.now() - t0);
const r = await page.evaluate(async () => {
  const N = window.__dbg; N.app.startTour(); N.jump(4, 28, true);
  for (let i = 0; i < 20; i++) { N.step(0.1); await new Promise((r) => setTimeout(r, 60)); }
  const S = N.mods.Sound;
  return { state: S.ctx.state, time: +S.ctx.currentTime.toFixed(2), enabled: S.enabled };
});
console.log(JSON.stringify(r), errs);
await browser.close();
