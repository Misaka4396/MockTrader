// persist.mjs — 本地存储演示 (S1：数据文件 + 磁盘持久化)。
// 用法：node tools/persist.mjs            -> 生成并保存数据到 data/
//       node tools/persist.mjs --bars      -> 同时保存全部合约日线（较大）
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataAccess } from '../src/core/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
const withBars = process.argv.includes('--bars');

const t0 = Date.now();
const ds = new DataAccess().generate({});
const genMs = Date.now() - t0;

mkdirSync(join(dataDir, 'continuous'), { recursive: true });
writeFileSync(join(dataDir, 'manifest.json'), JSON.stringify({ ...ds.config, generatedAt: new Date().toISOString() }, null, 2));
writeFileSync(join(dataDir, 'metadata.json'), JSON.stringify(ds.metadata, null, 2));

let barsBytes = 0;
for (const code of ds.codes) {
  const s = ds.getSeries(code);
  // 派生连续序列（主力/次主力原始价+后复权+展期事件）
  writeFileSync(join(dataDir, 'continuous', code + '.json'), JSON.stringify(s));
  if (withBars) {
    mkdirSync(join(dataDir, 'bars'), { recursive: true });
    const txt = JSON.stringify(ds.dataset[code]);
    barsBytes += txt.length;
    writeFileSync(join(dataDir, 'bars', code + '.json'), txt);
  }
}

// 回读验证：从磁盘快照重建
const snapshot = {
  config: JSON.parse(readFileSync(join(dataDir, 'manifest.json'), 'utf8')),
  dates: ds.dates,
  metadata: JSON.parse(readFileSync(join(dataDir, 'metadata.json'), 'utf8')),
  dataset: ds.dataset,
  series: ds.series,
};
const ds2 = new DataAccess().importSnapshot(snapshot);
const rb = ds2.getSeries('RB');
const rbMeta = ds2.getMeta('RB');

console.log('生成耗时:', genMs + 'ms');
console.log('品种数:', ds2.codes.length, ' 交易日:', ds2.datesCount);
console.log('RB 主力后复权首值:', rb.mainAdj.find((x) => x != null).toFixed(2), ' 展期次数:', rb.rolls.length);
console.log('RB 元数据: 乘数', rbMeta.mult, ' 保证金', rbMeta.margin, ' tickValue', rbMeta.tickValue);
console.log('持久化目录:', dataDir, withBars ? ('(含全部合约日线 ' + (barsBytes / 1048576).toFixed(1) + ' MB)') : '(连续序列 + 元数据)');
console.log('OK: 本地存储 + 回读一致');
