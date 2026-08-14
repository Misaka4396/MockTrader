// paper_trading.mjs — Phase 3：前向纸面验证（信号命中率看板）
// 每天用「日线因子 + 新闻情绪」生成多空信号，记录入场，horizon 日后按实际价结算，统计命中率/收益。
import {
  DataAccess,
  FactorEngine,
  StrategyEngine,
  TrendPredictor,
  PaperLedger,
  crossSectionalZ,
  dailySentimentByDate,
  generateMockNews,
  FACTOR_KEYS,
} from '../src/core/index.js';
import { mean, std } from '../src/core/utils.js';

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
const ds = new DataAccess().generate({ start: '2022-01-03', end: '2024-12-31', varieties: codes });
const panel = new FactorEngine().compute(ds);
const strat = new StrategyEngine().generate(panel, ds, { factors: FACTOR_KEYS.slice() });

// 日线合成得分（截面 z）
function dailyZ(t) {
  const vals = {};
  const arr = [];
  for (const code of codes) {
    const v = strat.composite[code][t] != null ? strat.composite[code][t] : 0;
    vals[code] = v;
    arr.push(v);
  }
  const m = mean(arr);
  const s = std(arr, 0) || 1;
  const out = {};
  for (const code of codes) {
    out[code] = (vals[code] - m) / s;
  }
  return out;
}

// 新闻情绪（日频）
const items = generateMockNews(codes, { seed: 'paper-news', nIntervals: 8 });
const newsRaw = dailySentimentByDate(items, codes, ds.dates, { lookbackHours: 24 });
const newsZ = crossSectionalZ(ds.dates, codes, newsRaw, 2.5);

// 前向记账
const horizon = 5;
const tp = new TrendPredictor();
const ledger = new PaperLedger();
for (let t = 120; t + horizon < ds.dates.length; t++) {
  const dz = dailyZ(t);
  const nz = {};
  for (const code of codes) {
    nz[code] = newsZ[code][t] != null ? newsZ[code][t] : 0;
  }
  const signals = tp.predict(dz, nz, { wDaily: 1, wNews: 0.5, threshold: 0.3 });
  const longs = signals.filter((s) => s.direction === 1).slice(0, 3);
  const shorts = signals
    .filter((s) => s.direction === -1)
    .slice(-3)
    .reverse();
  for (const s of longs) {
    const p = ds.getSeries(s.code).mainAdj[t];
    if (p != null) {
      ledger.add({ ts: ds.dates[t], code: s.code, direction: 1, score: s.score, entryPrice: p });
    }
  }
  for (const s of shorts) {
    const p = ds.getSeries(s.code).mainAdj[t];
    if (p != null) {
      ledger.add({ ts: ds.dates[t], code: s.code, direction: -1, score: s.score, entryPrice: p });
    }
  }
}

// 结算
for (const r of ledger.records) {
  const t = ds.dates.indexOf(r.ts);
  const sp = ds.getSeries(r.code).mainAdj[t + horizon];
  if (sp != null && r.entryPrice > 0) {
    ledger.settle(r, sp);
  }
}

const st = ledger.stats();
console.log(`=== 前向纸面验证（horizon=${horizon} 日）===`);
console.log(`预测数: ${st.n}（多 ${st.nLong} / 空 ${st.nShort}）`);
console.log(
  `命中率: ${(st.hitRate * 100).toFixed(1)}%（多 ${(st.longHitRate * 100).toFixed(1)}% / 空 ${(st.shortHitRate * 100).toFixed(1)}%）`
);
console.log(
  `平均单笔收益: ${(st.avgRet * 100).toFixed(3)}%   累计: ${(st.cumRet * 100).toFixed(2)}%`
);
console.log('');
console.log('=== 按品种命中率（降序）===');
const byCode = ledger.byCode();
for (const [code, v] of Object.entries(byCode).sort((a, b) => b[1].hitRate - a[1].hitRate)) {
  console.log(
    `  ${code.padEnd(4)} n=${v.n}  命中 ${(v.hitRate * 100).toFixed(0)}%  平均 ${(v.avgRet * 100).toFixed(2)}%`
  );
}
console.log('');
console.log(
  '说明：命中率是「方向正确」占比；生产环境把上面的信号换成 predict.mjs 实时输出、按日归档即可前向累计。'
);
