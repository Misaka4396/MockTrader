// smoke.mjs — 验证打包产物：1) UMD core 与源码结果一致；2) worker 可运行；3) HTML 自包含。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runPipeline as srcPipeline } from '../src/core/index.js';
import '../dist/mocktrader.js';

const MT = globalThis.MockTrader;
if (!MT) { console.error('FAIL: MockTrader global not set'); process.exit(1); }

const keys = ['DataAccess', 'FactorEngine', 'StrategyEngine', 'BacktestEngine', 'PerformanceEngine',
  'METADATA', 'SECTORS', 'FACTOR_KEYS', 'FACTOR_NAMES', 'runPipeline', 'continuousSeries', 'skewness', 'BY_SECTOR'];
const missing = keys.filter((k) => !(k in MT));
if (missing.length) { console.error('FAIL missing exports:', missing.join(', ')); process.exit(1); }

const opts = {
  varieties: ['RB', 'CU', 'M', 'AU', 'I', 'AL', 'FG', 'SC'],
  start: '2022-01-03', end: '2023-12-29',
  strategyConfig: { longCount: 3, shortCount: 3 },
};
const a = MT.runPipeline(opts);
const b = srcPipeline(opts);
const ma = a.performance.metrics;
const mb = b.performance.metrics;
const ok = Math.abs(ma.annualizedReturn - mb.annualizedReturn) < 1e-12
  && Math.abs(ma.maxDrawdown - mb.maxDrawdown) < 1e-12
  && a.performance.dates.length === b.performance.dates.length
  && a.backtest.trades.length === b.backtest.trades.length
  && a.backtest.trades.length > 0;

console.log('bundle exports OK (' + keys.length + ' keys)');
console.log('bundle matches source:', ok);
console.log('  annualized:', ma.annualizedReturn.toFixed(8), 'vs', mb.annualizedReturn.toFixed(8));
console.log('  maxDD:     ', ma.maxDrawdown.toFixed(8), 'vs', mb.maxDrawdown.toFixed(8));
console.log('  trades:    ', a.backtest.trades.length, 'vs', b.backtest.trades.length);

// worker 模拟验证（Node 环境下以伪 self 运行 worker.js）
const workerJs = readFileSync(new URL('../src/web/worker.js', import.meta.url), 'utf8');
const fakeSelf = { MockTrader: MT, postMessage: () => {} };
new Function('self', workerJs)(fakeSelf);
const workerResult = await new Promise((resolve) => {
  fakeSelf.postMessage = (msg) => { if (msg.type === 'result' || msg.type === 'error') resolve(msg); };
  fakeSelf.onmessage({ data: { config: opts } });
});
if (workerResult.type !== 'result') { console.error('FAIL worker:', workerResult.message); process.exit(1); }
console.log('worker OK: trades', workerResult.result.summary.nTrades,
  'annualized', workerResult.result.performance.metrics.annualizedReturn.toFixed(6));

// HTML 自包含检查
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
for (const marker of ['id="chart"', 'id="runBtn"', 'id="verdict"', 'LineChart', 'MockTrader']) {
  if (!html.includes(marker)) { console.error('FAIL html missing marker:', marker); process.exit(1); }
}
if (html.includes('__WORKER_SOURCE__') || html.includes('__CORE__') || html.includes('__APP__')) {
  console.error('FAIL html has unreplaced placeholder'); process.exit(1);
}
console.log('html self-contained OK (' + html.length + ' bytes)');
process.exit(ok ? 0 : 1);
