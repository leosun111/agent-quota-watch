// Screenshots of chapter moments: node tools/tourshots.mjs outdir "act:t,act:t,..." [query] [w h]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [outDir, list = '0:0', query = '', w = '1280', h = '720', ui = '0'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => { if (!/ERR_CERT|already non-indexed/.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto('file://' + path.join(root, 'dist/deng-guanque-lou.html') + '?still=1' + (query ? '&' + query : ''));
await page.waitForFunction(() => window.__ready === true || document.querySelector('#fatal:not([hidden])'), null, { timeout: 240000 });
console.log('ready', ((Date.now() - t0) / 1000).toFixed(1) + 's');
const fatal = await page.evaluate(() => { const f = document.querySelector('#fatal'); return f && !f.hidden ? f.innerText : null; });
if (fatal) { console.log('FATAL', fatal); }
for (const item of list.split(',')) {
  const [a, t] = item.split(':').map(Number);
  const t1 = Date.now();
  if (a >= 0) await page.evaluate(([a, t]) => window.__dbg.jump(a, t), [a, t]);
  if (ui === '1') {
    await page.evaluate(() => window.__dbg.step(1 / 30));
    await page.screenshot({ path: path.join(outDir, `a${a}_t${t}.png`) });
  } else {
    const data = await page.evaluate(() => window.__dbg.shot(2));
    fs.writeFileSync(path.join(outDir, `a${a}_t${t}.png`), Buffer.from(data.split(',')[1], 'base64'));
  }
  const st = await page.evaluate(() => window.__dbg.state());
  console.log(item, ((Date.now() - t1) / 1000).toFixed(1) + 's', JSON.stringify(st));
}
console.log(JSON.stringify(await page.evaluate(() => window.__dbg.info())));
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
