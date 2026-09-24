import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// WAV: 5 phrases (title + 4 lines) with 0.6 s pauses
const sr = 16000, phr = [1.6, 1.3, 1.3, 1.3, 1.3], gap = 0.6;
const total = phr.reduce((a, b) => a + b + gap, 0.4);
const n = Math.floor(total * sr), pcm = new Int16Array(n);
let t = 0.3;
for (const d of phr) { for (let i = Math.floor(t * sr); i < Math.floor((t + d) * sr); i++) pcm[i] = Math.sin(i / sr * 2 * Math.PI * 220) * 12000 * (0.6 + 0.4 * Math.sin(i / sr * 9)); t += d + gap; }
const buf = Buffer.alloc(44 + n * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
Buffer.from(pcm.buffer).copy(buf, 44);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('file://' + path.join(root, 'dist/deng-guanque-lou.html') + '?still=1&q=light');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 240000 });
await page.setInputFiles('#voice-file', { name: 'recital.wav', mimeType: 'audio/wav', buffer: buf });
await page.waitForFunction(() => !/正在分析/.test(document.getElementById('voice-file-note').textContent), null, { timeout: 20000 });
console.log(await page.textContent('#voice-file-note'));
const r = await page.evaluate(() => { const c = window.__dbg.mods.Speech.custom; return { lines: c.lines.map((l) => l.map((v) => +v.toFixed(2))), title: c.title && c.title.map((v) => +v.toFixed(2)), on: window.__dbg.mods.Speech.enabled() }; });
console.log(JSON.stringify(r));
// play chapter 一 through the speech cue; the line should be highlighted and speech busy
const s = await page.evaluate(async () => {
  const N = window.__dbg; N.app.startTour(); N.jump(1, 6.3, true);
  N.step(0.3);
  const busy1 = N.mods.Speech.busy();
  await new Promise((res) => setTimeout(res, 1800));
  N.step(0.05);
  return { busy1, busyAfter: N.mods.Speech.busy(), line: N.state().line };
});
console.log(JSON.stringify(s));
await browser.close();
