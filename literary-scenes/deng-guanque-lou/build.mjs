// Build: inline CSS, three.js (as a global) and the app scripts into one HTML.
//   node build.mjs            -> dist/deng-guanque-lou.html (standalone document)
//                                dist/artifact.html          (body-only variant for hosted preview)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Order matters: later modules use earlier ones.
const APP_FILES = [
  '00-config.js',
  '01-util.js',
  '02-shaderlib.js',
  '10-terrain.js',
  '11-sky.js',
  '12-water.js',
  '13-tower.js',
  '14-flora.js',
  '15-settlement.js',
  '16-fauna.js',
  '17-figures.js',
  '18-vision.js',
  '19-env.js',
  '20-post.js',
  '29-world.js',
  '30-staging.js',
  '31-director.js',
  '32-narrative.js',
  '40-sound.js',
  '41-speech.js',
  '50-ui.js',
  '90-main.js',
].filter((f) => fs.existsSync(path.join(root, 'src/js', f)));

function threeAsGlobal(src) {
  const m = src.match(/export\s*\{([^}]*)\}\s*;?\s*$/);
  if (!m) throw new Error('three.js export clause not found');
  const pairs = m[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const parts = s.split(/\s+as\s+/);
    return parts.length === 2 ? `${parts[1]}:${parts[0]}` : `${parts[0]}:${parts[0]}`;
  });
  const body = src.slice(0, m.index);
  return `/* three.js r169 — MIT License, Copyright 2010-2024 three.js authors — https://threejs.org */\n` +
    `var THREE=(function(){"use strict";\n${body}\nreturn Object.freeze({${pairs.join(',')}});})();`;
}

const three = threeAsGlobal(read('vendor/three-r169.module.min.js'));
const app = APP_FILES.map((f) => `/* ===== ${f} ===== */\n${read('src/js/' + f)}`).join('\n');
const css = read('src/style.css');
const bodyHtml = read('src/body.html');
const tpl = read('src/index.html');

for (const chunk of [three, app]) {
  if (/<\/script/i.test(chunk)) throw new Error('script contains </script');
}

const scripts = `<script>\n${three}\n</script>\n<script>\n(() => {\n'use strict';\n${app}\n})();\n</script>`;
const html = tpl
  .replace('/*STYLE*/', () => css)
  .replace('<!--BODY-->', () => bodyHtml)
  .replace('<!--SCRIPTS-->', () => scripts);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/deng-guanque-lou.html'), html);

// Hosted variant: the host supplies <html>/<head>/<body>; keep title, fonts, style, content, scripts.
const headInner = tpl.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '')
  .replace('/*STYLE*/', () => css);
const artifact = `${headInner.trim()}\n${bodyHtml}\n${scripts}\n`;
fs.writeFileSync(path.join(root, 'dist/artifact.html'), artifact);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' KB';
console.log(`built ${APP_FILES.length} modules → dist/deng-guanque-lou.html (${kb(html)}), dist/artifact.html (${kb(artifact)})`);
