// test-research.mjs — Phase 2：因子研究 / 风控 / 组合优化 测试
import {
  DataAccess,
  FactorEngine,
  quantileReturns,
  icDecay,
  topTurnover,
  factorCorrelation,
  orthogonalize,
  historicalVaR,
  expectedShortfall,
  maxDrawdown,
  stressTest,
  inverseVolWeights,
  capSectorExposure,
  PaperLedger,
  StrategyEngine,
  BacktestEngine,
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

test('factorAnalysis: 分层收益返回 5 组 + 价差', () => {
  const qr = quantileReturns(panel, ds, 'rollYield', 5, 5);
  assert(qr.quantiles.length === 5, '5 组');
  assertClose(qr.spread, qr.quantiles[4] - qr.quantiles[0], 1e-12, '价差');
});

test('factorAnalysis: IC 衰减返回多 horizon', () => {
  const dec = icDecay(panel, ds, 'rollYield');
  assert(dec.length === 6, '6 个 horizon');
  assert(
    dec.every((d) => Number.isFinite(d.ic)),
    'IC 有限'
  );
});

test('factorAnalysis: 换手率在 [0,1]', () => {
  const to = topTurnover(panel, 'momentum', 5);
  assert(to >= 0 && to <= 1, '换手率范围');
});

test('factorAnalysis: 相关性矩阵对角为 1', () => {
  const corr = factorCorrelation(panel, FACTOR_KEYS);
  for (const f of FACTOR_KEYS) {
    assertClose(corr[f][f], 1, 1e-9, `${f} 对角`);
  }
});

test('factorAnalysis: 正交化后非对角接近 0', () => {
  const orth = orthogonalize(panel, FACTOR_KEYS);
  const orthPanel = {
    dates: panel.dates,
    varieties: panel.varieties,
    raw: panel.raw,
    z: orth,
    aux: panel.aux,
    params: panel.params,
    signs: panel.signs,
  };
  const corr = factorCorrelation(orthPanel, FACTOR_KEYS);
  let maxOff = 0;
  for (let i = 0; i < FACTOR_KEYS.length; i++) {
    for (let j = 0; j < FACTOR_KEYS.length; j++) {
      if (i !== j) {
        maxOff = Math.max(maxOff, Math.abs(corr[FACTOR_KEYS[i]][FACTOR_KEYS[j]]));
      }
    }
  }
  assertLt(maxOff, 0.1, `非对角 |corr| < 0.1，实际 ${maxOff.toFixed(3)}`);
});

test('risk: VaR/CVaR/回撤为正，压力测试不改善回撤', () => {
  const strat = new StrategyEngine().generate(panel, ds, {});
  const bt = new BacktestEngine().run(ds, strat, {});
  const nav = bt.equity.map((e) => e / bt.summary.initialCapital);
  assertGt(historicalVaR(nav, 0.95), 0, 'VaR > 0');
  assertGt(expectedShortfall(nav, 0.95), 0, 'CVaR > 0');
  assertGt(maxDrawdown(nav), 0, '回撤 > 0');
  const st = stressTest(nav, -0.1);
  assert(st.maxDrawdownAfter >= st.maxDrawdownBefore, '压力后回撤 >= 原回撤');
});

test('portfolio: 逆波动率权重和为 1，板块上限生效', () => {
  const rets = {};
  for (const code of codes) {
    const s = ds.getSeries(code);
    const r = [];
    for (let t = 1; t < s.dates.length; t++) {
      if (s.mainAdj[t] != null && s.mainAdj[t - 1] != null && s.mainAdj[t - 1] > 0) {
        r.push(s.mainAdj[t] / s.mainAdj[t - 1] - 1);
      }
    }
    rets[code] = r;
  }
  const w = inverseVolWeights(rets, codes);
  const sum = codes.reduce((a, c) => a + w[c], 0);
  assertClose(sum, 1, 1e-9, '权重和 1');
  const capped = capSectorExposure(w, codes, (c) => ds.getMeta(c).sector, 0.15);
  const sectorSum = {};
  for (const c of codes) {
    const sec = ds.getMeta(c).sector;
    sectorSum[sec] = (sectorSum[sec] || 0) + capped[c];
  }
  for (const sec of Object.keys(sectorSum)) {
    assert(sectorSum[sec] <= 0.15 + 1e-9, `${sec} 板块上限，实际 ${sectorSum[sec].toFixed(3)}`);
  }
});

test('paperLedger: 记录/结算/统计', () => {
  const ledger = new PaperLedger();
  ledger.add({ ts: 'd0', code: 'RB', direction: 1, score: 0.5, entryPrice: 100 });
  ledger.add({ ts: 'd0', code: 'AU', direction: -1, score: -0.5, entryPrice: 100 });
  ledger.settle(ledger.records[0], 110); // 涨，多头命中
  ledger.settle(ledger.records[1], 90); // 跌，空头命中
  const st = ledger.stats();
  assertClose(st.hitRate, 1, 1e-9, '全部命中');
  assertClose(st.avgRet, 0.1, 1e-9, '平均收益 10%');
  assertClose(st.longHitRate, 1, 1e-9, '多头命中率 1');
});

test('backtest: 回撤熔断生效', () => {
  const strat = new StrategyEngine().generate(panel, ds, {});
  const bt = new BacktestEngine().run(ds, strat, { drawdownCutoff: 0.01 });
  assert(bt.summary.circuitBroken === true, '熔断触发');
});
