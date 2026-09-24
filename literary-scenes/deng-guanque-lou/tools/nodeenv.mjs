// Load selected app modules in Node (no DOM) for numeric checks.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export async function loadModules(files, exportsList, threePath) {
  const THREE = await import(pathToFileURL(threePath).href);
  const code = files.map((f) => fs.readFileSync(path.join(root, 'src/js', f), 'utf8')).join('\n') + `\nreturn {${exportsList.join(',')}};`;
  const fn = new Function("THREE", "requestAnimationFrame", "document", "window", code);
  return fn(THREE, (cb) => setImmediate(cb), undefined, { __lodHist: true });
}
