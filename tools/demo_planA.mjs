// demo_planA.mjs — 方案 A 端到端演示：日线因子 + 30min 新闻情绪 -> 趋势预测
import {
  DataAccess,
  FactorEngine,
  StrategyEngine,
  NewsSentimentEngine,
  TrendPredictor,
  crossSectionalZ,
} from '../src/core/index.js';
import { rngFromString } from '../src/core/utils.js';

const codes = [
  'RB',
  'HC',
  'I',
  'J',
  'CU',
  'AL',
  'ZN',
  'AU',
  'AG',
  'M',
  'C',
  'CF',
  'SR',
  'SC',
  'MA',
  'TA',
];

// 1) 日线因子（慢信号）
const ds = new DataAccess().generate({ start: '2022-01-03', end: '2024-12-31', varieties: codes });
const panel = new FactorEngine().compute(ds);
const strat = new StrategyEngine().generate(panel, ds, {
  factors: ['momentum', 'liquidity', 'volume', 'skewness', 'rollYield'],
});
const lastDate = ds.dates[ds.dates.length - 1];
const lastIdx = ds.dates.indexOf(lastDate);
const composite = {};
for (const code of codes) {
  composite[code] = strat.composite[code][lastIdx] != null ? strat.composite[code][lastIdx] : 0;
}
// 截面 z
const vals = Object.values(composite);
const m = vals.reduce((a, b) => a + b, 0) / vals.length;
const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length) || 1;
const dailyZ = {};
for (const code of codes) {
  dailyZ[code] = (composite[code] - m) / sd;
}

// 2) 模拟新闻（一天内 30 分钟间隔）
const day = '2026-08-14';
const times = [];
for (let h = 9; h <= 11; h++) {
  times.push(
    `${day}T${String(h).padStart(2, '0')}:00:00+08:00`,
    `${day}T${String(h).padStart(2, '0')}:30:00+08:00`
  );
}
times.push(
  `${day}T13:00:00+08:00`,
  `${day}T13:30:00+08:00`,
  `${day}T14:00:00+08:00`,
  `${day}T14:30:00+08:00`,
  `${day}T15:00:00+08:00`
);

const lean = {
  RB: 0.6,
  HC: 0.5,
  I: 0.5,
  J: 0.4,
  CU: 0.5,
  AL: 0.4,
  ZN: 0.3,
  AU: -0.5,
  AG: -0.4,
  M: -0.5,
  C: -0.4,
  CF: -0.3,
  SR: -0.4,
  SC: 0.4,
  MA: 0.3,
  TA: -0.2,
};
const rng = rngFromString('planA-demo-news');
const items = [];
for (const t of times) {
  const ts = Date.parse(t);
  for (const code of codes) {
    if (rng() < 0.6) {
      continue;
    }
    const base = lean[code] || 0;
    const s = Math.max(-1, Math.min(1, base + (rng() - 0.5) * 0.8));
    const label = s > 0.2 ? 'bullish' : s < -0.2 ? 'bearish' : 'neutral';
    items.push({ ts, source: 'mock', title: `${code} 快讯`, tags: [code], sentiment: s, label });
  }
}

// 3) 新闻情绪因子 -> 截面 z
const newsRaw = new NewsSentimentEngine().compute(items, codes, times, { lookbackHours: 4 });
const newsZ = crossSectionalZ(times, codes, newsRaw, 2.5);

// 4) 趋势预测（最后时刻）
const nowIdx = times.length - 1;
const newsZNow = {};
for (const code of codes) {
  newsZNow[code] = newsZ[code][nowIdx];
}
const signals = new TrendPredictor().predict(dailyZ, newsZNow, {
  wDaily: 1,
  wNews: 0.6,
  threshold: 0.3,
});

console.log(`=== 方案 A 端到端演示：趋势预测 @ ${times[nowIdx]} ===`);
console.log('做多候选（按趋势得分降序）:');
for (const s of signals.filter((x) => x.direction === 1).slice(0, 5)) {
  console.log(
    `  ${s.code.padEnd(4)} 总分=${s.score.toFixed(2)}  日线=${s.daily.toFixed(2)}  新闻=${s.news.toFixed(2)}`
  );
}
console.log('做空候选（按趋势得分升序）:');
for (const s of signals
  .filter((x) => x.direction === -1)
  .slice(-5)
  .reverse()) {
  console.log(
    `  ${s.code.padEnd(4)} 总分=${s.score.toFixed(2)}  日线=${s.daily.toFixed(2)}  新闻=${s.news.toFixed(2)}`
  );
}
console.log(
  `新闻条数: ${items.length}  覆盖品种: ${new Set(items.map((i) => i.tags[0])).size}  时间点: ${times.length}`
);
