// risk_report.mjs — Phase 2：风控指标报告
import {
  DataAccess,
  FactorEngine,
  StrategyEngine,
  BacktestEngine,
  historicalVaR,
  expectedShortfall,
  maxDrawdown,
  stressTest,
} from '../src/core/index.js';

const ds = new DataAccess().generate({ start: '2022-01-03', end: '2024-12-31' });
const panel = new FactorEngine().compute(ds);
const strat = new StrategyEngine().generate(panel, ds, {});
const bt = new BacktestEngine().run(ds, strat, {});
const nav = bt.equity.map((e) => e / bt.summary.initialCapital);

console.log('=== 风控指标（历史法，日频）===');
console.log(`95% VaR    : ${(historicalVaR(nav, 0.95) * 100).toFixed(2)}%`);
console.log(`99% VaR    : ${(historicalVaR(nav, 0.99) * 100).toFixed(2)}%`);
console.log(`95% CVaR   : ${(expectedShortfall(nav, 0.95) * 100).toFixed(2)}%`);
console.log(`最大回撤   : ${(maxDrawdown(nav) * 100).toFixed(2)}%`);
const st = stressTest(nav, -0.1);
console.log(
  `压力测试(峰值日-10%冲击): 回撤 ${(st.maxDrawdownBefore * 100).toFixed(2)}% -> ${(st.maxDrawdownAfter * 100).toFixed(2)}%`
);
