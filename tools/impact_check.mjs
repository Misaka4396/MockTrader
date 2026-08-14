// impact_check.mjs — 验证冲击成本模型（可选配置）
import { DataAccess, FactorEngine, StrategyEngine, BacktestEngine } from '../src/core/index.js';

const ds = new DataAccess().generate({
  varieties: ['RB', 'CU', 'M', 'AU', 'I', 'AL', 'FG', 'SC'],
  end: '2023-12-29',
});
const p = new FactorEngine().compute(ds);
const s = new StrategyEngine().generate(p, ds, { longCount: 3, shortCount: 3 });
const a = new BacktestEngine().run(ds, s, {});
const b = new BacktestEngine().run(ds, s, { impactCoef: 0.1 });
console.log(
  `总成本   无冲击: ${a.summary.totalCost.toFixed(0)}   有冲击(0.1): ${b.summary.totalCost.toFixed(0)}   增量: ${(b.summary.totalCost - a.summary.totalCost).toFixed(0)}`
);
console.log(
  `期末权益 无冲击: ${a.summary.finalEquity.toFixed(0)}   有冲击(0.1): ${b.summary.finalEquity.toFixed(0)}`
);
