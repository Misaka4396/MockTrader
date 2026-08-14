// factor_report.mjs — Phase 2：alphalens 式因子研究报告
import {
  DataAccess,
  FactorEngine,
  quantileReturns,
  icDecay,
  topTurnover,
  factorCorrelation,
  orthogonalize,
  FACTOR_KEYS,
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
const factors = FACTOR_KEYS.slice();

console.log('=== 1) 分层收益（5 组，未来 5 日收益均值）===');
console.log('因子         Q1(空)      Q2         Q3         Q4         Q5(多)      多空价差');
for (const f of factors) {
  const qr = quantileReturns(panel, ds, f, 5, 5);
  const cells = qr.quantiles
    .map((v) => `${(v >= 0 ? ' ' : '') + (v * 100).toFixed(2)}%`)
    .join('  ');
  const sp = `${(qr.spread >= 0 ? ' +' : ' ') + (qr.spread * 100).toFixed(2)}%`;
  console.log(f.padEnd(12) + cells + sp);
}

console.log('');
console.log('=== 2) IC 衰减（1/2/3/5/10/20 日，截面 Spearman 均值）===');
console.log(`因子         ${[1, 2, 3, 5, 10, 20].map((h) => ` ${h}d  `).join('')}`);
for (const f of factors) {
  const dec = icDecay(panel, ds, f);
  console.log(
    f.padEnd(12) + dec.map((d) => `${(d.ic >= 0 ? ' ' : '') + (d.ic * 100).toFixed(1)}%`).join('  ')
  );
}

console.log('');
console.log('=== 3) Top5 平均换手率（每日前 5 名名字变化比例）===');
for (const f of factors) {
  console.log(`${f.padEnd(12) + (topTurnover(panel, f, 5) * 100).toFixed(1)}%`);
}

console.log('');
console.log('=== 4) 因子相关性矩阵（截面 Pearson 时序均值）===');
const corr = factorCorrelation(panel, factors);
console.log(`             ${factors.map((f) => f.slice(0, 6).padStart(7)).join('')}`);
for (const a of factors) {
  console.log(a.padEnd(12) + factors.map((b) => corr[a][b].toFixed(2).padStart(7)).join(''));
}

console.log('');
console.log('=== 5) 正交化后相关性矩阵（应接近对角）===');
const orth = orthogonalize(panel, factors);
const orthPanel = {
  dates: panel.dates,
  varieties: panel.varieties,
  raw: panel.raw,
  z: orth,
  aux: panel.aux,
  params: panel.params,
  signs: panel.signs,
};
const orthCorr = factorCorrelation(orthPanel, factors);
console.log(`             ${factors.map((f) => f.slice(0, 6).padStart(7)).join('')}`);
for (const a of factors) {
  console.log(a.padEnd(12) + factors.map((b) => orthCorr[a][b].toFixed(2).padStart(7)).join(''));
}
