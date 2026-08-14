// walkforward.mjs — Phase 1 P0：研究可信度
// 1) 样本外分割（前 70% 训练 / 后 30% 测试）
// 2) 参数稳健性热力图（多空数量 × 权重方案 的 IS/OOS Sharpe 网格）
// 3) Walk-forward（滚动窗口，IS 选最优参数 → OOS 冻结验证）
import {
  DataAccess,
  FactorEngine,
  StrategyEngine,
  BacktestEngine,
  PerformanceEngine,
  FACTOR_KEYS,
} from '../src/core/index.js';
import { mean } from '../src/core/utils.js';

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
const full = new DataAccess().generate({
  start: '2022-01-03',
  end: '2024-12-31',
  varieties: codes,
});
const allDates = full.dates;
const fp = full.dataFingerprint();

function sliceDataAccess(ds, startIso, endIso) {
  const dates = ds.dates.filter((d) => d >= startIso && d <= endIso);
  const dataset = {};
  for (const code of ds.codes) {
    const contracts = {};
    for (const [c, bars] of Object.entries(ds.dataset[code].contracts)) {
      const filtered = bars.filter((b) => b.date >= startIso && b.date <= endIso);
      if (filtered.length) {
        contracts[c] = filtered;
      }
    }
    if (Object.keys(contracts).length) {
      dataset[code] = { contracts };
    }
  }
  return new DataAccess().loadMarketData({ dates, dataset });
}

function runOn(ds, params) {
  const panel = new FactorEngine().compute(ds);
  const strat = new StrategyEngine().generate(panel, ds, {
    factors: FACTOR_KEYS.slice(),
    longCount: params.long,
    shortCount: params.short,
    weighting: params.weighting,
  });
  const bt = new BacktestEngine().run(ds, strat, {});
  return new PerformanceEngine().compute(bt.equity, bt.dates, { benchmarkAnnual: 0 });
}

console.log('=== 数据版本 ===');
console.log(
  `指纹: ${fp}  区间 ${allDates[0]} ~ ${allDates[allDates.length - 1]}  品种 ${codes.length}`
);
console.log('');

// ---- 1) 样本外分割（70/30）----
const splitIdx = Math.floor(allDates.length * 0.7);
const trainEnd = allDates[splitIdx - 1];
const testDs = sliceDataAccess(full, allDates[0], allDates[allDates.length - 1]); // 测试集含训练期预热
const trainDs = sliceDataAccess(full, allDates[0], trainEnd);

const isRun = runOn(trainDs, { long: 5, short: 5, weighting: 'equal' });
const oosRun = runOn(testDs, { long: 5, short: 5, weighting: 'equal' });
const oosPerf = new PerformanceEngine().compute(
  oosRun.nav.slice(splitIdx),
  allDates.slice(splitIdx),
  { benchmarkAnnual: 0 }
);

console.log(
  `=== 1) 样本外分割（训练 ${allDates[0]}~${trainEnd} / 测试 ${allDates[splitIdx]}~${allDates[allDates.length - 1]}）===`
);
console.log(
  `  训练 IS : 年化 ${(isRun.metrics.annualizedReturn * 100).toFixed(2)}%   Sharpe ${isRun.metrics.sharpe.toFixed(2)}   回撤 ${(isRun.metrics.maxDrawdown * 100).toFixed(1)}%`
);
console.log(
  `  测试 OOS: 年化 ${(oosPerf.metrics.annualizedReturn * 100).toFixed(2)}%   Sharpe ${oosPerf.metrics.sharpe.toFixed(2)}   回撤 ${(oosPerf.metrics.maxDrawdown * 100).toFixed(1)}%`
);
const decay = isRun.metrics.sharpe - oosPerf.metrics.sharpe;
console.log(
  `  IS-OOS Sharpe 衰减: ${decay.toFixed(2)}${decay > 1 ? '（可能过拟合）' : decay > 0.3 ? '（正常衰减）' : '（OOS 反超，稳健）'}`
);
console.log('');

// ---- 2) 参数稳健性热力图 ----
console.log('=== 2) 参数稳健性（IS / OOS Sharpe 网格）===');
const grid = [];
for (const l of [3, 5, 7]) {
  for (const w of ['equal', 'score']) {
    grid.push({ long: l, short: l, weighting: w });
  }
}
console.log('  参数            IS Sharpe   OOS Sharpe');
for (const p of grid) {
  const is = runOn(trainDs, p);
  const oos = runOn(testDs, p);
  const oosP = new PerformanceEngine().compute(oos.nav.slice(splitIdx), allDates.slice(splitIdx), {
    benchmarkAnnual: 0,
  });
  console.log(
    `  多${p.long}/空${p.short} ${p.weighting.padEnd(6)}  ${is.metrics.sharpe.toFixed(2)}        ${oosP.metrics.sharpe.toFixed(2)}`
  );
}
console.log('');

// ---- 3) Walk-forward（滚动，IS 选参 → OOS 冻结）----
console.log('=== 3) Walk-forward（训练 252 日 / 测试 126 日，步长 126 日，IS 选参 → OOS 冻结）===');
const trainLen = 252;
const testLen = 126;
const step = 126;
const wfRows = [];
for (let testStartIdx = 120; testStartIdx + testLen <= allDates.length; testStartIdx += step) {
  const testEndIdx = testStartIdx + testLen - 1;
  const trainEndIdx = testStartIdx - 1;
  const trainStartIdx = Math.max(0, trainEndIdx - trainLen + 1);
  const wfTrain = sliceDataAccess(full, allDates[trainStartIdx], allDates[trainEndIdx]);
  const wfTest = sliceDataAccess(full, allDates[0], allDates[testEndIdx]);
  // IS 选参
  let best = grid[0];
  let bestSharpe = -Infinity;
  for (const p of grid) {
    const r = runOn(wfTrain, p);
    if (r.metrics.sharpe > bestSharpe) {
      bestSharpe = r.metrics.sharpe;
      best = p;
    }
  }
  const oos = runOn(wfTest, best);
  const oosP = new PerformanceEngine().compute(
    oos.nav.slice(testStartIdx),
    allDates.slice(testStartIdx),
    { benchmarkAnnual: 0 }
  );
  wfRows.push({
    from: allDates[testStartIdx],
    to: allDates[testEndIdx],
    best: `${best.long}/${best.weighting}`,
    oosSharpe: oosP.metrics.sharpe,
    oosAnn: oosP.metrics.annualizedReturn,
  });
}
console.log('  窗口                   IS选参     OOS Sharpe   OOS 年化');
for (const r of wfRows) {
  console.log(
    `  ${r.from}~${r.to}  ${r.best.padEnd(8)}  ${r.oosSharpe.toFixed(2)}         ${(r.oosAnn * 100).toFixed(1)}%`
  );
}
const posWins = wfRows.filter((r) => r.oosSharpe > 0).length;
console.log('');
console.log('=== 结论 ===');
console.log(
  `样本外分割：IS Sharpe ${isRun.metrics.sharpe.toFixed(2)} -> OOS Sharpe ${oosPerf.metrics.sharpe.toFixed(2)}（衰减 ${decay.toFixed(2)}）`
);
console.log(
  `Walk-forward：${posWins}/${wfRows.length} 个窗口 OOS Sharpe 为正，平均 OOS Sharpe ${mean(wfRows.map((r) => r.oosSharpe)).toFixed(2)}`
);
console.log(
  '（注：合成随机游走数据本身无稳定 alpha，OOS 可能为负属预期；本脚本验证的是「样本外/走步」度量框架，真实数据用同一框架跑即可。）'
);
