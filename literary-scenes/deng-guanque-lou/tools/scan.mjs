import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('file://' + path.join(root, 'dist/deng-guanque-lou.html') + '?still=1&q=' + (process.argv[2] || 'light'));
await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
const bad = await page.evaluate(() => window.__dbg.scan(0.05));
const groups = {};
for (const b of bad) { const k = b[0] + ':' + b[2]; (groups[k] = groups[k] || []).push(b); }
for (const k in groups) console.log(k, groups[k].length, JSON.stringify(groups[k][0]), JSON.stringify(groups[k][groups[k].length - 1]));
console.log('total', bad.length);
await browser.close();
