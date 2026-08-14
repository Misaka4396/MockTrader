// rolling_backtest.mjs — 新闻因子增量 alpha 验证，支持 合成/真实/对照 三种模式。
// 用法：node tools/rolling_backtest.mjs [synthetic|real|both]   （默认 synthetic）
//   synthetic：注入已知弱信号的合成新闻（校验度量框架本身）
//   real     ：读 data/news/items.json 的真实新闻（需历史归档与回测区间重叠）
//   both     ：两种都跑并对照
import {
  DataAccess,
  FactorEngine,
  StrategyEngine,
  BacktestEngine,
  PerformanceEngine,
  crossSectionalZ,
  spearman,
  FACTOR_KEYS,
  dailySentimentByDate,
} from '../src/core/index.js';
import { rngFromString, mean } from '../src/core/utils.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mode = process.argv[2] || 'synthetic';
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
const dates = ds.dates;
const panel = new FactorEngine().compute(ds);
const horizon = 5;

// 未来 5 日收益（IC 用）
const fwd5 = {};
for (const code of codes) {
  const s = ds.getSeries(code);
  fwd5[code] = new Array(dates.length).fill(null);
  for (let t = 0; t + horizon < dates.length; t++) {
    if (s.mainAdj[t] != null && s.mainAdj[t + horizon] != null && s.mainAdj[t] > 0) {
      fwd5[code][t] = s.mainAdj[t + horizon] / s.mainAdj[t] - 1;
    }
  }
}

function icOf(forward, zMap) {
  const ics = [];
  for (let t = 0; t < dates.length; t++) {
    const xs = [];
    const ys = [];
    for (const code of codes) {
      const z = zMap[code][t];
      const f = forward[code][t];
      if (z != null && f != null && Number.isFinite(z) && Number.isFinite(f)) {
        xs.push(z);
        ys.push(f);
      }
    }
    if (xs.length >= 8) {
      const r = spearman(xs, ys);
      if (Number.isFinite(r)) {
        ics.push(r);
      }
    }
  }
  return ics.length ? mean(ics) : 0;
}

function backtest(p, factors) {
  const strat = new StrategyEngine().generate(p, ds, { factors, longCount: 5, shortCount: 5 });
  const bt = new BacktestEngine().run(ds, strat, {});
  const perf = new PerformanceEngine().compute(bt.equity, bt.dates, { benchmarkAnnual: 0 });
  return { bt, perf };
}

function run(newsRaw, label) {
  const newsZ = crossSectionalZ(dates, codes, newsRaw, 2.5);
  const newsIc = icOf(fwd5, newsZ);
  const base = backtest(panel, FACTOR_KEYS.slice());
  const enhPanel = {
    dates: panel.dates,
    varieties: panel.varieties,
    raw: { ...panel.raw, news: newsRaw },
    z: { ...panel.z, news: newsZ },
    aux: panel.aux,
    params: panel.params,
    signs: panel.signs,
  };
  const enh = backtest(enhPanel, FACTOR_KEYS.concat(['news']));

  const winLen = 126;
  const step = 63;
  const rows = [];
  for (let i0 = 120; i0 + winLen < dates.length; i0 += step) {
    const i1 = i0 + winLen - 1;
    const bp = new PerformanceEngine().compute(
      base.bt.equity.slice(i0, i1 + 1),
      dates.slice(i0, i1 + 1),
      { benchmarkAnnual: 0 }
    );
    const ep = new PerformanceEngine().compute(
      enh.bt.equity.slice(i0, i1 + 1),
      dates.slice(i0, i1 + 1),
      { benchmarkAnnual: 0 }
    );
    rows.push({
      from: dates[i0],
      to: dates[i1],
      baseAnn: bp.metrics.annualizedReturn,
      enhAnn: ep.metrics.annualizedReturn,
      alpha: ep.metrics.annualizedReturn - bp.metrics.annualizedReturn,
    });
  }

  console.log('');
  console.log(`=== ${label} ===`);
  console.log(`新闻因子 IC（vs 未来5日收益）: ${(newsIc * 100).toFixed(2)}%`);
  console.log(
    `全样本: 基线(5因子) ${(base.perf.metrics.annualizedReturn * 100).toFixed(2)}%  ->  增强(5+新闻) ${(enh.perf.metrics.annualizedReturn * 100).toFixed(2)}%`
  );
  console.log(
    `  增量 alpha = ${((enh.perf.metrics.annualizedReturn - base.perf.metrics.annualizedReturn) * 100).toFixed(2)}pp`
  );
  const wins = rows.filter((r) => r.alpha > 0).length;
  console.log(
    `滚动窗口: ${wins}/${rows.length} 个跑赢，平均 alpha ${(mean(rows.map((r) => r.alpha)) * 100).toFixed(2)}pp`
  );
  return {
    newsIc,
    baseAnn: base.perf.metrics.annualizedReturn,
    enhAnn: enh.perf.metrics.annualizedReturn,
    rows,
  };
}

// 合成新闻（注入已知弱信号）
function syntheticNews() {
  const rng = rngFromString('rolling-news-inject');
  const signalCoef = 0.25;
  const out = {};
  for (const code of codes) {
    out[code] = new Array(dates.length).fill(null);
    for (let t = 0; t + horizon < dates.length; t++) {
      if (fwd5[code][t] != null) {
        out[code][t] = signalCoef * fwd5[code][t] + (rng() - 0.5) * 0.03;
      }
    }
  }
  return out;
}

// 真实新闻（data/news/items.json）
function realNews() {
  const p = join(root, 'data', 'news', 'items.json');
  if (!existsSync(p)) {
    console.log(
      '[real] 无真实新闻 data/news/items.json —— 先跑 py/collect_news.py + py/sentiment.py'
    );
    return null;
  }
  const items = JSON.parse(readFileSync(p, 'utf8'));
  // 检查新闻时间与回测区间是否重叠
  const lo = Date.parse(`${dates[0]}T00:00:00+08:00`);
  const hi = Date.parse(`${dates[dates.length - 1]}T23:59:59+08:00`);
  const overlap = items.filter((it) => Date.parse(it.ts) >= lo && Date.parse(it.ts) <= hi).length;
  if (overlap === 0) {
    console.log(
      `[real] 警告：真实新闻时间戳(${new Date(Date.parse(items[0].ts)).toISOString().slice(0, 10)}~) 与回测区间(${dates[0]}~${dates[dates.length - 1]}) 无重叠。`
    );
    console.log(
      '[real]       历史回测需要「历史新闻归档」；现在采集的新闻只能做前向纸面验证，不能回测。'
    );
  }
  return dailySentimentByDate(items, codes, dates, { lookbackHours: 24 });
}

const results = [];
if (mode === 'synthetic' || mode === 'both') {
  results.push({ label: '合成', r: run(syntheticNews(), '合成新闻（注入已知信号，校验框架）') });
}
if (mode === 'real' || mode === 'both') {
  const real = realNews();
  if (real) {
    results.push({ label: '真实', r: run(real, '真实新闻（data/news/items.json）') });
  }
}
if (mode === 'both' && results.length === 2) {
  console.log('');
  console.log('=== 对照结论 ===');
  console.log(
    `合成新闻 IC ${(results[0].r.newsIc * 100).toFixed(2)}%   vs   真实新闻 IC ${(results[1].r.newsIc * 100).toFixed(2)}%`
  );
  console.log(
    `合成 alpha ${((results[0].r.enhAnn - results[0].r.baseAnn) * 100).toFixed(2)}pp   vs   真实 alpha ${((results[1].r.enhAnn - results[1].r.baseAnn) * 100).toFixed(2)}pp`
  );
  console.log(
    '判读：合成应显著为正（证明框架能测出 alpha）；真实接近 0 则当前新闻无增量预测力，为正则有 alpha。'
  );
}
