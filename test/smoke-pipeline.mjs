import { runPipeline, DataAccess, FactorEngine, StrategyEngine, BacktestEngine, PerformanceEngine } from '../src/core/index.js';

const res = runPipeline({
  start: '2022-01-03', end: '2024-12-31',
  varieties: null, // all
  onProgress: (s, f) => console.log('  progress', f.toFixed(2), s),
});

const { ds, panel, strategy, backtest, performance } = res;
console.log('\n=== pipeline ===');
console.log('varieties:', ds.codes.length, ' dates:', ds.dates.length);
console.log('rebalance dates:', strategy.rebalanceDates.length, ' first:', strategy.rebalanceDates[0], ' last:', strategy.rebalanceDates[strategy.rebalanceDates.length-1]);
console.log('trades:', backtest.trades.length, ' rolls:', backtest.rolls.length);
console.log('summary:', JSON.stringify(backtest.summary));
console.log('metrics:', JSON.stringify(performance.metrics, null, 2));
console.log('comparison:', JSON.stringify(performance.comparison, null, 2));

// sample target weights on first rebalance date
const d0 = strategy.rebalanceDates[0];
console.log('targets on', d0, ':', JSON.stringify(strategy.targets[d0]));

// check factor panel shape
console.log('factor z sample (momentum) on', d0, ':');
for (const code of panel.varieties.slice(0, 5)) {
  const t = panel.dates.indexOf(d0);
  console.log('  ', code, panel.z.momentum[code][t]);
}

// check roll yield sign vs carry: average rollYield per variety, print first few
console.log('\nrollYield (raw, annualized) avg by variety (first 10):');
for (const code of panel.varieties.slice(0, 10)) {
  const arr = panel.raw.rollYield[code].filter(v => v != null);
  const avg = arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  console.log('  ', code, avg.toFixed(4));
}
