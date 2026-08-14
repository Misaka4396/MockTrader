// news_history.mjs — 回看新闻情绪历史归档（data/signals/history.jsonl）
// 用法：node tools/news_history.mjs            -> 概览 + 最近情绪排名 + 多空轨迹
//       node tools/news_history.mjs RB         -> 只看某品种情绪轨迹
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const historyPath = join(root, 'data', 'signals', 'history.jsonl');
const codeArg = process.argv[2] || null;

if (!existsSync(historyPath)) {
  console.log('无历史归档：请先运行 node tools/predict.mjs（每次预测会追加 history.jsonl）');
  process.exit(0);
}
const records = readFileSync(historyPath, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const last = records[records.length - 1];

console.log(
  `归档 ${records.length} 条 | 时间 ${records[0].ts.slice(0, 19).replace('T', ' ')} ~ ${last.ts.slice(0, 19).replace('T', ' ')}`
);
console.log(
  `最近: ${last.ts} | 数据源 ${last.meta.source} | 新闻 ${last.meta.nNews} 条 | 品种 ${last.meta.nVarieties}`
);

// 最近一条的新闻情绪排名
const newsRank = Object.entries(last.news || {}).sort((a, b) => b[1] - a[1]);
console.log('');
console.log(
  `最近新闻情绪 Top5 看多: ${newsRank
    .slice(0, 5)
    .map(([c, v]) => `${c}(${v.toFixed(2)})`)
    .join(' ')}`
);
console.log(
  `最近新闻情绪 Top5 看空: ${newsRank
    .slice(-5)
    .reverse()
    .map(([c, v]) => `${c}(${v.toFixed(2)})`)
    .join(' ')}`
);

// 轨迹
const track = codeArg ? [codeArg] : [newsRank[0][0], newsRank[newsRank.length - 1][0]];
console.log('');
console.log('情绪轨迹（旧 -> 新，取最近 12 条）:');
const recent = records.slice(-12);
for (const c of track) {
  const trail = recent
    .map((r) => (r.news && r.news[c] != null ? r.news[c].toFixed(2) : '  --'))
    .join(' ');
  console.log(`  ${c.padEnd(4)} ${trail}`);
}
