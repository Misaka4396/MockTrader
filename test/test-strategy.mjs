import { DataAccess } from '../src/core/data/dataAccess.js';
import { FactorEngine } from '../src/core/factors/factorEngine.js';
import { StrategyEngine } from '../src/core/strategy/strategyEngine.js';

const ds = new DataAccess().generate({ start: '2022-01-03', end: '2023-12-29', varieties: null });
const panel = new FactorEngine().compute(ds);

test('S3 long/short counts + neutral', () => {
  const strat = new StrategyEngine().generate(panel, ds, { longCount: 5, shortCount: 5, neutral: true, grossExposure: 1.0 });
  const d = strat.rebalanceDates[strat.rebalanceDates.length - 1];
  const w = strat.targets[d];
  const longs = Object.entries(w).filter(([, v]) => v > 0);
  const shorts = Object.entries(w).filter(([, v]) => v < 0);
  assert(longs.length === 5, '5 longs, got ' + longs.length);
  assert(shorts.length === 5, '5 shorts, got ' + shorts.length);
  const sumL = longs.reduce((a, [, v]) => a + v, 0);
  const sumS = shorts.reduce((a, [, v]) => a + v, 0);
  assertClose(sumL, 0.5, 1e-9, 'long side gross');
  assertClose(sumS, -0.5, 1e-9, 'short side gross');
  assertClose(sumL + sumS, 0, 1e-9, 'neutral');
});

test('S3 single-factor vs multi-factor configurable', () => {
  const single = new StrategyEngine().generate(panel, ds, { factors: ['rollYield'], longCount: 3, shortCount: 3 });
  const d = single.rebalanceDates[10];
  const w = single.targets[d];
  assert(Object.values(w).filter((v) => v > 0).length === 3, 'single-factor 3 longs');
  assert(Object.values(w).filter((v) => v < 0).length === 3, 'single-factor 3 shorts');
});

test('S3 score weighting normalized to side gross', () => {
  const strat = new StrategyEngine().generate(panel, ds, { longCount: 4, shortCount: 4, weighting: 'score', grossExposure: 1.0 });
  const d = strat.rebalanceDates[5];
  const w = strat.targets[d];
  const sumL = Object.values(w).filter((v) => v > 0).reduce((a, b) => a + b, 0);
  assertClose(sumL, 0.5, 1e-9, 'score-weighted long gross');
});
