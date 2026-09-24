// Multi-view screenshots in one page load (renders on demand; robust on software GL).
// usage: node tools/multishot.mjs views.json outdir [query] [w h]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [viewsFile, outDir, query = '', w = '1280', h = '720'] = process.argv.slice(2);
const views = JSON.parse(fs.readFileSync(viewsFile, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => { if (!m.text().includes('ERR_CERT')) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto('file://' + path.join(root, 'dist/deng-guanque-lou.html') + '?still=1' + (query ? '&' + query : ''));
await page.waitForFunction(() => window.__ready === true || document.querySelector('#fatal:not([hidden])'), null, { timeout: 240000 });
console.log('ready', ((Date.now() - t0) / 1000).toFixed(1) + 's');
for (const v of views) {
  const t1 = Date.now();
  const data = await page.evaluate((v) => { if (v.js) eval(v.js); return window.__dbg.shot(v.frames || 2); }, v);
  fs.writeFileSync(path.join(outDir, v.name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
  console.log(v.name, ((Date.now() - t1) / 1000).toFixed(1) + 's');
}
const info = await page.evaluate(() => window.__dbg && window.__dbg.info ? window.__dbg.info() : null);
console.log(JSON.stringify(info));
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
