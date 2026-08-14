// build-web.mjs — 极简 ESM 打包器：把 src/core 的 ESM 模块打包为单个 UMD（MockTrader 全局），
// 并与 web 层拼接为自包含 dist/index.html（双击即用，离线可用）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coreDir = join(root, 'src', 'core');
const webDir = join(root, 'src', 'web');
const distDir = join(root, 'dist');

const read = (p) => readFileSync(p, 'utf8');
const mods = {};

function resolveId(fromId, spec) {
  const parts = [];
  const fromDir = fromId.includes('/') ? fromId.slice(0, fromId.lastIndexOf('/')) : '';
  if (fromDir) parts.push(...fromDir.split('/'));
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else if (seg.endsWith('.js')) parts.push(seg.slice(0, -3));
    else parts.push(seg);
  }
  return parts.join('/');
}

function collect(id) {
  if (mods[id]) return;
  const src = read(join(coreDir, id + '.js'));
  const imports = [];
  const re = /^import\s+\{([^}]*)\}\s+from\s+'([^']+)';|^import\s+\*\s+as\s+(\w+)\s+from\s+'([^']+)';/gm;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] != null) {
      const names = m[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
        const p = s.split(/\s+as\s+/).map((x) => x.trim());
        return p.length === 2 ? { imported: p[0], local: p[1] } : { imported: p[0], local: p[0] };
      });
      imports.push({ type: 'named', names, resolvedId: resolveId(id, m[2]) });
    } else {
      imports.push({ type: 'ns', ns: m[3], resolvedId: resolveId(id, m[4]) });
    }
  }
  const exports = [];
  const ere = /^export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  while ((m = ere.exec(src))) exports.push(m[1]);
  const ere2 = /^export\s*\{([^}]*)\};/gm;
  while ((m = ere2.exec(src))) {
    for (const s of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
      const p = s.split(/\s+as\s+/).map((x) => x.trim());
      exports.push(p.length === 2 ? p[1] : p[0]);
    }
  }
  mods[id] = { src, imports, exports: [...new Set(exports)] };
  for (const im of imports) collect(im.resolvedId);
}
collect('index');

function transform(id) {
  const mod = mods[id];
  let src = mod.src;
  src = src.replace(/^import\s+[^;]*;/gm, '');
  src = src.replace(/^export\s*\{[^}]*\};?$/gm, '');
  src = src.replace(/^export\s+(?=(?:const|let|var|function|class)\b)/gm, '');
  const importLines = mod.imports.map((im) => {
    if (im.type === 'named') {
      const d = im.names.map((n) => (n.imported === n.local ? n.local : n.imported + ': ' + n.local)).join(', ');
      return '  const { ' + d + ' } = __req(' + JSON.stringify(im.resolvedId) + ');';
    }
    return '  const ' + im.ns + ' = __req(' + JSON.stringify(im.resolvedId) + ');';
  }).join('\n');
  const exportStmt = mod.exports.length ? '\n  Object.assign(__exports, { ' + mod.exports.join(', ') + ' });' : '';
  return '__def(' + JSON.stringify(id) + ', function(__req, __exports) {' +
    (importLines ? '\n' + importLines : '') + '\n' + src + exportStmt + '\n});';
}

const defs = Object.keys(mods).map(transform).join('\n');
const coreBundle = `(function (global) {
  'use strict';
  var __mods = {};
  function __def(id, fn) { __mods[id] = { fn: fn, exports: {}, done: false }; }
  function __req(id) {
    var m = __mods[id];
    if (!m.done) { m.done = true; m.fn(__req, m.exports); }
    return m.exports;
  }
${defs}
  var entry = __req('index');
  if (typeof module !== 'undefined' && module.exports) { module.exports = entry; }
  global.MockTrader = entry;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;

mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, 'mocktrader.js'), coreBundle);

const styles = read(join(webDir, 'styles.css'));
const chartJs = read(join(webDir, 'chart.js'));
const appJs = read(join(webDir, 'app.js'));
const workerJs = read(join(webDir, 'worker.js'));
const template = read(join(webDir, 'template.html'));

const workerSource = coreBundle + '\n' + workerJs;
const appWithWorker = appJs.replace('__WORKER_SOURCE__', JSON.stringify(workerSource));

const html = template
  .replace('__STYLES__', styles)
  .replace('__CORE__', coreBundle)
  .replace('__CHART__', chartJs)
  .replace('__APP__', appWithWorker);

writeFileSync(join(distDir, 'index.html'), html);
console.log('modules bundled:', Object.keys(mods).length);
console.log('dist/mocktrader.js  ', coreBundle.length, 'bytes');
console.log('dist/index.html     ', html.length, 'bytes');
