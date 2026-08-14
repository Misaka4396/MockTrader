// predict.mjs — 方案 A 趋势预测入口（被 py/scheduler.py 每 30 分钟调用）。
// 读 data/market/quotes.json（真实行情）+ data/news/items.json（已打标新闻）
//   -> 日线 5 因子 + 新闻情绪因子 -> TrendPredictor 输出多空信号 -> data/signals/latest.json
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DataAccess,
  FactorEngine,
  StrategyEngine,
  NewsSentimentEngine,
  TrendPredictor,
  crossSectionalZ,
} from '../src/core/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function loadJson(p) {
  if (!existsSync(p)) {
    return null;
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

const quotes = loadJson(join(root, 'data', 'market', 'quotes.json'));
if (!quotes || !quotes.dataset || !Object.keys(quotes.dataset).length) {
  console.error('[predict] 无行情数据：请先运行 py/collect_quotes.py');
  process.exit(1);
}

// 1) 日线因子（慢信号）
const ds = new DataAccess().loadMarketData({ dates: quotes.dates, dataset: quotes.dataset });
const codes = ds.codes;
const panel = new FactorEngine().compute(ds);
const strat = new StrategyEngine().generate(panel, ds, {});
const lastDate = ds.dates[ds.dates.length - 1];
const lastIdx = ds.dates.indexOf(lastDate);
const composite = {};
for (const code of codes) {
  composite[code] = strat.composite[code][lastIdx] != null ? strat.composite[code][lastIdx] : 0;
}
const vals = Object.values(composite);
const m = vals.reduce((a, b) => a + b, 0) / vals.length;
const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length) || 1;
const dailyZ = {};
for (const code of codes) {
  dailyZ[code] = (composite[code] - m) / sd;
}

// 2) 新闻情绪因子（快信号，30 分钟级）
const news = loadJson(join(root, 'data', 'news', 'items.json')) || [];
const nowIso = new Date().toISOString();
const newsRaw = new NewsSentimentEngine().compute(news, codes, [nowIso], { lookbackHours: 4 });
const newsZ = crossSectionalZ([nowIso], codes, newsRaw, 2.5);
const newsZNow = {};
for (const code of codes) {
  newsZNow[code] = newsZ[code][0] != null ? newsZ[code][0] : 0;
}

// 3) 趋势预测
const signals = new TrendPredictor().predict(dailyZ, newsZNow, {
  wDaily: 1,
  wNews: 0.6,
  threshold: 0.3,
});
const longs = signals.filter((s) => s.direction === 1).slice(0, 5);
const shorts = signals
  .filter((s) => s.direction === -1)
  .slice(-5)
  .reverse();

// 4) 输出（含新闻情绪 + 归档）
const outDir = join(root, 'data', 'signals');
mkdirSync(outDir, { recursive: true });
const newsRawNow = {};
for (const code of codes) {
  newsRawNow[code] = newsRaw[code][0] != null ? newsRaw[code][0] : 0;
}
const record = {
  ts: nowIso,
  lastDate,
  meta: { source: 'market+news', updatedAt: nowIso, nVarieties: codes.length, nNews: news.length },
  news: newsRawNow,
  newsZ: newsZNow,
  longs,
  shorts,
  top: signals.slice(0, 10),
};
writeFileSync(join(outDir, 'latest.json'), JSON.stringify(record, null, 2), 'utf8');
appendFileSync(join(outDir, 'history.jsonl'), `${JSON.stringify(record)}\n`, 'utf8');

console.log(`[predict] ${nowIso}  交易日=${lastDate}  新闻=${news.length} 条`);
console.log(`  做多: ${longs.map((s) => s.code).join(',')}`);
console.log(`  做空: ${shorts.map((s) => s.code).join(',')}`);
console.log('  已归档 -> data/signals/history.jsonl');
