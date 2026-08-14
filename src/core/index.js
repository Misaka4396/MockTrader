/**
 * index.js — 公共 API 桶 (portable core 入口)。
 * 对应 C# 架构：DataAccess.dll / FactorEngine / StrategyEngine / BacktestEngine / PerformanceEngine。
 * 约定：仅命名导出（末尾单条 export { ... }），无 export *，便于打包器处理。
 */

import { DataAccess, parseContractCode } from './data/dataAccess.js';
import { METADATA, METADATA_BY_CODE, getMeta, BY_SECTOR } from './data/metadata.js';
import {
  generateVariety,
  SECTOR_SIM_DEFAULT,
  SIM_OVERRIDES,
  simParams,
  contractCode,
  deliveryISO,
} from './data/synthetic.js';
import { continuousSeries, buildMainSub, backAdjustFactors, maxAbsReturn } from './data/roll.js';
import {
  FactorEngine,
  DEFAULT_FACTOR_PARAMS,
  FACTOR_SIGNS,
  skewness,
  computeVarietyFactors,
  crossSectionalZ,
} from './factors/factorEngine.js';
import {
  StrategyEngine,
  DEFAULT_STRATEGY_CONFIG,
  compositeScores,
  factorWeights,
  computeRollingIC,
} from './strategy/strategyEngine.js';
import { BacktestEngine, DEFAULT_BACKTEST_CONFIG } from './backtest/backtestEngine.js';
import {
  PerformanceEngine,
  DEFAULT_BENCHMARK,
  DEFAULT_PERF_CONFIG,
} from './performance/performanceEngine.js';
import {
  SECTORS,
  FACTOR_KEYS,
  FACTOR_NAMES,
  FACTOR_REGISTRY,
  DIRECTION,
  EXCHANGES,
} from './types.js';
import {
  stringSeed,
  mulberry32,
  rngFromString,
  randn,
  parseISO,
  fmtISO,
  addDays,
  diffDays,
  isWeekday,
  tradingDates,
  inRange,
  sum,
  mean,
  variance,
  std,
  percentile,
  median,
  zscore,
  rank,
  pearson,
  spearman,
  winsorize,
  rollingMean,
  rollingStd,
  last,
  clamp,
  roundTo,
  deepClone,
  meanOfMap,
} from './utils.js';
import {
  NewsSentimentEngine,
  sentimentFactor,
  parseTs,
  labelToScore,
  dailySentimentByDate,
  generateMockNews,
  DEFAULT_LEAN,
} from './factors/newsSentiment.js';
import { TrendPredictor } from './trend/trendPredictor.js';
import {
  forwardReturns,
  quantileReturns,
  icSeries,
  icDecay,
  topTurnover,
  factorCorrelation,
  orthogonalize,
} from './research/factorAnalysis.js';
import { PaperLedger } from './research/paperLedger.js';
import {
  dailyReturns,
  historicalVaR,
  expectedShortfall,
  maxDrawdown,
  stressTest,
} from './risk/risk.js';
import { inverseVolWeights, riskParityWeights, capSectorExposure } from './portfolio/optimizer.js';

/** 一键端到端流水线（数据 -> 因子 -> 策略 -> 回测 -> 绩效），供 GUI/Worker 调用。 */
function runPipeline(options = {}) {
  const {
    start = '2022-01-03',
    end = '2024-12-31',
    masterSeed = 'mocktrader-default-seed',
    varieties = null,
    factorParams = {},
    strategyConfig = {},
    backtestConfig = {},
    perfConfig = {},
    onProgress = null,
  } = options;

  const report = (step, frac) => {
    if (onProgress) {
      onProgress(step, frac);
    }
  };

  report('生成数据', 0.05);
  const ds = new DataAccess().generate({ start, end, masterSeed, varieties });

  report('计算因子', 0.35);
  const panel = new FactorEngine().compute(ds, factorParams);

  report('生成信号', 0.55);
  const strat = new StrategyEngine().generate(panel, ds, strategyConfig);

  report('回测', 0.75);
  const bt = new BacktestEngine().run(ds, strat, backtestConfig);

  report('绩效', 0.9);
  const perf = new PerformanceEngine().compute(bt.equity, bt.dates, perfConfig);

  report('完成', 1.0);
  return { ds, panel, strategy: strat, backtest: bt, performance: perf };
}

export {
  DataAccess,
  parseContractCode,
  METADATA,
  METADATA_BY_CODE,
  getMeta,
  BY_SECTOR,
  generateVariety,
  SECTOR_SIM_DEFAULT,
  SIM_OVERRIDES,
  simParams,
  contractCode,
  deliveryISO,
  continuousSeries,
  buildMainSub,
  backAdjustFactors,
  maxAbsReturn,
  FactorEngine,
  DEFAULT_FACTOR_PARAMS,
  FACTOR_SIGNS,
  skewness,
  computeVarietyFactors,
  crossSectionalZ,
  StrategyEngine,
  DEFAULT_STRATEGY_CONFIG,
  compositeScores,
  factorWeights,
  computeRollingIC,
  BacktestEngine,
  DEFAULT_BACKTEST_CONFIG,
  PerformanceEngine,
  DEFAULT_BENCHMARK,
  DEFAULT_PERF_CONFIG,
  NewsSentimentEngine,
  sentimentFactor,
  parseTs,
  labelToScore,
  dailySentimentByDate,
  generateMockNews,
  DEFAULT_LEAN,
  TrendPredictor,
  forwardReturns,
  quantileReturns,
  icSeries,
  icDecay,
  topTurnover,
  factorCorrelation,
  orthogonalize,
  PaperLedger,
  dailyReturns,
  historicalVaR,
  expectedShortfall,
  maxDrawdown,
  stressTest,
  inverseVolWeights,
  riskParityWeights,
  capSectorExposure,
  SECTORS,
  FACTOR_KEYS,
  FACTOR_NAMES,
  FACTOR_REGISTRY,
  DIRECTION,
  EXCHANGES,
  stringSeed,
  mulberry32,
  rngFromString,
  randn,
  parseISO,
  fmtISO,
  addDays,
  diffDays,
  isWeekday,
  tradingDates,
  inRange,
  sum,
  mean,
  variance,
  std,
  percentile,
  median,
  zscore,
  rank,
  pearson,
  spearman,
  winsorize,
  rollingMean,
  rollingStd,
  last,
  clamp,
  roundTo,
  deepClone,
  meanOfMap,
  runPipeline,
};
