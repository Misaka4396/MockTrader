import { PerformanceEngine } from '../src/core/performance/performanceEngine.js';

test('S5 metrics on known series (total return, maxDD)', () => {
  const eq = [100, 90, 100];
  const dates = ['2022-01-03', '2022-01-04', '2022-01-05'];
  const perf = new PerformanceEngine().compute(eq, dates);
  assertClose(perf.metrics.totalReturn, 0, 1e-9, 'total return');
  assertClose(perf.metrics.maxDrawdown, 0.1, 1e-9, 'maxDD 10%');
});

test('S5 benchmark verdict 跑赢 (high return)', () => {
  const n = 500;
  const eq = [100];
  for (let i = 1; i <= n; i++) eq.push(eq[i - 1] * 1.01);
  const dates = Array.from({ length: n + 1 }, () => '2022-01-01');
  const perf = new PerformanceEngine().compute(eq, dates, { benchmarkAnnual: 0.15, verdictThreshold: 0.02 });
  assert(perf.metrics.annualizedReturn > 10, 'annualized huge');
  assert(perf.comparison.verdict === '跑赢', 'verdict 跑赢');
  assertClose(perf.comparison.excess, perf.metrics.annualizedReturn - 0.15, 1e-9, 'excess');
});

test('S5 benchmark verdict 跑输 (losing)', () => {
  const eq = [100, 99, 98, 97];
  const dates = ['d1', 'd2', 'd3', 'd4'];
  const perf = new PerformanceEngine().compute(eq, dates, { benchmarkAnnual: 0.15, verdictThreshold: 0.02 });
  assert(perf.comparison.verdict === '跑输', 'verdict 跑输');
});

test('S5 reproducible', () => {
  const eq = [100, 101, 100.5, 102, 103];
  const dates = ['d1', 'd2', 'd3', 'd4', 'd5'];
  const a = new PerformanceEngine().compute(eq, dates);
  const b = new PerformanceEngine().compute(eq, dates);
  assertClose(a.metrics.sharpe, b.metrics.sharpe, 1e-12);
  assertClose(a.metrics.maxDrawdown, b.metrics.maxDrawdown, 1e-12);
});
