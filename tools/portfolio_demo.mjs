// portfolio_demo.mjs — Phase 2：组合加权对比（等权 vs 逆波动率 vs 板块上限）
import {
  DataAccess,
  FactorEngine,
  StrategyEngine,
  inverseVolWeights,
  capSectorExposure,
} from '../src/core/index.js';

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
const strat = new StrategyEngine().generate(panel, ds, { longCount: 5, shortCount: 5 });
const lastDate = strat.rebalanceDates[strat.rebalanceDates.length - 1];
const targets = strat.targets[lastDate] || {};
const longs = Object.keys(targets).filter((c) => targets[c] > 0);

// 各品种日收益（用于逆波动率）
const rets = {};
for (const code of longs) {
  const s = ds.getSeries(code);
  const r = [];
  for (let t = 1; t < s.dates.length; t++) {
    if (s.mainAdj[t] != null && s.mainAdj[t - 1] != null && s.mainAdj[t - 1] > 0) {
      r.push(s.mainAdj[t] / s.mainAdj[t - 1] - 1);
    }
  }
  rets[code] = r;
}

const equal = {};
for (const c of longs) {
  equal[c] = 1 / longs.length;
}
const invVol = inverseVolWeights(rets, longs);
const capped = capSectorExposure(invVol, longs, (c) => ds.getMeta(c).sector, 0.3);

function fmt(w) {
  return longs.map((c) => `${c}:${(w[c] * 100).toFixed(1)}%`).join('  ');
}
console.log(`多头品种: ${longs.join(',')}`);
console.log('');
console.log(`等权      : ${fmt(equal)}`);
console.log(`逆波动率  : ${fmt(invVol)}`);
console.log(`板块上限30%: ${fmt(capped)}`);
console.log('');
console.log(
  '注：逆波动率给低波动品种更高权重；板块上限限制单一板块暴露（如黑色 4 个品种合计不超过 30%）。'
);
