// Render the built page headlessly and save screenshots.
// usage: node tools/shot.mjs "<query>" out.png [width height] [waitMs]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [query = '', out = 'shot.png', w = '1280', h = '720', wait = '1500'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto('file://' + path.join(root, 'dist/deng-guanque-lou.html') + (query ? '?' + query : ''));
try {
  await page.waitForFunction(() => window.__ready === true || document.querySelector('#fatal:not([hidden])'), null, { timeout: 180000 });
} catch (e) { logs.push('timeout waiting for ready'); }
const t1 = Date.now();
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log(`ready in ${((t1 - t0) / 1000).toFixed(1)}s`);
console.log(logs.filter((l) => !l.includes('GPU stall')).slice(0, 40).join('\n'));
await browser.close();
