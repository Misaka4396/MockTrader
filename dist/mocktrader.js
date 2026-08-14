(function (global) {
  'use strict';
  var __mods = {};
  function __def(id, fn) { __mods[id] = { fn: fn, exports: {}, done: false }; }
  function __req(id) {
    var m = __mods[id];
    if (!m.done) { m.done = true; m.fn(__req, m.exports); }
    return m.exports;
  }
__def("index", function(__req, __exports) {
  const { DataAccess, parseContractCode } = __req("data/dataAccess");
  const { METADATA, METADATA_BY_CODE, getMeta, BY_SECTOR } = __req("data/metadata");
  const { generateVariety, SECTOR_SIM_DEFAULT, SIM_OVERRIDES, simParams, contractCode, deliveryISO } = __req("data/synthetic");
  const { continuousSeries, buildMainSub, backAdjustFactors, maxAbsReturn } = __req("data/roll");
  const { FactorEngine, DEFAULT_FACTOR_PARAMS, FACTOR_SIGNS, skewness, computeVarietyFactors, crossSectionalZ } = __req("factors/factorEngine");
  const { StrategyEngine, DEFAULT_STRATEGY_CONFIG, compositeScores, factorWeights, computeRollingIC } = __req("strategy/strategyEngine");
  const { BacktestEngine, DEFAULT_BACKTEST_CONFIG } = __req("backtest/backtestEngine");
  const { PerformanceEngine, DEFAULT_BENCHMARK, DEFAULT_PERF_CONFIG } = __req("performance/performanceEngine");
  const { SECTORS, FACTOR_KEYS, FACTOR_NAMES, FACTOR_REGISTRY, DIRECTION, EXCHANGES } = __req("types");
  const { stringSeed, mulberry32, rngFromString, randn, parseISO, fmtISO, addDays, diffDays, isWeekday, tradingDates, inRange, sum, mean, variance, std, percentile, median, zscore, rank, pearson, spearman, winsorize, rollingMean, rollingStd, last, clamp, roundTo, deepClone, meanOfMap } = __req("utils");
  const { NewsSentimentEngine, sentimentFactor, parseTs, labelToScore, dailySentimentByDate, generateMockNews, DEFAULT_LEAN } = __req("factors/newsSentiment");
  const { TrendPredictor } = __req("trend/trendPredictor");
  const { forwardReturns, quantileReturns, icSeries, icDecay, topTurnover, factorCorrelation, orthogonalize } = __req("research/factorAnalysis");
  const { PaperLedger } = __req("research/paperLedger");
  const { dailyReturns, historicalVaR, expectedShortfall, maxDrawdown, stressTest } = __req("risk/risk");
  const { inverseVolWeights, riskParityWeights, capSectorExposure } = __req("portfolio/optimizer");
/**
 * index.js — 公共 API 桶 (portable core 入口)。
 * 对应 C# 架构：DataAccess.dll / FactorEngine / StrategyEngine / BacktestEngine / PerformanceEngine。
 * 约定：仅命名导出（末尾单条 export { ... }），无 export *，便于打包器处理。
 */


















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



  Object.assign(__exports, { DataAccess, parseContractCode, METADATA, METADATA_BY_CODE, getMeta, BY_SECTOR, generateVariety, SECTOR_SIM_DEFAULT, SIM_OVERRIDES, simParams, contractCode, deliveryISO, continuousSeries, buildMainSub, backAdjustFactors, maxAbsReturn, FactorEngine, DEFAULT_FACTOR_PARAMS, FACTOR_SIGNS, skewness, computeVarietyFactors, crossSectionalZ, StrategyEngine, DEFAULT_STRATEGY_CONFIG, compositeScores, factorWeights, computeRollingIC, BacktestEngine, DEFAULT_BACKTEST_CONFIG, PerformanceEngine, DEFAULT_BENCHMARK, DEFAULT_PERF_CONFIG, NewsSentimentEngine, sentimentFactor, parseTs, labelToScore, dailySentimentByDate, generateMockNews, DEFAULT_LEAN, TrendPredictor, forwardReturns, quantileReturns, icSeries, icDecay, topTurnover, factorCorrelation, orthogonalize, PaperLedger, dailyReturns, historicalVaR, expectedShortfall, maxDrawdown, stressTest, inverseVolWeights, riskParityWeights, capSectorExposure, SECTORS, FACTOR_KEYS, FACTOR_NAMES, FACTOR_REGISTRY, DIRECTION, EXCHANGES, stringSeed, mulberry32, rngFromString, randn, parseISO, fmtISO, addDays, diffDays, isWeekday, tradingDates, inRange, sum, mean, variance, std, percentile, median, zscore, rank, pearson, spearman, winsorize, rollingMean, rollingStd, last, clamp, roundTo, deepClone, meanOfMap, runPipeline });
});
__def("data/dataAccess", function(__req, __exports) {
  const { METADATA, METADATA_BY_CODE } = __req("data/metadata");
  const { generateVariety, deliveryISO } = __req("data/synthetic");
  const { continuousSeries, maxAbsReturn } = __req("data/roll");
  const { tradingDates, stringSeed } = __req("utils");
/**
 * dataAccess.js — 数据访问层 (S1: DataAccess "dll")。
 * 纯内存 + 可导出快照（JSON），不依赖 Node fs，便于浏览器/Node 复用；
 * 磁盘持久化由 tools/persist.mjs 通过 exportSnapshot/importSnapshot 完成。
 */






/** 从合约代码解析交割月（依赖品种代码前缀） */
function parseContractCode(varietyCode, contractCode) {
  const yyMM = contractCode.slice(varietyCode.length);
  const yy = Number(yyMM.slice(0, 2));
  const mm = Number(yyMM.slice(2, 4));
  const year = 2000 + yy;
  return { year, month: mm, delivery: deliveryISO(year, mm) };
}

class DataAccess {
  constructor() {
    this.reset();
  }

  reset() {
    this.dates = [];
    this.dataset = null; // { code: { contracts: {[contractCode]: bars[]} } }
    this.series = {}; // code -> continuousSeries 结果 (缓存)
    this.config = null;
  }

  /**
   * 生成全品种多合约数据（确定性）。config: { start, end, masterSeed, varieties? }
   */
  generate(config = {}) {
    const start = config.start || '2022-01-03';
    const end = config.end || '2024-12-31';
    const masterSeed = config.masterSeed || 'mocktrader-default-seed';
    const dates = tradingDates(start, end);
    const codes = config.varieties && config.varieties.length ? config.varieties : METADATA.map((m) => m.code);
    const dataset = {};
    for (const code of codes) {
      const meta = METADATA_BY_CODE[code];
      if (!meta) {continue;}
      dataset[code] = generateVariety(meta, dates, masterSeed);
    }
    this.dates = dates;
    this.dataset = dataset;
    this.config = { start, end, masterSeed, varieties: Object.keys(dataset) };
    this.series = {};
    return this;
  }

  get codes() {
    return this.dataset ? Object.keys(this.dataset) : [];
  }

  get datesCount() {
    return this.dates.length;
  }

  /** 数据版本指纹：同数据 → 同指纹，用于回测审计头（schema + 区间 + 品种 + 采样收盘价） */
  dataFingerprint() {
    const codes = this.codes.join(',');
    const samples = [];
    for (const code of this.codes.slice(0, 12)) {
      const s = this.getSeries(code);
      if (!s) { continue; }
      for (let i = 0; i < s.dates.length; i += 60) {
        if (s.mainRaw[i] != null) { samples.push(s.mainRaw[i].toFixed(4)); }
      }
    }
    const seedStr = `schema:v1|${ this.dates[0] || '' }|${ this.dates[this.dates.length - 1] || '' }|${ this.dates.length }|${ codes }|${ samples.join(',')}`;
    return stringSeed(seedStr).toString(16);
  }

  /** 品种元数据 */
  getMeta(code) {
    return METADATA_BY_CODE[code] || null;
  }

  get metadata() {
    return METADATA;
  }

  /** 某品种全部合约代码（已排序） */
  getContracts(code) {
    if (!this.dataset || !this.dataset[code]) {return [];}
    return Object.keys(this.dataset[code].contracts).sort();
  }

  /** 某合约日线 */
  getBars(code, contractCode) {
    if (!this.dataset || !this.dataset[code]) {return null;}
    return this.dataset[code].contracts[contractCode] || null;
  }

  /** 某合约某日 bar */
  getBar(code, contractCode, date) {
    const bars = this.getBars(code, contractCode);
    if (!bars) {return null;}
    // 线性定位（数据按日期升序）
    for (const b of bars) {if (b.date === date) {return b;}}
    return null;
  }

  /** 某品种主力/次主力连续序列（含后复权） */
  getSeries(code) {
    if (!this.dataset || !this.dataset[code]) {return null;}
    if (!this.series[code]) {this.series[code] = continuousSeries(this.dates, this.dataset[code].contracts);}
    return this.series[code];
  }

  /** 展期事件表 */
  getRolls(code) {
    const s = this.getSeries(code);
    return s ? s.rolls : [];
  }

  /** 展期复权跳空校验：返回最大 |log-return| */
  getMaxJump(code) {
    const s = this.getSeries(code);
    return s ? maxAbsReturn(s.mainAdj) : 0;
  }

  /** 交易日历 */
  get datesArr() {
    return this.dates;
  }

  /** 某日可交易品种（已上市且未退市且有数据） */
  universeAt(date) {
    const out = [];
    for (const code of this.codes) {
      const meta = METADATA_BY_CODE[code];
      if (!meta) {continue;}
      if (meta.list && date < meta.list) {continue;}
      if (meta.delist && date > meta.delist) {continue;}
      const s = this.getSeries(code);
      if (!s) {continue;}
      const i = this.dates.indexOf(date);
      if (i >= 0 && s.mainRaw[i] != null) {out.push(code);}
    }
    return out;
  }

  /** 导出可序列化快照（含全部合约与派生连续序列） */
  exportSnapshot() {
    const series = {};
    for (const code of this.codes) {series[code] = this.getSeries(code);}
    return {
      version: 1,
      config: this.config,
      dates: this.dates,
      metadata: METADATA,
      dataset: this.dataset,
      series,
    };
  }

  /** 从真实行情数据加载（方案 A）：{ dates, dataset }，dataset = { code: { contracts: { code: [bar] } } } */
  loadMarketData(data) {
    this.dates = data.dates || [];
    this.dataset = data.dataset || {};
    this.series = {};
    if (!this.config) {this.config = { source: 'market-data' };}
    return this;
  }

  /** 从快照恢复（快照含 dataset 与 series） */
  importSnapshot(snapshot) {
    this.dates = snapshot.dates || [];
    this.dataset = snapshot.dataset || {};
    this.config = snapshot.config || null;
    this.series = snapshot.series || {};
    return this;
  }
}

  Object.assign(__exports, { parseContractCode, DataAccess });
});
__def("data/metadata", function(__req, __exports) {
/**
 * metadata.js — 品种元数据 (S1)：合约乘数、保证金率、最小变动价位、上市/退市日期、板块、交割月。
 *
 * 字段说明 (schema 见 docs/02_data_schema.md):
 *  - code    品种代码 (合约代码前缀)
 *  - name    品种名
 *  - sector  板块：黑色/有色/能化/农产品/贵金属
 *  - exchange 交易所：SHFE/DCE/CZCE/INE
 *  - mult    合约乘数 (吨/手 等)
 *  - margin  保证金率 (小数)
 *  - tick    最小变动价位
 *  - tickValue 最小变动价值 = tick * mult
 *  - unit    报价单位
 *  - months  上市交割月 (null = 全部 12 个月；否则为数组，如 [1,5,9])
 *  - list    品种上市日期 (近似，用于历史口径)
 *  - delist  品种退市日期 (null = 仍上市)。已退市品种保留在此表中以处理幸存者偏差。
 *  - ref     合成数据参考价位 (约 2022 年前后典型价，仅作合成锚点，非真实行情)。
 *
 * 说明：mult/margin/tick 为真实口径的典型值（随交易所调整可能变化，原型用途）；
 *       退市品种 WR/BB/RS 用于演示「已退市品种保留」与幸存者偏差处理。
 */

function V(code, name, sector, exchange, mult, margin, tick, unit, months, list, delist, ref) {
  return { code, name, sector, exchange, mult, margin, tick, tickValue: Math.round(mult * tick), unit, months, list, delist, ref };
}

const METADATA = [
  // ---- 黑色 (9) ----
  V('RB', '螺纹钢', '黑色', 'SHFE', 10, 0.12, 1, '元/吨', null, '2009-03-27', null, 3600),
  V('HC', '热轧卷板', '黑色', 'SHFE', 10, 0.12, 1, '元/吨', null, '2014-03-21', null, 3700),
  V('I', '铁矿石', '黑色', 'DCE', 100, 0.15, 0.5, '元/吨', null, '2013-10-18', null, 800),
  V('J', '焦炭', '黑色', 'DCE', 100, 0.20, 0.5, '元/吨', null, '2011-04-15', null, 2100),
  V('JM', '焦煤', '黑色', 'DCE', 60, 0.20, 0.5, '元/吨', null, '2013-03-22', null, 1500),
  V('SF', '硅铁', '黑色', 'CZCE', 5, 0.12, 2, '元/吨', null, '2014-08-08', null, 6800),
  V('SM', '锰硅', '黑色', 'CZCE', 5, 0.12, 2, '元/吨', null, '2014-08-08', null, 6600),
  V('FG', '玻璃', '黑色', 'CZCE', 20, 0.12, 1, '元/吨', null, '2012-12-03', null, 1500),
  V('SA', '纯碱', '黑色', 'CZCE', 20, 0.12, 1, '元/吨', null, '2019-12-06', null, 2200),

  // ---- 有色 (8) ----
  V('CU', '铜', '有色', 'SHFE', 5, 0.10, 10, '元/吨', null, '1993-03-01', null, 68000),
  V('AL', '铝', '有色', 'SHFE', 5, 0.10, 5, '元/吨', null, '1992-05-28', null, 19000),
  V('ZN', '锌', '有色', 'SHFE', 5, 0.10, 5, '元/吨', null, '2007-03-26', null, 22000),
  V('PB', '铅', '有色', 'SHFE', 5, 0.10, 5, '元/吨', null, '2011-03-24', null, 15500),
  V('NI', '镍', '有色', 'SHFE', 1, 0.12, 10, '元/吨', null, '2015-03-27', null, 150000),
  V('SN', '锡', '有色', 'SHFE', 1, 0.12, 10, '元/吨', null, '2015-03-27', null, 210000),
  V('AO', '氧化铝', '有色', 'SHFE', 20, 0.12, 1, '元/吨', null, '2023-06-19', null, 3200),
  V('SS', '不锈钢', '有色', 'SHFE', 5, 0.12, 5, '元/吨', null, '2019-09-25', null, 14000),

  // ---- 能化 (11) ----
  V('SC', '原油', '能化', 'INE', 1000, 0.12, 0.1, '元/桶', null, '2018-03-26', null, 550),
  V('FU', '燃料油', '能化', 'SHFE', 10, 0.12, 1, '元/吨', null, '2004-08-25', null, 3000),
  V('RU', '橡胶', '能化', 'SHFE', 10, 0.12, 5, '元/吨', [1, 5, 9], '1993-06-01', null, 13000),
  V('BU', '沥青', '能化', 'SHFE', 10, 0.12, 1, '元/吨', null, '2013-10-09', null, 3700),
  V('TA', 'PTA', '能化', 'CZCE', 5, 0.12, 2, '元/吨', [1, 5, 9], '2006-12-18', null, 5600),
  V('EG', '乙二醇', '能化', 'DCE', 10, 0.12, 1, '元/吨', null, '2018-12-10', null, 4500),
  V('MA', '甲醇', '能化', 'CZCE', 10, 0.12, 1, '元/吨', null, '2011-10-28', null, 2500),
  V('PP', '聚丙烯', '能化', 'DCE', 5, 0.12, 1, '元/吨', null, '2014-02-28', null, 7600),
  V('L', '塑料', '能化', 'DCE', 5, 0.12, 1, '元/吨', null, '2007-07-31', null, 8100),
  V('V', 'PVC', '能化', 'DCE', 5, 0.12, 1, '元/吨', null, '2009-05-25', null, 6000),
  V('EB', '苯乙烯', '能化', 'DCE', 5, 0.12, 1, '元/吨', null, '2019-09-26', null, 8500),

  // ---- 农产品 (12) ----
  V('M', '豆粕', '农产品', 'DCE', 10, 0.10, 1, '元/吨', [1, 5, 9], '2000-07-17', null, 3800),
  V('Y', '豆油', '农产品', 'DCE', 10, 0.10, 2, '元/吨', [1, 5, 9], '2006-01-09', null, 8000),
  V('P', '棕榈油', '农产品', 'DCE', 10, 0.10, 2, '元/吨', [1, 5, 9], '2007-10-29', null, 7800),
  V('A', '豆一', '农产品', 'DCE', 10, 0.10, 1, '元/吨', [1, 5, 9], '2002-03-15', null, 5200),
  V('C', '玉米', '农产品', 'DCE', 10, 0.10, 1, '元/吨', [1, 5, 9], '2004-09-22', null, 2600),
  V('CS', '玉米淀粉', '农产品', 'DCE', 10, 0.10, 1, '元/吨', [1, 5, 9], '2014-12-19', null, 3100),
  V('CF', '棉花', '农产品', 'CZCE', 5, 0.10, 5, '元/吨', [1, 5, 9], '2004-06-01', null, 16000),
  V('SR', '白糖', '农产品', 'CZCE', 10, 0.10, 1, '元/吨', [1, 5, 9], '2006-01-06', null, 5800),
  V('OI', '菜籽油', '农产品', 'CZCE', 10, 0.10, 1, '元/吨', [1, 5, 9], '2007-06-08', null, 9000),
  V('RM', '菜籽粕', '农产品', 'CZCE', 10, 0.10, 1, '元/吨', [1, 5, 9], '2012-12-28', null, 2800),
  V('AP', '苹果', '农产品', 'CZCE', 10, 0.12, 1, '元/吨', [1, 5, 10], '2017-12-22', null, 8500),
  V('JD', '鸡蛋', '农产品', 'DCE', 10, 0.12, 1, '元/500千克', null, '2013-11-08', null, 4000),

  // ---- 贵金属 (2) ----
  V('AU', '黄金', '贵金属', 'SHFE', 1000, 0.08, 0.02, '元/克', null, '2008-01-09', null, 450),
  V('AG', '白银', '贵金属', 'SHFE', 15, 0.09, 1, '元/千克', null, '2012-05-10', null, 5500),

  // ---- 已退市品种 (幸存者偏差演示，保留在元数据中) ----
  V('WR', '线材', '黑色', 'SHFE', 10, 0.12, 1, '元/吨', null, '2009-03-27', '2023-06-30', 3800),
  V('BB', '胶合板', '黑色', 'DCE', 500, 0.20, 0.05, '元/张', null, '2013-12-06', '2022-06-30', 150),
  V('RS', '油菜籽', '农产品', 'CZCE', 10, 0.12, 1, '元/吨', [1, 5, 9], '2012-12-28', '2021-06-30', 5000),
];

/** code -> meta 索引 */
const METADATA_BY_CODE = Object.fromEntries(METADATA.map((m) => [m.code, m]));

/** 按板块分组 */
const BY_SECTOR = METADATA.reduce((acc, m) => {
  (acc[m.sector] = acc[m.sector] || []).push(m);
  return acc;
}, {});

function getMeta(code) {
  return METADATA_BY_CODE[code];
}

  Object.assign(__exports, { V, METADATA, METADATA_BY_CODE, BY_SECTOR, getMeta });
});
__def("data/synthetic", function(__req, __exports) {
  const { rngFromString, randn, tradingDates, addDays, diffDays, roundTo } = __req("utils");
/**
 * synthetic.js — 合成行情生成器 (S1)。确定性、可复现，用于无真实数据源时的原型验证。
 *
 * 模型要点 (详见 docs/02_data_schema.md)：
 *  - 每个品种一条「连续现货水准」随机游走 + 弱均值回归，作为期限结构锚点 S_t。
 *  - 年化 carry 为 OU 过程（可正可负，随时间切换 contango/backwardation）。
 *  - 合约价格 F(T) = S_t * exp(carry_t * T/365)，T 为距交割天数（自然收敛于交割）。
 *  - 成交量/持仓量围绕「距交割月数」形成峰值（非对称，近交割快速衰减），从而自然形成主力切换。
 *  - 已退市品种按 delist 日期停止出数据，但元数据保留。
 */



/** 板块级合成参数默认值 */
const SECTOR_SIM_DEFAULT = {
  '黑色': { vol: 0.25, drift: 0.00, carryMean: -0.05, carryVol: 0.09, rho: 0.995, seasonAmp: 0.04, oiPeak: 2.2, oiSpread: 3.0, volBase: 120000, oiBase: 160000 },
  '有色': { vol: 0.22, drift: 0.00, carryMean: 0.04, carryVol: 0.07, rho: 0.995, seasonAmp: 0.03, oiPeak: 2.2, oiSpread: 3.0, volBase: 90000, oiBase: 140000 },
  '能化': { vol: 0.28, drift: 0.00, carryMean: 0.02, carryVol: 0.10, rho: 0.995, seasonAmp: 0.05, oiPeak: 2.2, oiSpread: 3.0, volBase: 150000, oiBase: 200000 },
  '农产品': { vol: 0.20, drift: 0.00, carryMean: 0.00, carryVol: 0.09, rho: 0.995, seasonAmp: 0.06, oiPeak: 2.5, oiSpread: 3.2, volBase: 110000, oiBase: 180000 },
  '贵金属': { vol: 0.14, drift: 0.00, carryMean: 0.05, carryVol: 0.05, rho: 0.995, seasonAmp: 0.02, oiPeak: 2.5, oiSpread: 3.0, volBase: 80000, oiBase: 120000 },
};

/** 单品种覆盖 (制造 carry 符号的截面差异：负=backwardation，正=contango) */
const SIM_OVERRIDES = {
  RB: { carryMean: -0.06 }, HC: { carryMean: -0.06 }, I: { carryMean: -0.08 }, J: { carryMean: -0.07 }, JM: { carryMean: -0.07 },
  SF: { carryMean: -0.03 }, SM: { carryMean: -0.03 }, FG: { carryMean: -0.04 }, SA: { carryMean: 0.01 },
  CU: { carryMean: 0.06 }, AL: { carryMean: 0.03 }, ZN: { carryMean: 0.04 }, PB: { carryMean: 0.02 }, NI: { carryMean: 0.05 }, SN: { carryMean: 0.05 },
  AO: { carryMean: 0.03 }, SS: { carryMean: 0.04 },
  SC: { carryMean: 0.06 }, FU: { carryMean: 0.05 }, RU: { carryMean: -0.03 }, BU: { carryMean: 0.02 }, TA: { carryMean: 0.01 },
  EG: { carryMean: 0.02 }, MA: { carryMean: 0.01 }, PP: { carryMean: 0.02 }, L: { carryMean: 0.02 }, V: { carryMean: 0.03 }, EB: { carryMean: 0.02 },
  M: { carryMean: -0.05 }, Y: { carryMean: -0.02 }, P: { carryMean: -0.03 }, A: { carryMean: -0.02 }, C: { carryMean: -0.02 },
  CS: { carryMean: -0.01 }, CF: { carryMean: 0.02 }, SR: { carryMean: 0.03 }, OI: { carryMean: -0.01 }, RM: { carryMean: -0.04 },
  AP: { carryMean: -0.03 }, JD: { carryMean: -0.02 },
  AU: { carryMean: 0.06 }, AG: { carryMean: 0.05 },
  WR: { carryMean: -0.05 }, BB: { carryMean: 0.02 }, RS: { carryMean: -0.03 },
};

function simParams(code, sector) {
  return Object.assign({}, SECTOR_SIM_DEFAULT[sector], SIM_OVERRIDES[code] || {});
}

const DT = 1 / 252;

/** 合约代码：RB + YYMM -> 'RB2305' */
function contractCode(code, year, month) {
  return code + String(year).slice(-2) + String(month).padStart(2, '0');
}

/** 交割日（约定为交割月 15 日，用于距交割天数与展期年化） */
function deliveryISO(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-15`;
}

/** 非对称 OI 形状：距交割月数 m 处取值，近交割侧衰减更快 */
function oiShape(m, peak, spread) {
  const s = m < peak ? spread * 0.55 : spread;
  return Math.exp(-((m - peak) * (m - peak)) / (2 * s * s));
}

function volShape(m, peak, spread) {
  return Math.exp(-((m - peak) * (m - peak)) / (2 * spread * spread));
}

/** 月份列表（meta.months 或全部 12 个月） */
function deliveryMonths(meta) {
  if (meta.months) {return meta.months.slice();}
  const all = [];
  for (let m = 1; m <= 12; m++) {all.push(m);}
  return all;
}

/**
 * 生成单个品种的多合约日线。
 * @returns {code, contracts: {[contractCode]: [{date, open, high, low, close, settle, volume, openInterest}]}}
 */
function generateVariety(meta, dates, masterSeed) {
  const sim = simParams(meta.code, meta.sector);
  const rng = rngFromString(`${masterSeed }:${ meta.code}`);
  const N = dates.length;
  const first = dates[0];
  const last = dates[N - 1];

  // ---- 扩展窗口（含预热），生成现货水准与 carry 路径 ----
  const warmupDays = 260;
  const extStart = addDays(first, -Math.round(warmupDays * 1.45));
  const extDates = tradingDates(extStart, last);
  const extN = extDates.length;
  const idxOf = new Map(extDates.map((d, i) => [d, i]));

  const logP = new Array(extN);
  const carry = new Array(extN);
  const kappa = 0.03;
  const dailyVol = sim.vol * Math.sqrt(DT);
  let lp = Math.log(meta.ref);
  let c = sim.carryMean;
  for (let i = 0; i < extN; i++) {
    const d = extDates[i];
    const month = Number(d.slice(5, 7));
    // 温和季节性漂移（量级远小于年化波动）
    const seasonalDrift = sim.seasonAmp * Math.cos((2 * Math.PI * (month - 1)) / 12) * DT;
    if (i === 0) {
      logP[0] = lp;
      carry[0] = c;
    } else {
      lp = lp + sim.drift * DT + seasonalDrift + kappa * (Math.log(meta.ref) - lp) * DT + dailyVol * randn(rng);
      c = sim.carryMean + sim.rho * (c - sim.carryMean) + sim.carryVol * Math.sqrt(DT) * randn(rng);
      logP[i] = lp;
      carry[i] = c;
    }
  }

  // ---- 生成合约 ----
  const contracts = {};
  const months = deliveryMonths(meta);
  // 交割月间隔：全月合约 gap=1，稀疏月(1/5/9) gap≈4；据此收紧 OI 峰宽以减少主力抖动
  const gap = months.length >= 2 ? (((months[1] - months[0]) % 12) + 12) % 12 : 1;
  const oiPeak = gap === 1 ? 2.0 : sim.oiPeak;
  const oiSpread = gap === 1 ? 1.3 : sim.oiSpread;
  const y0 = Number(first.slice(0, 4));
  const y1 = Number(last.slice(0, 4));
  const codes = [];
  for (let y = y0 - 1; y <= y1 + 1; y++) {
    for (const mm of months) {
      const del = deliveryISO(y, mm);
      const listDate = addDays(del, -360); // 约 12 个月前上市
      const lastTrade = addDays(del, -7); // 交割前约一周停止交易
      // 仅保留与样本区间有交集的合约
      if (lastTrade < first || listDate > last) {continue;}
      codes.push({ code: contractCode(meta.code, y, mm), del, listDate, lastTrade });
    }
  }
  codes.sort((a, b) => (a.del < b.del ? -1 : a.del > b.del ? 1 : 0));

  for (const con of codes) {
    const basisC = 0.0015 * randn(rng);
    const bars = [];
    let prevClose = null;
    for (const d of dates) {
      if (d < con.listDate || d > con.lastTrade) {continue;}
      // 品种退市门控：退市日之后不再出数据
      if (meta.delist && d > meta.delist) {continue;}
      const i = idxOf.get(d);
      if (i === undefined) {continue;}
      const spot = Math.exp(logP[i]);
      const ttm = Math.max(diffDays(d, con.del), 1) / 365;
      const fair = spot * Math.exp(carry[i] * ttm) * (1 + basisC);
      const dailyEps = 0.0006 * randn(rng);
      const close = fair * (1 + dailyEps);
      const gap = prevClose == null ? 0 : 0.0008 * randn(rng);
      const open = prevClose == null ? close : prevClose * (1 + gap);
      const hnoise = 0.0006 * Math.abs(randn(rng));
      const lnoise = 0.0006 * Math.abs(randn(rng));
      const high = Math.max(open, close) * (1 + hnoise);
      const low = Math.min(open, close) * (1 - lnoise);
      const m = ttm * 12;
      const liq = volShape(m, oiPeak, oiSpread);
      const volume = Math.max(0, Math.round(sim.volBase * liq * (1 + 0.25 * randn(rng))));
      const openInterest = Math.max(0, Math.round(sim.oiBase * oiShape(m, oiPeak, oiSpread) * (1 + 0.02 * randn(rng))));
      const tick = meta.tick || 1e-6;
      const r = (x) => roundTo(Math.round(x / tick) * tick, 6);
      bars.push({
        date: d,
        open: r(open),
        high: r(high),
        low: r(low),
        close: r(close),
        settle: r(close),
        volume,
        openInterest,
      });
      prevClose = close;
    }
    if (bars.length) {contracts[con.code] = bars;}
  }
  return { code: meta.code, contracts };
}

  Object.assign(__exports, { SECTOR_SIM_DEFAULT, SIM_OVERRIDES, simParams, contractCode, deliveryISO, generateVariety });
});
__def("utils", function(__req, __exports) {
/**
 * utils.js — 纯函数工具库：确定性随机数、日期、统计 (pure numeric/date/random helpers).
 *
 * 所有函数均为纯函数，无 I/O、无外部依赖。日期统一使用 UTC 避免时区/夏令时问题。
 */

// ---------------------------------------------------------------------------
// 确定性随机数 (deterministic PRNG) — 保证数据/结果可复现
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit 字符串哈希 -> 稳定的随机种子 */
function stringSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG：返回函数 rand() -> [0,1) */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 由字符串 key 生成确定性随机数发生器 */
function rngFromString(key) {
  return mulberry32(stringSeed(key));
}

/** Box–Muller 标准正态随机数 (给定 [0,1) 随机源) */
function randn(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) {
    u = rng();
  }
  while (v === 0) {
    v = rng();
  }
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------------------
// 日期 (dates, UTC-based)
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;

/** 'YYYY-MM-DD' -> epoch ms (UTC 午夜) */
function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** epoch ms -> 'YYYY-MM-DD' (UTC) */
function fmtISO(ms) {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** iso + n 天 */
function addDays(iso, n) {
  return fmtISO(parseISO(iso) + n * DAY_MS);
}

/** b - a 的天数 (可为负) */
function diffDays(aIso, bIso) {
  return Math.round((parseISO(bIso) - parseISO(aIso)) / DAY_MS);
}

/** 是否为工作日 (周一~周五) */
function isWeekday(iso) {
  const day = new Date(parseISO(iso)).getUTCDay();
  return day !== 0 && day !== 6;
}

/** 生成 [start, end] 区间内的交易日 (工作日，忽略交易所节假日——原型口径，见 docs) */
function tradingDates(startIso, endIso) {
  const out = [];
  let cur = startIso;
  const end = parseISO(endIso);
  while (parseISO(cur) <= end) {
    if (isWeekday(cur)) {
      out.push(cur);
    }
    cur = addDays(cur, 1);
  }
  return out;
}

/** 日期是否在 [start, end] 内 (含端点；空串视为无界) */
function inRange(iso, startIso, endIso) {
  if (startIso && iso < startIso) {
    return false;
  }
  if (endIso && iso > endIso) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 统计 (statistics)
// ---------------------------------------------------------------------------

function sum(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    s += arr[i];
  }
  return s;
}

function mean(arr) {
  if (!arr.length) {
    return NaN;
  }
  return sum(arr) / arr.length;
}

/** 样本方差 (ddof=1) 或总体方差 (ddof=0) */
function variance(arr, ddof = 1) {
  const n = arr.length;
  if (n - ddof <= 0) {
    return NaN;
  }
  const m = mean(arr);
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += (arr[i] - m) * (arr[i] - m);
  }
  return s / (n - ddof);
}

function std(arr, ddof = 1) {
  return Math.sqrt(variance(arr, ddof));
}

/** 线性插值分位数 (p in [0,1]) */
function percentile(arr, p) {
  if (!arr.length) {
    return NaN;
  }
  const sorted = arr.slice().sort((a, b) => a - b);
  if (p <= 0) {
    return sorted[0];
  }
  if (p >= 1) {
    return sorted[sorted.length - 1];
  }
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

/** 中位数 */
function median(arr) {
  return percentile(arr, 0.5);
}

/** 总体 z-score (ddof=0)：返回与输入等长数组 */
function zscore(arr) {
  const m = mean(arr);
  const s = std(arr, 0);
  if (!(s > 0)) {
    return arr.map(() => 0);
  }
  return arr.map((x) => (x - m) / s);
}

/** 秩 (rank)：升序，平均并列，返回 1..n */
function rank(arr) {
  const n = arr.length;
  const idx = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && idx[j + 1].v === idx[i].v) {
      j++;
    }
    const avg = (i + j) / 2 + 1; // 1-based average rank
    for (let k = i; k <= j; k++) {
      out[idx[k].i] = avg;
    }
    i = j + 1;
  }
  return out;
}

/** Pearson 相关系数 */
function pearson(a, b) {
  const n = a.length;
  if (n < 2 || n !== b.length) {
    return NaN;
  }
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) * (a[i] - ma);
    db += (b[i] - mb) * (b[i] - mb);
  }
  const den = Math.sqrt(da * db);
  if (!(den > 0)) {
    return NaN;
  }
  return num / den;
}

/** Spearman 秩相关 */
function spearman(a, b) {
  return pearson(rank(a), rank(b));
}

/** 稳健 winsorize：基于中位数 + MAD 截尾 (k 倍 MAD) */
function winsorize(arr, k = 2.5) {
  if (!arr.length) {
    return arr.slice();
  }
  const med = median(arr);
  const absDev = arr.map((x) => Math.abs(x - med));
  const mad = median(absDev) || 1e-12;
  const cap = k * 1.4826 * mad;
  const lo = med - cap;
  const hi = med + cap;
  return arr.map((x) => Math.max(lo, Math.min(hi, x)));
}

/** 简单移动平均：返回与输入等长数组，窗口不足处为 NaN */
function rollingMean(arr, window) {
  const out = new Array(arr.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    s += arr[i];
    if (i >= window) {
      s -= arr[i - window];
    }
    if (i >= window - 1) {
      out[i] = s / window;
    }
  }
  return out;
}

/** 简单移动标准差：返回与输入等长数组，窗口不足处为 NaN */
function rollingStd(arr, window) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = window - 1; i < arr.length; i++) {
    const win = arr.slice(i - window + 1, i + 1);
    out[i] = std(win, 0);
  }
  return out;
}

function last(arr) {
  return arr.length ? arr[arr.length - 1] : undefined;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/** 四舍五入到 dp 位小数 (返回 number) */
function roundTo(x, dp = 6) {
  const f = Math.pow(10, dp);
  return Math.round((x + Number.EPSILON) * f) / f;
}

/** 深拷贝 (结构化可克隆对象) */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** 键控均值：对象 {key: number} -> values 的均值 */
function meanOfMap(map) {
  const keys = Object.keys(map);
  if (!keys.length) {
    return NaN;
  }
  let s = 0;
  for (const k of keys) {
    s += map[k];
  }
  return s / keys.length;
}

  Object.assign(__exports, { stringSeed, mulberry32, rngFromString, randn, parseISO, fmtISO, addDays, diffDays, isWeekday, tradingDates, inRange, sum, mean, variance, std, percentile, median, zscore, rank, pearson, spearman, winsorize, rollingMean, rollingStd, last, clamp, roundTo, deepClone, meanOfMap });
});
__def("data/roll", function(__req, __exports) {
/**
 * roll.js — 主力/次主力判定与展期复权 (S1 核心)。
 *
 * 主力 = 持仓量最大合约（并列按成交量、再按交割月更早者）。
 * 次主力 = 持仓量第二大合约。
 * 展期复权 = 后复权（比值法，锚定最新价），消除主力切换跳空、保留逐日收益率。
 */

/**
 * 构建 code -> Map(date -> bar) 索引。
 */
function buildIndex(contracts) {
  const idx = {};
  for (const code of Object.keys(contracts)) {
    const m = new Map();
    for (const b of contracts[code]) {m.set(b.date, b);}
    idx[code] = m;
  }
  return idx;
}

/** 排序优先级：持仓量 desc -> 成交量 desc -> 合约代码(交割月) asc */
function better(a, b) {
  if (a.oi !== b.oi) {return a.oi > b.oi;}
  if (a.vol !== b.vol) {return a.vol > b.vol;}
  return a.code < b.code;
}

/**
 * 逐日判定主力/次主力。
 * 主力带迟滞（hysteresis）：只有当挑战者持仓量超过当前主力 × hysteresis 才切换，避免噪声导致的频繁抖动；
 * 当前主力到期（无数据）时强制切换。次主力 = 除主力外持仓量最高者。
 * @param {Object} [opts] 选项对象
 * @param {number} [opts.hysteresis] 切换阈值系数，默认 1.15
 * @returns {{mainByDate: Object<string,string|null>, subByDate: Object<string,string|null>}}
 */
function buildMainSub(dates, contracts, opts = {}) {
  const hysteresis = opts.hysteresis != null ? opts.hysteresis : 1.15;
  const idx = buildIndex(contracts);
  const codes = Object.keys(contracts);
  const mainByDate = {};
  const subByDate = {};
  let currentMain = null;
  for (const d of dates) {
    const cands = [];
    for (const c of codes) {
      const b = idx[c].get(d);
      if (b) {cands.push({ code: c, oi: b.openInterest, vol: b.volume, bar: b });}
    }
    if (!cands.length) {
      mainByDate[d] = null;
      subByDate[d] = null;
      continue;
    }
    cands.sort((a, b) => (better(a, b) ? -1 : 1));
    const rawBest = cands[0];
    let main;
    if (!currentMain) {
      main = rawBest.code;
    } else {
      const curBar = idx[currentMain] && idx[currentMain].get(d);
      if (!curBar) {
        main = rawBest.code; // 原主力到期，强制切换
      } else if (rawBest.code === currentMain) {
        main = currentMain;
      } else {
        main = rawBest.oi > curBar.openInterest * hysteresis ? rawBest.code : currentMain;
      }
    }
    currentMain = main;
    let sub = null;
    for (const cand of cands) {
      if (cand.code === main) {continue;}
      sub = cand.code;
      break;
    }
    mainByDate[d] = main;
    subByDate[d] = sub;
  }
  return { mainByDate, subByDate };
}

/**
 * 后复权因子（比值法，锚定最新日期 factor=1）。
 * 在主力切换点 t(主=t 日 A，主=t+1 日 B)：factor[t] = factor[t+1] * close(B, t) / close(A, t)。
 */
function backAdjustFactors(dates, codeByDate, getClose) {
  const T = dates.length;
  const factors = new Array(T).fill(1);
  for (let t = T - 2; t >= 0; t--) {
    const cur = codeByDate[dates[t]];
    const nxt = codeByDate[dates[t + 1]];
    if (cur && nxt && cur !== nxt) {
      const cn = getClose(nxt, dates[t]);
      const co = getClose(cur, dates[t]);
      if (cn != null && co != null && co > 0) {factors[t] = factors[t + 1] * (cn / co);}
      else {factors[t] = factors[t + 1];}
    } else {
      factors[t] = factors[t + 1];
    }
  }
  return factors;
}

/**
 * 计算某品种连续序列（主力/次主力原始价、后复权价、持仓量、展期事件）。
 * 所有数组与 dates 对齐；无数据处为 null。
 */
function continuousSeries(dates, contracts) {
  const { mainByDate, subByDate } = buildMainSub(dates, contracts);
  const idx = buildIndex(contracts);
  const getClose = (code, date) => {
    const b = idx[code] && idx[code].get(date);
    return b ? b.close : null;
  };
  const T = dates.length;
  const mainRaw = new Array(T).fill(null);
  const mainAdj = new Array(T).fill(null);
  const subRaw = new Array(T).fill(null);
  const subAdj = new Array(T).fill(null);
  const mainOi = new Array(T).fill(null);
  const subOi = new Array(T).fill(null);
  const mainVol = new Array(T).fill(null);
  const mainFactors = backAdjustFactors(dates, mainByDate, getClose);
  const subFactors = backAdjustFactors(dates, subByDate, getClose);
  const rolls = [];
  for (let t = 0; t < T; t++) {
    const d = dates[t];
    const mc = mainByDate[d];
    const sc = subByDate[d];
    if (mc) {
      const b = idx[mc].get(d);
      mainRaw[t] = b.close;
      mainOi[t] = b.openInterest;
      mainVol[t] = b.volume;
      mainAdj[t] = mainRaw[t] * mainFactors[t];
    }
    if (sc) {
      const b = idx[sc].get(d);
      subRaw[t] = b.close;
      subOi[t] = b.openInterest;
      subAdj[t] = subRaw[t] * subFactors[t];
    }
    if (t > 0 && mc && mainByDate[dates[t - 1]] && mc !== mainByDate[dates[t - 1]]) {
      const from = mainByDate[dates[t - 1]];
      rolls.push({
        date: d,
        from,
        to: mc,
        fromClose: getClose(from, dates[t - 1]),
        toClose: mainRaw[t],
      });
    }
  }
  return {
    dates: dates.slice(),
    mainCode: mainByDate,
    subCode: subByDate,
    mainRaw,
    mainAdj,
    subRaw,
    subAdj,
    mainOi,
    subOi,
    mainVol,
    rolls,
  };
}

/**
 * 跳空校验：返回后复权序列逐日对数收益率中的最大异常（用于验收「展期复权后无异常跳空」）。
 * 正常情形下后复权序列收益率应接近 0 附近的连续分布，滚动点无跳空。
 */
function maxAbsReturn(prices) {
  const vals = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] != null && prices[i - 1] != null && prices[i - 1] > 0) {
      vals.push(Math.abs(Math.log(prices[i] / prices[i - 1])));
    }
  }
  return vals.length ? Math.max(...vals) : 0;
}

  Object.assign(__exports, { buildIndex, buildMainSub, backAdjustFactors, continuousSeries, maxAbsReturn });
});
__def("factors/factorEngine", function(__req, __exports) {
  const { mean, std, winsorize, zscore } = __req("utils");
  const { parseContractCode } = __req("data/dataAccess");
/**
 * factorEngine.js — 5 因子引擎 (S2: FactorEngine "dll")。纯函数、无未来函数、参数可调。
 *
 * 因子与符号约定（更高 = 更倾向做多；符号可在 S3 配置覆盖）：
 *  1. momentum 截面动量：过去 lookback 日收益，跳过最近 skip 日（默认 120/21，即"12-1 动量"）。
 *  2. liquidity 流动性：-Amihud 非流动性（越高越流动）。Amihud = mean(|ret| / 成交额)。
 *  3. volume 成交量：量比 = 当日成交量 / 过去 ratioWindow 日均量 - 1。
 *  4. skewness 价格偏度：window 日收益率偏度（默认 20）。
 *  5. rollYield 展期收益率：(主力价 - 次主力价)/次主力价，年化（Backwardation 为正）。
 *
 * 所有因子仅用 t 日及之前数据（动量/偏度/流动性用历史窗口；展期收益率用 t 日收盘的
 * 主力与次主力横截面价差，交割日由合约代码决定，非未来信息）。
 * 截面标准化：逐日对各品种因子值 winsorize 后 z-score。
 */




const DEFAULT_FACTOR_PARAMS = {
  momentum: { lookback: 120, skip: 21 },
  liquidity: { amihudWindow: 20 },
  volume: { ratioWindow: 20, momentumLookback: 60 },
  skewness: { window: 20 },
  rollYield: { annualize: true },
  winsorizeK: 2.5,
  crossSectionalZ: true,
};

/** 因子符号默认值（更高 = 更倾向做多） */
const FACTOR_SIGNS = { momentum: 1, liquidity: 1, volume: 1, skewness: 1, rollYield: 1 };

/** 样本偏度 */
function skewness(arr) {
  const n = arr.length;
  if (n < 3) {
    return NaN;
  }
  const m = mean(arr);
  const s = std(arr, 0);
  if (!(s > 0)) {
    return NaN;
  }
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += Math.pow(arr[i] - m, 3);
  }
  return acc / n / Math.pow(s, 3);
}

function asArray(n) {
  return new Array(n).fill(null);
}

/**
 * 计算单品种各因子原始序列（与 dates 对齐，无数据处为 null）。
 */
function computeVarietyFactors(ds, code, params) {
  const series = ds.getSeries(code);
  const dates = ds.dates;
  const T = dates.length;
  const p = params;
  const mom = p.momentum;
  const liq = p.liquidity;
  const vol = p.volume;
  const sk = p.skewness;
  const ry = p.rollYield;

  const out = {
    momentum: asArray(T),
    liquidity: asArray(T),
    volume: asArray(T),
    skewness: asArray(T),
    rollYield: asArray(T),
    turnover: asArray(T),
    amihud: asArray(T),
  };

  // 主连续（后复权）日收益：用于动量/偏度/Amihud
  const ret = asArray(T);
  for (let t = 1; t < T; t++) {
    const a = series.mainAdj[t];
    const b = series.mainAdj[t - 1];
    if (a != null && b != null && b > 0) {
      ret[t] = a / b - 1;
    }
  }

  for (let t = 0; t < T; t++) {
    // ---- momentum (skip 近 1 月) ----
    const iEnd = t - mom.skip;
    const iStart = t - mom.lookback;
    if (
      iStart >= 0 &&
      iEnd >= 0 &&
      series.mainAdj[iEnd] != null &&
      series.mainAdj[iStart] != null &&
      series.mainAdj[iStart] > 0
    ) {
      out.momentum[t] = series.mainAdj[iEnd] / series.mainAdj[iStart] - 1;
    }

    // ---- liquidity: turnover & Amihud ----
    if (
      series.mainRaw[t] != null &&
      series.mainVol[t] != null &&
      series.mainOi[t] != null &&
      series.mainOi[t] > 0
    ) {
      out.turnover[t] = (series.mainRaw[t] * series.mainVol[t]) / series.mainOi[t];
    }
    const w = liq.amihudWindow;
    if (t >= w) {
      let acc = 0;
      let cnt = 0;
      for (let i = t - w + 1; i <= t; i++) {
        const dolVol =
          series.mainRaw[i] != null && series.mainVol[i] != null
            ? series.mainRaw[i] * series.mainVol[i]
            : null;
        if (ret[i] != null && dolVol != null && dolVol > 0) {
          acc += Math.abs(ret[i]) / dolVol;
          cnt++;
        }
      }
      if (cnt > 0) {
        out.amihud[t] = acc / cnt;
      }
    }
    out.liquidity[t] = out.amihud[t] != null ? -out.amihud[t] : null;

    // ---- volume: 量比 ----
    const vw = vol.ratioWindow;
    if (t >= vw && series.mainVol[t] != null) {
      let s = 0;
      let cnt = 0;
      for (let i = t - vw; i < t; i++) {
        if (series.mainVol[i] != null) {
          s += series.mainVol[i];
          cnt++;
        }
      }
      if (cnt > 0 && s > 0) {
        out.volume[t] = series.mainVol[t] / (s / cnt) - 1;
      }
    }

    // ---- skewness ----
    const sw = sk.window;
    if (t >= sw) {
      const win = [];
      for (let i = t - sw + 1; i <= t; i++) {
        if (ret[i] != null) {
          win.push(ret[i]);
        }
      }
      if (win.length >= 10) {
        out.skewness[t] = skewness(win);
      }
    }

    // ---- roll yield ----
    if (series.mainRaw[t] != null && series.subRaw[t] != null && series.subRaw[t] > 0) {
      const mc = series.mainCode[dates[t]];
      const sc = series.subCode[dates[t]];
      if (mc && sc) {
        const dm = parseContractCode(code, mc).delivery;
        const dsc = parseContractCode(code, sc).delivery;
        const dtDays = Math.abs((Date.parse(dsc) - Date.parse(dm)) / 86400000);
        const raw = (series.mainRaw[t] - series.subRaw[t]) / series.subRaw[t];
        out.rollYield[t] = ry.annualize !== false && dtDays > 0 ? raw * (365 / dtDays) : raw;
      }
    }
  }
  return out;
}

/**
 * 截面标准化：对某因子逐日 winsorize + z-score。
 * @returns {Object<string, Array<number|null>>} code -> z 数组
 */
function crossSectionalZ(dates, varieties, rawByCode, winsorizeK) {
  const out = {};
  for (const code of varieties) {
    out[code] = asArray(dates.length);
  }
  for (let t = 0; t < dates.length; t++) {
    const vals = [];
    const idx = [];
    for (const code of varieties) {
      const v = rawByCode[code][t];
      if (v != null && Number.isFinite(v)) {
        vals.push(v);
        idx.push(code);
      }
    }
    if (vals.length < 2) {
      continue;
    }
    const w = winsorize(vals, winsorizeK);
    const z = zscore(w);
    for (let k = 0; k < idx.length; k++) {
      out[idx[k]][t] = z[k];
    }
  }
  return out;
}

class FactorEngine {
  /**
   * 计算全品种因子面板。
   * @returns {{dates, varieties, raw, z, aux, params, signs}}
   */
  compute(ds, params = {}) {
    const p = Object.assign({}, DEFAULT_FACTOR_PARAMS, params, {
      momentum: Object.assign({}, DEFAULT_FACTOR_PARAMS.momentum, params.momentum),
      liquidity: Object.assign({}, DEFAULT_FACTOR_PARAMS.liquidity, params.liquidity),
      volume: Object.assign({}, DEFAULT_FACTOR_PARAMS.volume, params.volume),
      skewness: Object.assign({}, DEFAULT_FACTOR_PARAMS.skewness, params.skewness),
      rollYield: Object.assign({}, DEFAULT_FACTOR_PARAMS.rollYield, params.rollYield),
    });
    const varieties = ds.codes;
    const dates = ds.dates;
    const raw = { momentum: {}, liquidity: {}, volume: {}, skewness: {}, rollYield: {} };
    const aux = { turnover: {}, amihud: {} };
    for (const code of varieties) {
      const f = computeVarietyFactors(ds, code, p);
      for (const k of ['momentum', 'liquidity', 'volume', 'skewness', 'rollYield']) {
        raw[k][code] = f[k];
      }
      aux.turnover[code] = f.turnover;
      aux.amihud[code] = f.amihud;
    }
    const z = {};
    for (const k of ['momentum', 'liquidity', 'volume', 'skewness', 'rollYield']) {
      z[k] = crossSectionalZ(dates, varieties, raw[k], p.winsorizeK);
    }
    return { dates, varieties, raw, z, aux, params: p, signs: Object.assign({}, FACTOR_SIGNS) };
  }
}

  Object.assign(__exports, { DEFAULT_FACTOR_PARAMS, FACTOR_SIGNS, skewness, computeVarietyFactors, crossSectionalZ, FactorEngine });
});
__def("strategy/strategyEngine", function(__req, __exports) {
  const { spearman } = __req("utils");
/**
 * strategyEngine.js — 策略组合与信号生成 (S3: StrategyEngine "dll")。
 * 因子合成 -> 截面排序 -> 多空选品 -> 权重/中性化 -> 调仓(月度/周度 + 缓冲带)。
 * 全部参数可配置，默认等权、长 5 空 5、月度调仓、方向中性。
 */



const DEFAULT_STRATEGY_CONFIG = {
  factors: ['momentum', 'liquidity', 'volume', 'skewness', 'rollYield'],
  factorSigns: { momentum: 1, liquidity: 1, volume: 1, skewness: 1, rollYield: 1 },
  combine: 'equal', // 'equal' | 'ic' | 'custom'
  factorWeights: null, // 自定义权重 {factor: w}；combine='custom' 时生效
  icWindow: 60, // IC 加权：滚动窗口（交易日）
  icHorizon: 5, // IC 加权：前瞻收益天数（已做滞后，无未来函数）
  longCount: 5,
  shortCount: 5,
  mode: 'longShort', // 'longShort'(中性) | 'longOnly'
  weighting: 'equal', // 'equal' | 'score'
  neutral: true, // 方向中性（多空名义额相等）
  rebalance: 'monthly', // 'monthly' | 'weekly'
  rebalanceDays: 21, // 月度=21，周度=5
  buffer: 2, // 缓冲带（排名容忍）
  grossExposure: 1.0, // 总名义敞口 / 权益
  warmup: 120, // 起始调仓所需最小历史
};

/**
 * 计算合成得分面板：score[code][t] = Σ sign_f * w_f * z_f（缺失处为 null）。
 */
function compositeScores(panel, config) {
  const { dates, varieties, z } = panel;
  const factors = config.factors || DEFAULT_STRATEGY_CONFIG.factors;
  const signs = Object.assign({}, config.factorSigns || {});
  const weights = factorWeights(panel, config);
  const score = {};
  for (const code of varieties) {
    score[code] = new Array(dates.length).fill(null);
  }
  for (let t = 0; t < dates.length; t++) {
    for (const code of varieties) {
      let s = 0;
      let cnt = 0;
      for (const f of factors) {
        const zv = z[f] && z[f][code] ? z[f][code][t] : null;
        if (zv == null) {
          continue;
        }
        const sign = signs[f] != null ? signs[f] : 1;
        const w = weights[f] != null ? weights[f] : 0;
        s += sign * w * zv;
        cnt++;
      }
      if (cnt > 0) {
        score[code][t] = s;
      }
    }
  }
  return score;
}

/** 因子权重：equal -> 1/n；custom -> 归一化；ic -> |IC| 归一化（滚动） */
function factorWeights(panel, config) {
  const factors = config.factors || DEFAULT_STRATEGY_CONFIG.factors;
  const n = factors.length;
  const out = {};
  if (config.combine === 'custom' && config.factorWeights) {
    let s = 0;
    for (const f of factors) {
      s += Math.abs(config.factorWeights[f] || 0);
    }
    for (const f of factors) {
      out[f] = s > 0 ? (config.factorWeights[f] || 0) / s : 1 / n;
    }
    return out;
  }
  if (config.combine === 'ic' && panel._icWeights) {
    const ic = panel._icWeights;
    let s = 0;
    for (const f of factors) {
      s += Math.abs(ic[f] || 0);
    }
    if (s > 0) {
      for (const f of factors) {
        out[f] = Math.abs(ic[f] || 0) / s;
      }
      return out;
    }
  }
  for (const f of factors) {
    out[f] = 1 / n;
  }
  return out;
}

/** 滚动 IC（已滞后，无未来函数）：z_f(τ) vs 前瞻 horizon 收益，τ 取 [t-window, t-horizon] */
function computeRollingIC(panel, ds, config) {
  const horizon = config.icHorizon || 5;
  const window = config.icWindow || 60;
  const { dates, varieties, z } = panel;
  const T = dates.length;
  // 前瞻收益 fwd[code][τ] = adjClose[τ+horizon]/adjClose[τ] - 1
  const fwd = {};
  for (const code of varieties) {
    const s = ds.getSeries(code);
    fwd[code] = new Array(T).fill(null);
    for (let t = 0; t + horizon < T; t++) {
      if (s.mainAdj[t] != null && s.mainAdj[t + horizon] != null && s.mainAdj[t] > 0) {
        fwd[code][t] = s.mainAdj[t + horizon] / s.mainAdj[t] - 1;
      }
    }
  }
  // 每个因子、每个调仓日 t：在 [t-window, t-horizon] 内与 fwd 的截面 spearman
  const factors = config.factors || DEFAULT_STRATEGY_CONFIG.factors;
  const icByFactor = {};
  for (const f of factors) {
    icByFactor[f] = new Array(T).fill(null);
  }
  for (let t = window; t < T; t++) {
    for (const f of factors) {
      const xs = [];
      const ys = [];
      for (let tau = t - window + 1; tau <= t - horizon; tau++) {
        for (const code of varieties) {
          const zz = z[f][code][tau];
          const rr = fwd[code][tau];
          if (zz != null && rr != null && Number.isFinite(zz) && Number.isFinite(rr)) {
            xs.push(zz);
            ys.push(rr);
          }
        }
      }
      if (xs.length >= 10) {
        const rho = spearman(xs, ys);
        icByFactor[f][t] = Number.isFinite(rho) ? rho : null;
      }
    }
  }
  return icByFactor;
}

class StrategyEngine {
  /**
   * 生成信号：调仓日目标权重。
   * @returns {{rebalanceDates, targets, composite, config, icByFactor}}
   *   targets: { [date]: { [code]: weight(名义额/权益，正=多，负=空) } }
   */
  generate(panel, ds, config = {}) {
    const cfg = Object.assign({}, DEFAULT_STRATEGY_CONFIG, config);
    const dates = panel.dates;
    const varieties = panel.varieties;
    const factors = cfg.factors || DEFAULT_STRATEGY_CONFIG.factors;

    // IC 权重（可选）
    let icByFactor = null;
    if (cfg.combine === 'ic') {
      icByFactor = computeRollingIC(panel, ds, cfg);
      panel._icWeights = {};
      for (const f of factors) {
        const arr = icByFactor[f];
        // 取最近一个非空 IC 的 |IC| 作为权重
        let w = 0;
        for (let t = arr.length - 1; t >= 0; t--) {
          if (arr[t] != null) {
            w = Math.abs(arr[t]);
            break;
          }
        }
        panel._icWeights[f] = w || 1 / factors.length;
      }
    }

    const score = compositeScores(panel, cfg);

    // 调仓日序列（交易日计数）
    const rebDays = cfg.rebalance === 'weekly' ? cfg.rebalanceDays || 5 : cfg.rebalanceDays || 21;
    const rebalanceDates = [];
    for (let t = cfg.warmup; t < dates.length; t += rebDays) {
      rebalanceDates.push(dates[t]);
    }

    const targets = {};
    let prevLong = new Set();
    let prevShort = new Set();

    for (const date of rebalanceDates) {
      const t = dates.indexOf(date);
      const ranked = [];
      for (const code of varieties) {
        const s = score[code][t];
        if (s != null && Number.isFinite(s)) {
          ranked.push({ code, s });
        }
      }
      if (ranked.length < Math.max(cfg.longCount, cfg.shortCount) + 1) {
        targets[date] = {};
        continue;
      }
      ranked.sort((a, b) => b.s - a.s);

      const longNames = selectSide(ranked, 'long', cfg, prevLong);
      const shortNames = selectSide(ranked, 'short', cfg, prevShort);

      const weights = {};
      const gross = cfg.grossExposure || 1.0;
      const sideGross = cfg.neutral && cfg.mode === 'longShort' ? gross / 2 : gross;
      assignWeights(weights, longNames, +sideGross, cfg, score, t);
      assignWeights(weights, shortNames, -sideGross, cfg, score, t);

      targets[date] = weights;
      prevLong = new Set(longNames);
      prevShort = new Set(shortNames);
    }

    return { rebalanceDates, targets, composite: score, config: cfg, icByFactor };
  }
}

/** 缓冲带选品 */
function selectSide(ranked, side, cfg, prev) {
  const n = side === 'long' ? cfg.longCount : cfg.shortCount;
  const buffer = cfg.buffer || 0;
  const pool =
    side === 'long' ? ranked.slice(0, n + buffer) : ranked.slice(-(n + buffer)).reverse();
  const poolSet = new Set(pool.map((x) => x.code));
  const kept = pool.filter((x) => prev.has(x.code)).slice(0, n);
  const keptSet = new Set(kept.map((x) => x.code));
  const filled = [];
  for (const x of pool) {
    if (filled.length >= n - kept.length) {
      break;
    }
    if (!keptSet.has(x.code)) {
      filled.push(x);
    }
  }
  const chosen = kept.concat(filled).map((x) => x.code);
  // 若仍不足 n，从 pool 外补
  if (chosen.length < n) {
    const rest = side === 'long' ? ranked : ranked.slice().reverse();
    for (const x of rest) {
      if (chosen.length >= n) {
        break;
      }
      if (!chosen.includes(x.code) && poolSet.has(x.code)) {
        continue;
      }
      if (!chosen.includes(x.code)) {
        chosen.push(x.code);
      }
    }
  }
  return chosen.slice(0, n);
}

function assignWeights(weights, names, sideGross, cfg, score, t) {
  if (!names.length) {
    return;
  }
  if (cfg.weighting === 'score') {
    let s = 0;
    for (const code of names) {
      s += Math.abs(score[code][t] || 0);
    }
    if (s > 0) {
      for (const code of names) {
        weights[code] = (sideGross * Math.abs(score[code][t] || 0)) / s;
      }
      return;
    }
  }
  for (const code of names) {
    weights[code] = sideGross / names.length;
  }
}

  Object.assign(__exports, { DEFAULT_STRATEGY_CONFIG, compositeScores, factorWeights, computeRollingIC, StrategyEngine });
});
__def("backtest/backtestEngine", function(__req, __exports) {
/**
 * backtestEngine.js — 期货回测引擎 (S4: BacktestEngine "dll")。
 * 组合核算：现金、保证金占用、持仓市值、浮动盈亏、权益；逐日盯市；
 * 展期滚动（主力切换自动换月）；交易成本（双边手续费 + 滑点）；保证金约束。
 * 撮合：信号 t 日生成，t+delay 日收盘成交（默认 delay=1，无前视）。
 */

const DEFAULT_BACKTEST_CONFIG = {
  initialCapital: 10_000_000,
  commissionRate: 0.0002, // 单边手续费率（按名义额）
  slippageTicks: 1, // 单边滑点（跳）
  executionDelay: 1, // 成交延迟（交易日）：1 = 次日收盘成交
  maxLeverage: 1.5, // 总保证金 / 权益 上限
  useAdjPrice: true, // 盈亏按后复权主连续价（消除展期跳空）
  impactCoef: 0, // 冲击成本系数（平方根模型，0=关闭，保持逐位一致）
  advWindow: 20, // 冲击成本的日均成交量窗口
  drawdownCutoff: 0, // 回撤熔断阈值（0=关闭；如 0.2 = 回撤 20% 时全部平仓）
};

class BacktestEngine {
  /**
   * @param {DataAccess} ds
   * @param {{rebalanceDates: string[], targets: Object<string,Object<string,number>>}} strategy
   * @returns 回测结果（权益曲线、交易明细、展期记录、每日快照）
   */
  run(ds, strategy, config = {}) {
    const cfg = Object.assign({}, DEFAULT_BACKTEST_CONFIG, config);
    const dates = ds.dates;
    const T = dates.length;
    const metaOf = (code) => ds.getMeta(code);
    const seriesCache = {};
    const S = (code) => (seriesCache[code] = seriesCache[code] || ds.getSeries(code));

    // 每个品种最后一个有效主连续价的下标（用于退市强平）
    const lastValidIdx = {};
    for (const code of ds.codes) {
      const s = S(code);
      let li = null;
      for (let t = 0; t < T; t++) {
        if (s.mainAdj[t] != null) {
          li = t;
        }
      }
      lastValidIdx[code] = li;
    }

    // 展期事件索引：code -> Map(date -> roll)
    const rollByDate = {};
    for (const code of ds.codes) {
      const m = new Map();
      for (const r of S(code).rolls) {
        m.set(r.date, r);
      }
      rollByDate[code] = m;
    }

    let cash = cfg.initialCapital;
    const positions = {}; // code -> {lots, dir, entryAdj, entryRaw, contract}
    const trades = [];
    const rolls = [];
    const equityArr = new Array(T).fill(null);
    const snapshots = new Array(T).fill(null);

    let pending = null; // {execIdx, targets}
    let peakEquity = cfg.initialCapital;
    let circuitBroken = false;

    // 日均成交量（过去 advWindow 日，严格历史，无前视）
    const advLots = (code, t) => {
      const s = S(code);
      const w = cfg.advWindow || 20;
      let sum = 0;
      let cnt = 0;
      for (let i = Math.max(0, t - w); i < t; i++) {
        if (s.mainVol[i] != null) {
          sum += s.mainVol[i];
          cnt++;
        }
      }
      return cnt > 0 ? sum / cnt : 0;
    };

    // 成本 = 手续费 + 滑点 + 冲击（平方根模型，可选）
    const legCost = (code, t, meta, price, lots) => {
      let c =
        cfg.commissionRate * price * meta.mult * lots + cfg.slippageTicks * meta.tickValue * lots;
      if (cfg.impactCoef > 0) {
        const adv = advLots(code, t);
        if (adv > 0) {
          c += cfg.impactCoef * price * meta.mult * lots * Math.sqrt(lots / adv);
        }
      }
      return c;
    };

    // 计算当前浮动盈亏 / 权益 / 保证金占用 / 可用资金
    const stats = (t) => {
      let floatingPnL = 0;
      let usedMargin = 0;
      let gross = 0;
      for (const code of Object.keys(positions)) {
        const pos = positions[code];
        const s = S(code);
        const meta = metaOf(code);
        const adjT = s.mainAdj[t];
        const rawT = s.mainRaw[t];
        if (adjT != null) {
          floatingPnL += pos.dir * (adjT - pos.entryAdj) * meta.mult * pos.lots;
        }
        if (rawT != null) {
          usedMargin += pos.lots * rawT * meta.mult * meta.margin;
          gross += pos.lots * rawT * meta.mult;
        }
      }
      const equity = cash + floatingPnL;
      return { floatingPnL, usedMargin, gross, equity, available: equity - usedMargin };
    };

    // 退市强平：数据结束后按最后有效价平仓
    const liquidateDelisted = (t, date) => {
      for (const code of Object.keys(positions)) {
        const s = S(code);
        if (s.mainAdj[t] != null) {
          continue;
        }
        const li = lastValidIdx[code];
        if (li == null) {
          delete positions[code];
          continue;
        }
        const pos = positions[code];
        const meta = metaOf(code);
        const adjP = s.mainAdj[li];
        const rawP = s.mainRaw[li] != null ? s.mainRaw[li] : pos.entryRaw;
        const pnl = pos.dir * (adjP - pos.entryAdj) * meta.mult * pos.lots;
        const cost = legCost(code, t, meta, rawP, pos.lots);
        cash += pnl - cost;
        trades.push({
          date,
          code,
          side: 'close',
          dir: pos.dir,
          lots: pos.lots,
          price: rawP,
          adjPrice: adjP,
          notional: rawP * meta.mult * pos.lots,
          cost,
          pnl,
          contract: pos.contract,
          reason: 'delist',
        });
        delete positions[code];
      }
    };

    // 展期滚动：主力切换自动换月（平旧开新），盈亏连续（后复权），仅计换月成本
    const processRolls = (t, date) => {
      for (const code of Object.keys(positions)) {
        const roll = rollByDate[code] && rollByDate[code].get(date);
        if (!roll) {
          continue;
        }
        const pos = positions[code];
        const meta = metaOf(code);
        const oldRaw = roll.fromClose != null ? roll.fromClose : pos.entryRaw;
        const newRaw = roll.toClose != null ? roll.toClose : pos.entryRaw;
        const cost =
          legCost(code, t, meta, oldRaw, pos.lots) + legCost(code, t, meta, newRaw, pos.lots);
        cash -= cost;
        pos.contract = roll.to;
        pos.entryRaw = newRaw;
        rolls.push({ date, code, from: roll.from, to: roll.to, lots: pos.lots, cost });
      }
    };

    // 交易到目标（含手续费/滑点/已实现盈亏/平均成本）
    const tradeTo = (date, t, code, targetLots, targetDir, targetContract) => {
      const meta = metaOf(code);
      const s = S(code);
      const rawT = s.mainRaw[t];
      const adjT = s.mainAdj[t];
      const cur = positions[code];
      const curLots = cur ? cur.lots : 0;
      const curDir = cur ? cur.dir : 0;

      if (targetLots === 0 && curLots === 0) {
        return;
      }
      if (targetLots === 0) {
        const pnl = curDir * (adjT - cur.entryAdj) * meta.mult * curLots;
        const cost = legCost(code, t, meta, rawT, curLots);
        cash += pnl - cost;
        trades.push({
          date,
          code,
          side: 'close',
          dir: curDir,
          lots: curLots,
          price: rawT,
          adjPrice: adjT,
          notional: rawT * meta.mult * curLots,
          cost,
          pnl,
          contract: cur.contract,
          reason: 'rebalance',
        });
        delete positions[code];
        return;
      }
      if (curLots === 0) {
        const cost = legCost(code, t, meta, rawT, targetLots);
        cash -= cost;
        positions[code] = {
          lots: targetLots,
          dir: targetDir,
          entryAdj: adjT,
          entryRaw: rawT,
          contract: targetContract,
        };
        trades.push({
          date,
          code,
          side: 'open',
          dir: targetDir,
          lots: targetLots,
          price: rawT,
          adjPrice: adjT,
          notional: rawT * meta.mult * targetLots,
          cost,
          pnl: 0,
          contract: targetContract,
          reason: 'rebalance',
        });
        return;
      }
      if (curDir === targetDir) {
        if (targetLots > curLots) {
          const add = targetLots - curLots;
          const cost = legCost(code, t, meta, rawT, add);
          cash -= cost;
          positions[code] = {
            lots: targetLots,
            dir: targetDir,
            entryAdj: (cur.lots * cur.entryAdj + add * adjT) / targetLots,
            entryRaw: (cur.lots * cur.entryRaw + add * rawT) / targetLots,
            contract: targetContract,
          };
          trades.push({
            date,
            code,
            side: 'add',
            dir: targetDir,
            lots: add,
            price: rawT,
            adjPrice: adjT,
            notional: rawT * meta.mult * add,
            cost,
            pnl: 0,
            contract: targetContract,
            reason: 'rebalance',
          });
        } else if (targetLots < curLots) {
          const close = curLots - targetLots;
          const pnl = curDir * (adjT - cur.entryAdj) * meta.mult * close;
          const cost = legCost(code, t, meta, rawT, close);
          cash += pnl - cost;
          positions[code] = {
            lots: targetLots,
            dir: targetDir,
            entryAdj: cur.entryAdj,
            entryRaw: cur.entryRaw,
            contract: targetContract,
          };
          trades.push({
            date,
            code,
            side: 'reduce',
            dir: curDir,
            lots: close,
            price: rawT,
            adjPrice: adjT,
            notional: rawT * meta.mult * close,
            cost,
            pnl,
            contract: cur.contract,
            reason: 'rebalance',
          });
        }
        return;
      }
      // 方向翻转
      const pnlClose = curDir * (adjT - cur.entryAdj) * meta.mult * curLots;
      const costClose = legCost(code, t, meta, rawT, curLots);
      const costOpen = legCost(code, t, meta, rawT, targetLots);
      cash += pnlClose - costClose - costOpen;
      positions[code] = {
        lots: targetLots,
        dir: targetDir,
        entryAdj: adjT,
        entryRaw: rawT,
        contract: targetContract,
      };
      trades.push({
        date,
        code,
        side: 'flip',
        dir: `${curDir}->${targetDir}`,
        lots: curLots,
        lotsNew: targetLots,
        price: rawT,
        adjPrice: adjT,
        notional: rawT * meta.mult * (curLots + targetLots),
        cost: costClose + costOpen,
        pnl: pnlClose,
        contract: targetContract,
        reason: 'rebalance',
      });
    };

    // 执行调仓
    const executeRebalance = (t, date, targets) => {
      const st = stats(t);
      if (st.equity <= 0) {
        // 爆仓：全部平仓
        for (const code of Object.keys(positions)) {
          tradeTo(date, t, code, 0, 0, null);
        }
        return;
      }
      // 目标手数
      const desired = {};
      for (const code of Object.keys(targets)) {
        const w = targets[code];
        const meta = metaOf(code);
        const s = S(code);
        const rawT = s.mainRaw[t];
        if (rawT == null || !(rawT > 0)) {
          continue;
        }
        const notional = Math.abs(w) * st.equity;
        const lots = Math.floor(notional / (rawT * meta.mult));
        if (lots <= 0) {
          continue;
        }
        desired[code] = { lots, dir: w > 0 ? 1 : -1, contract: s.mainCode[date] };
      }
      // 保证金约束：总保证金 <= 权益 * maxLeverage
      let totalMargin = 0;
      for (const code of Object.keys(desired)) {
        const d = desired[code];
        const meta = metaOf(code);
        totalMargin += d.lots * S(code).mainRaw[t] * meta.mult * meta.margin;
      }
      const cap = st.equity * (cfg.maxLeverage || 1.5);
      if (totalMargin > cap) {
        const f = cap / totalMargin;
        for (const code of Object.keys(desired)) {
          desired[code].lots = Math.floor(desired[code].lots * f);
        }
      }
      // 交易到目标
      const allCodes = new Set([...Object.keys(positions), ...Object.keys(desired)]);
      for (const code of allCodes) {
        const d = desired[code];
        tradeTo(date, t, code, d ? d.lots : 0, d ? d.dir : 0, d ? d.contract : null);
      }
    };

    const rebSet = new Set(strategy.rebalanceDates);
    for (let t = 0; t < T; t++) {
      const date = dates[t];

      // 1) 退市强平
      liquidateDelisted(t, date);
      // 2) 展期滚动
      processRolls(t, date);
      // 3) 执行待成交调仓（收盘价成交）
      if (pending && pending.execIdx === t) {
        executeRebalance(t, date, pending.targets);
        pending = null;
      }
      // 4) 计划新调仓（信号 t 日生成，t+delay 成交；熔断后停止）
      if (rebSet.has(date) && !pending && !circuitBroken) {
        const execIdx = Math.min(t + (cfg.executionDelay || 1), T - 1);
        pending = { execIdx, targets: strategy.targets[date] || {} };
      }

      // 5) 快照
      const st = stats(t);
      equityArr[t] = st.equity;
      snapshots[t] = {
        date,
        equity: st.equity,
        cash,
        floatingPnL: st.floatingPnL,
        usedMargin: st.usedMargin,
        available: st.available,
        grossNotional: st.gross,
        nav: st.equity / cfg.initialCapital,
        nPositions: Object.keys(positions).length,
      };

      // 6) 回撤熔断（可选）：回撤超阈值则全部平仓
      if (st.equity > peakEquity) {
        peakEquity = st.equity;
      }
      if (!circuitBroken && cfg.drawdownCutoff > 0) {
        const dd = peakEquity > 0 ? (peakEquity - st.equity) / peakEquity : 0;
        if (dd >= cfg.drawdownCutoff) {
          for (const code of Object.keys(positions)) {
            tradeTo(date, t, code, 0, 0, null);
          }
          circuitBroken = true;
        }
      }
    }

    const final = stats(T - 1);
    const totalCost = trades.reduce((a, x) => a + (x.cost || 0), 0);
    const totalRollCost = rolls.reduce((a, x) => a + (x.cost || 0), 0);
    return {
      dates,
      equity: equityArr,
      snapshots,
      trades,
      rolls,
      positions,
      config: cfg,
      summary: {
        initialCapital: cfg.initialCapital,
        finalEquity: final.equity,
        totalCost,
        totalRollCost,
        nTrades: trades.length,
        nRolls: rolls.length,
        circuitBroken,
      },
    };
  }
}

  Object.assign(__exports, { DEFAULT_BACKTEST_CONFIG, BacktestEngine });
});
__def("performance/performanceEngine", function(__req, __exports) {
  const { std } = __req("utils");
/**
 * performanceEngine.js — 绩效与基准对比 (S5: PerformanceEngine "dll")。
 * 指标：年化收益率、Sharpe、最大回撤、卡玛、波动率、胜率（公式定义见 docs/06）。
 * 基准：纳指100 长线年化收益率（可配置常数，默认 15%），非逐日曲线。
 * 对比：超额收益 = 策略年化 - 基准年化；结论：跑赢/跑输/接近。
 */



const DEFAULT_BENCHMARK = {
  annual: 0.15,
  name: '纳指100 长线年化',
  note: '基准为可配置常数（默认 15%，约 10 年口径）；非逐日曲线，仅代表长线收益率参照。',
};

const DEFAULT_PERF_CONFIG = {
  riskFreeRate: 0,
  benchmarkAnnual: 0.15,
  benchmarkName: DEFAULT_BENCHMARK.name,
  benchmarkNote: DEFAULT_BENCHMARK.note,
  verdictThreshold: 0.02, // ±2pp 判定"接近"
  tradingDaysPerYear: 252,
};

class PerformanceEngine {
  /**
   * @param {Array<number|null>} equity 每日权益（与 dates 对齐）
   * @param {Array<string>} dates 日期
   */
  compute(equity, dates, config = {}) {
    const cfg = Object.assign({}, DEFAULT_PERF_CONFIG, config);
    const initialCapital = equity[0] != null ? equity[0] : 1;
    const nav = equity.map((e) => (e != null && initialCapital > 0 ? e / initialCapital : null));

    const rets = [];
    for (let i = 1; i < nav.length; i++) {
      if (nav[i] != null && nav[i - 1] != null && nav[i - 1] > 0) {
        rets.push(nav[i] / nav[i - 1] - 1);
      }
    }
    const n = rets.length;
    const first = nav.find((x) => x != null);
    const last = nav[nav.length - 1] != null ? nav[nav.length - 1] : first;
    const totalReturn = first > 0 ? last / first - 1 : 0;

    const annualizedReturn =
      n > 0 && first > 0 ? Math.pow(last / first, cfg.tradingDaysPerYear / n) - 1 : 0;
    const volatility = n > 0 ? std(rets) * Math.sqrt(cfg.tradingDaysPerYear) : 0;
    const sharpe = volatility > 0 ? (annualizedReturn - cfg.riskFreeRate) / volatility : 0;

    // 最大回撤
    let peak = -Infinity;
    let maxDD = 0;
    for (const v of nav) {
      if (v == null) {
        continue;
      }
      if (v > peak) {
        peak = v;
      }
      const dd = peak > 0 ? (peak - v) / peak : 0;
      if (dd > maxDD) {
        maxDD = dd;
      }
    }
    const calmar = maxDD > 0 ? annualizedReturn / maxDD : 0;
    const winRate = n > 0 ? rets.filter((r) => r > 0).length / n : 0;

    // 基准（常数 + 复利参考线）
    const annual = cfg.benchmarkAnnual != null ? cfg.benchmarkAnnual : 0.15;
    const benchmarkNav = nav.map((_, i) => Math.pow(1 + annual, i / cfg.tradingDaysPerYear));
    const benchmarkFinal = benchmarkNav[nav.length - 1];

    const excess = annualizedReturn - annual;
    const verdict =
      excess > cfg.verdictThreshold ? '跑赢' : excess < -cfg.verdictThreshold ? '跑输' : '接近';

    return {
      dates,
      nav,
      benchmarkNav,
      metrics: {
        totalReturn,
        annualizedReturn,
        volatility,
        sharpe,
        maxDrawdown: maxDD,
        calmar,
        winRate,
        nDays: n,
      },
      benchmark: {
        annual,
        name: cfg.benchmarkName,
        note: cfg.benchmarkNote,
        finalValue: benchmarkFinal,
      },
      comparison: {
        excess,
        verdict,
        threshold: cfg.verdictThreshold,
        strategyAnnual: annualizedReturn,
        benchmarkAnnual: annual,
      },
    };
  }
}

  Object.assign(__exports, { DEFAULT_BENCHMARK, DEFAULT_PERF_CONFIG, PerformanceEngine });
});
__def("types", function(__req, __exports) {
/**
 * types.js — 共享常量与枚举 (shared constants / enums).
 *
 * 约定 (bundler convention):
 *  - 仅使用命名导出 (inline named exports: export function/const/class)。
 *  - 仅使用 `import { ... } from './x.js';` 静态导入，无循环依赖、无 default export。
 */

/** 板块 (sectors) */
const SECTORS = ['黑色', '有色', '能化', '农产品', '贵金属'];

/** 5 因子键 (factor keys) */
const FACTOR_KEYS = ['momentum', 'liquidity', 'volume', 'skewness', 'rollYield'];

/** 因子中文名 */
const FACTOR_NAMES = {
  momentum: '截面动量',
  liquidity: '流动性',
  volume: '成交量',
  skewness: '价格偏度',
  rollYield: '展期收益率',
};

/** 因子注册表（配置驱动：元数据集中登记，新增因子在此加一条即可被报告/UI 引用） */
const FACTOR_REGISTRY = {
  momentum: {
    key: 'momentum',
    name: '截面动量',
    sign: 1,
    description: '过去 120 日收益，跳过近 1 月（12-1 动量）',
  },
  liquidity: {
    key: 'liquidity',
    name: '流动性',
    sign: 1,
    description: '-Amihud 非流动性（越高越流动）',
  },
  volume: {
    key: 'volume',
    name: '成交量',
    sign: 1,
    description: '量比 = 当日成交量 / 过去 20 日均量 - 1',
  },
  skewness: { key: 'skewness', name: '价格偏度', sign: 1, description: '20 日收益率偏度' },
  rollYield: {
    key: 'rollYield',
    name: '展期收益率',
    sign: 1,
    description: '(主力价 - 次主力价)/次主力价，年化',
  },
};

/** 持仓方向 (position direction) */
const DIRECTION = {
  LONG: 1,
  SHORT: -1,
  FLAT: 0,
};

/** 交易所集合 (exchanges) */
const EXCHANGES = ['SHFE', 'DCE', 'CZCE', 'INE', 'GFEX'];

  Object.assign(__exports, { SECTORS, FACTOR_KEYS, FACTOR_NAMES, FACTOR_REGISTRY, DIRECTION, EXCHANGES });
});
__def("factors/newsSentiment", function(__req, __exports) {
  const { rngFromString } = __req("utils");
/**
 * newsSentiment.js — 新闻情绪因子引擎（方案 A 新增，S2 的第 6 个因子）。
 * 纯函数、无未来函数：只用 ts <= now 的新闻，指数衰减加权，带「一致性」置信度。
 *
 * 新闻记录 schema（由 Python 采集/打标层产出，见 docs/10）：
 *   { ts: "2026-08-14T09:35:00+08:00" | epochMs, source, title, content,
 *     tags: ["RB", ...], sentiment: -1..1, label: "bullish"|"bearish"|"neutral" }
 *
 * 因子公式（品种 c 在时刻 now，回看 lookbackHours）：
 *   weight_i = exp(-lambda * hours(ts_i, now))
 *   score    = Σ(sentiment_i * weight_i) / Σ(weight_i)          # 情绪加权均值
 *   agreement= max(bull,bear,neutral) / n                       # 一致性
 *   factor   = score * (0.5 + 0.5 * agreement)                  # 一致性折减
 */



/** 解析时间戳：number 视为 epoch ms，字符串用 Date.parse */
function parseTs(x) {
  if (typeof x === 'number') {
    return x;
  }
  return Date.parse(x);
}

function hoursBetween(tsA, tsB) {
  return (tsB - tsA) / 3600000;
}

function labelToScore(label) {
  if (label === 'bullish') {
    return 1;
  }
  if (label === 'bearish') {
    return -1;
  }
  return 0;
}

/** 单品种在某时刻的情绪统计 */
function sentimentFactor(items, code, nowTs, opts = {}) {
  const lookbackH = opts.lookbackHours != null ? opts.lookbackHours : 4;
  const lambda = opts.decayLambda != null ? opts.decayLambda : 0.05;
  const lo = nowTs - lookbackH * 3600000;
  let num = 0;
  let den = 0;
  let bull = 0;
  let bear = 0;
  let neu = 0;
  let n = 0;
  for (const it of items) {
    const ts = parseTs(it.ts);
    if (!(ts <= nowTs) || ts < lo) {
      continue;
    }
    if (!it.tags || !it.tags.includes(code)) {
      continue;
    }
    const w = Math.exp(-lambda * Math.max(0, hoursBetween(ts, nowTs)));
    const s = typeof it.sentiment === 'number' ? it.sentiment : labelToScore(it.label);
    num += s * w;
    den += w;
    n++;
    if (s > 0.2) {
      bull++;
    } else if (s < -0.2) {
      bear++;
    } else {
      neu++;
    }
  }
  if (n === 0) {
    return null;
  }
  const score = den > 0 ? num / den : 0;
  const agreement = Math.max(bull, bear, neu) / n;
  return {
    score,
    coverage: n,
    agreement,
    factor: score * (0.5 + 0.5 * agreement),
    bull,
    bear,
    neutral: neu,
  };
}

/**
 * 逐日情绪聚合（对齐日线面板）：每个交易日取收盘时刻 15:00 作为 now，回看 lookbackHours。
 * @returns {Object<string, Array<number|null>>} code -> factor 数组（与 dates 对齐）
 */
function dailySentimentByDate(items, codes, dates, opts = {}) {
  const closeTime = opts.closeTime || 'T15:00:00+08:00';
  const out = {};
  for (const code of codes) {
    out[code] = new Array(dates.length).fill(null);
  }
  for (let t = 0; t < dates.length; t++) {
    const nowTs = parseTs(dates[t] + closeTime);
    for (const code of codes) {
      const r = sentimentFactor(items, code, nowTs, opts);
      out[code][t] = r ? r.factor : null;
    }
  }
  return out;
}

class NewsSentimentEngine {
  /**
   * 计算每个品种在每条时间戳上的情绪因子。
   * @param {Array} items 新闻记录
   * @param {Array<string>} codes 品种代码
   * @param {Array} timestamps 时间戳数组（升序，可为 ISO 字符串或 epoch ms）
   * @returns {Object<string, Array<number|null>>} code -> factor 数组（与 timestamps 对齐）
   */
  compute(items, codes, timestamps, opts = {}) {
    const out = {};
    for (const code of codes) {
      out[code] = new Array(timestamps.length).fill(null);
    }
    for (let t = 0; t < timestamps.length; t++) {
      const nowTs = parseTs(timestamps[t]);
      for (const code of codes) {
        const r = sentimentFactor(items, code, nowTs, opts);
        out[code][t] = r ? r.factor : null;
      }
    }
    return out;
  }
}

/** 默认品种新闻倾向（演示用） */
const DEFAULT_LEAN = {
  RB: 0.5,
  HC: 0.4,
  I: 0.4,
  J: 0.3,
  CU: 0.4,
  AL: 0.3,
  ZN: 0.2,
  AU: -0.4,
  AG: -0.3,
  M: -0.4,
  C: -0.3,
  CF: -0.2,
  SR: -0.3,
  SC: 0.4,
  MA: 0.2,
  TA: -0.2,
  Y: -0.2,
  P: -0.2,
  OI: -0.1,
  RM: -0.2,
  FG: -0.2,
  SA: 0.1,
  PB: 0.1,
  NI: 0.2,
  SN: 0.1,
  SS: 0.2,
  BU: 0.1,
  PP: 0.1,
  L: 0.1,
  V: 0.1,
  EG: 0.1,
  EB: 0.1,
  FU: 0.2,
  RU: 0.1,
  SF: 0.1,
  SM: 0.1,
  AO: 0.2,
  JM: 0.3,
  CS: -0.1,
  AP: -0.2,
  JD: -0.1,
};

/** 生成确定性演示新闻（30 分钟间隔），用于 UI/离线验证。 */
function generateMockNews(codes, opts = {}) {
  const rng = rngFromString(opts.seed || 'mock-news');
  const now = opts.nowTs != null ? opts.nowTs : Date.now();
  const n = opts.nIntervals || 8;
  const step = opts.intervalMs || 30 * 60000;
  const lean = opts.lean || DEFAULT_LEAN;
  const items = [];
  for (const code of codes) {
    for (let k = 0; k < n; k++) {
      if (rng() < 0.5) {
        continue;
      }
      const base = lean[code] || 0;
      const s = Math.max(-1, Math.min(1, base + (rng() - 0.5) * 0.8));
      items.push({
        ts: now - (n - 1 - k) * step,
        source: 'mock',
        title: `${code} 快讯`,
        tags: [code],
        sentiment: s,
        label: s > 0.2 ? 'bullish' : s < -0.2 ? 'bearish' : 'neutral',
      });
    }
  }
  return items;
}

  Object.assign(__exports, { parseTs, hoursBetween, labelToScore, sentimentFactor, dailySentimentByDate, NewsSentimentEngine, DEFAULT_LEAN, generateMockNews });
});
__def("trend/trendPredictor", function(__req, __exports) {
/**
 * trendPredictor.js — 趋势预测（方案 A 新增）：日线因子（慢信号）+ 新闻情绪因子（快信号）融合。
 * 输出每个品种的趋势得分 / 方向 / 强度，用于 30 分钟级趋势预测。
 */

class TrendPredictor {
  /**
   * @param {Object<string, number>} dailyScoreByCode 日线合成得分（已截面标准化，如 composite z）
   * @param {Object<string, number>} newsZByCode 新闻情绪因子 z 值（当前时刻，截面标准化后）
   * @param {Object} config { wDaily=1, wNews=0.5, threshold=0.25 }
   * @returns {Array<{code, score, direction, strength, daily, news}>} 按 score 降序
   */
  predict(dailyScoreByCode, newsZByCode, config = {}) {
    const wDaily = config.wDaily != null ? config.wDaily : 1.0;
    const wNews = config.wNews != null ? config.wNews : 0.5;
    const threshold = config.threshold != null ? config.threshold : 0.25;
    const out = [];
    for (const code of Object.keys(dailyScoreByCode)) {
      const d = dailyScoreByCode[code] != null ? dailyScoreByCode[code] : 0;
      const n = newsZByCode[code] != null ? newsZByCode[code] : 0;
      const score = wDaily * d + wNews * n;
      const direction = score > threshold ? 1 : score < -threshold ? -1 : 0;
      out.push({ code, score, direction, strength: Math.abs(score), daily: d, news: n });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }
}

  Object.assign(__exports, { TrendPredictor });
});
__def("research/factorAnalysis", function(__req, __exports) {
  const { mean, pearson, spearman } = __req("utils");
/**
 * factorAnalysis.js — alphalens 式因子研究流水线（Phase 2）。
 * 分层收益 / IC 序列与衰减 / 换手率 / 因子相关性矩阵 / 正交化（Gram-Schmidt 截面）。
 */


/** 未来 horizon 日收益：fwd[code][t] = P[t+horizon]/P[t]-1 */
function forwardReturns(ds, codes, dates, horizon) {
  const fwd = {};
  for (const code of codes) {
    const s = ds.getSeries(code);
    fwd[code] = new Array(dates.length).fill(null);
    for (let t = 0; t + horizon < dates.length; t++) {
      if (s.mainAdj[t] != null && s.mainAdj[t + horizon] != null && s.mainAdj[t] > 0) {
        fwd[code][t] = s.mainAdj[t + horizon] / s.mainAdj[t] - 1;
      }
    }
  }
  return fwd;
}

/** 分层收益：按因子 z 分 nQuantiles 组，各组未来 horizon 日收益均值 + 多空价差 */
function quantileReturns(panel, ds, factorKey, nQuantiles = 5, horizon = 5) {
  const dates = panel.dates;
  const codes = panel.varieties;
  const z = panel.z[factorKey];
  const fwd = forwardReturns(ds, codes, dates, horizon);
  const groups = new Array(nQuantiles).fill(null).map(() => []);
  for (let t = 0; t + horizon < dates.length; t++) {
    const rows = [];
    for (const code of codes) {
      const zv = z[code][t];
      const fv = fwd[code][t];
      if (zv != null && fv != null && Number.isFinite(zv) && Number.isFinite(fv)) {
        rows.push({ zv, fv });
      }
    }
    if (rows.length < nQuantiles) {
      continue;
    }
    rows.sort((a, b) => a.zv - b.zv);
    const per = Math.floor(rows.length / nQuantiles);
    for (let q = 0; q < nQuantiles; q++) {
      const group = q === nQuantiles - 1 ? rows.slice(q * per) : rows.slice(q * per, (q + 1) * per);
      groups[q].push(mean(group.map((r) => r.fv)));
    }
  }
  const q = groups.map((g) => mean(g));
  return { quantiles: q, spread: q[nQuantiles - 1] - q[0], horizon, nQuantiles };
}

/** 逐日截面 IC（Spearman）序列 */
function icSeries(panel, ds, factorKey, horizon = 5) {
  const dates = panel.dates;
  const codes = panel.varieties;
  const z = panel.z[factorKey];
  const fwd = forwardReturns(ds, codes, dates, horizon);
  const ics = [];
  for (let t = 0; t + horizon < dates.length; t++) {
    const xs = [];
    const ys = [];
    for (const code of codes) {
      const zv = z[code][t];
      const fv = fwd[code][t];
      if (zv != null && fv != null && Number.isFinite(zv) && Number.isFinite(fv)) {
        xs.push(zv);
        ys.push(fv);
      }
    }
    if (xs.length >= 8) {
      const r = spearman(xs, ys);
      if (Number.isFinite(r)) {
        ics.push(r);
      }
    }
  }
  return ics;
}

/** IC 衰减：多 horizon 的 IC */
function icDecay(panel, ds, factorKey, horizons = [1, 2, 3, 5, 10, 20]) {
  return horizons.map((h) => ({ horizon: h, ic: mean(icSeries(panel, ds, factorKey, h)) }));
}

/** top N 组合平均换手率（每日名字变化比例） */
function topTurnover(panel, factorKey, topN = 5) {
  const dates = panel.dates;
  const codes = panel.varieties;
  const z = panel.z[factorKey];
  let prev = null;
  const turnovers = [];
  for (let t = 0; t < dates.length; t++) {
    const rows = [];
    for (const code of codes) {
      const zv = z[code][t];
      if (zv != null && Number.isFinite(zv)) {
        rows.push({ code, zv });
      }
    }
    if (rows.length < topN) {
      continue;
    }
    rows.sort((a, b) => b.zv - a.zv);
    const top = new Set(rows.slice(0, topN).map((r) => r.code));
    if (prev) {
      let changed = 0;
      for (const c of top) {
        if (!prev.has(c)) {
          changed++;
        }
      }
      turnovers.push(changed / topN);
    }
    prev = top;
  }
  return mean(turnovers);
}

/** 因子相关性矩阵（截面 Pearson 的时序均值） */
function factorCorrelation(panel, factors) {
  const dates = panel.dates;
  const codes = panel.varieties;
  const acc = {};
  for (const f of factors) {
    acc[f] = {};
    for (const g of factors) {
      acc[f][g] = [];
    }
  }
  for (let t = 0; t < dates.length; t++) {
    for (let i = 0; i < factors.length; i++) {
      for (let j = i; j < factors.length; j++) {
        const a = factors[i];
        const b = factors[j];
        const xs = [];
        const ys = [];
        for (const code of codes) {
          const av = panel.z[a][code][t];
          const bv = panel.z[b][code][t];
          if (av != null && bv != null && Number.isFinite(av) && Number.isFinite(bv)) {
            xs.push(av);
            ys.push(bv);
          }
        }
        if (xs.length >= 8) {
          const r = pearson(xs, ys);
          if (Number.isFinite(r)) {
            acc[a][b].push(r);
          }
        }
      }
    }
  }
  const M = {};
  for (const f of factors) {
    M[f] = {};
    for (const g of factors) {
      const arr = f === g ? [1] : acc[f][g].length ? acc[f][g] : acc[g][f];
      M[f][g] = arr.length ? mean(arr) : 0;
    }
  }
  return M;
}

/** Gram-Schmidt 顺序正交化（截面）：正交后因子两两相关接近 0 */
function orthogonalize(panel, factors) {
  const dates = panel.dates;
  const codes = panel.varieties;
  const orth = {};
  const order = [];
  for (const f of factors) {
    const zf = {};
    for (const code of codes) {
      zf[code] = panel.z[f][code].slice();
    }
    for (let t = 0; t < dates.length; t++) {
      for (const g of order) {
        const xs = [];
        const ys = [];
        for (const code of codes) {
          const a = zf[code][t];
          const b = orth[g][code][t];
          if (a != null && b != null && Number.isFinite(a) && Number.isFinite(b)) {
            xs.push(a);
            ys.push(b);
          }
        }
        if (xs.length < 8) {
          continue;
        }
        const beta = pearson(xs, ys);
        if (Number.isFinite(beta)) {
          for (const code of codes) {
            if (zf[code][t] != null && orth[g][code][t] != null) {
              zf[code][t] -= beta * orth[g][code][t];
            }
          }
        }
      }
      const vals = [];
      for (const code of codes) {
        if (zf[code][t] != null && Number.isFinite(zf[code][t])) {
          vals.push(zf[code][t]);
        }
      }
      if (vals.length >= 2) {
        const m = mean(vals);
        const s = Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length) || 1;
        for (const code of codes) {
          if (zf[code][t] != null) {
            zf[code][t] = (zf[code][t] - m) / s;
          }
        }
      }
    }
    orth[f] = zf;
    order.push(f);
  }
  return orth;
}

  Object.assign(__exports, { forwardReturns, quantileReturns, icSeries, icDecay, topTurnover, factorCorrelation, orthogonalize });
});
__def("research/paperLedger", function(__req, __exports) {
  const { mean } = __req("utils");
/**
 * paperLedger.js — 前向纸面验证账本（Phase 3）。
 * 记录每个预测（ts/code/方向/得分/入场价），到 horizon 后按实际价结算（收益/命中），并给出统计。
 * 解决「历史新闻无法回测」：不回溯，而是前向记录并事后统计命中率/收益。
 */


class PaperLedger {
  constructor() {
    this.records = [];
  }

  /** 记录一条预测：{ ts, code, direction(1/-1), score, entryPrice } */
  add(record) {
    this.records.push(record);
  }

  /** 结算一条：给定结算价，回填 ret / hit */
  settle(record, settlePrice) {
    const ret = record.direction * (settlePrice / record.entryPrice - 1);
    record.settlePrice = settlePrice;
    record.ret = ret;
    record.hit = ret > 0;
    return record;
  }

  settled() {
    return this.records.filter((r) => r.settlePrice != null);
  }

  stats() {
    const s = this.settled();
    const n = s.length;
    const longs = s.filter((r) => r.direction === 1);
    const shorts = s.filter((r) => r.direction === -1);
    return {
      n: n,
      hitRate: n ? s.filter((r) => r.hit).length / n : 0,
      avgRet: n ? mean(s.map((r) => r.ret)) : 0,
      cumRet: n ? s.reduce((a, r) => a + r.ret, 0) : 0,
      nLong: longs.length,
      nShort: shorts.length,
      longHitRate: longs.length ? longs.filter((r) => r.hit).length / longs.length : 0,
      shortHitRate: shorts.length ? shorts.filter((r) => r.hit).length / shorts.length : 0,
    };
  }

  /** 按品种聚合命中率 */
  byCode() {
    const map = {};
    for (const r of this.settled()) {
      (map[r.code] = map[r.code] || []).push(r);
    }
    const out = {};
    for (const code of Object.keys(map)) {
      const arr = map[code];
      out[code] = {
        n: arr.length,
        hitRate: arr.filter((x) => x.hit).length / arr.length,
        avgRet: mean(arr.map((x) => x.ret)),
      };
    }
    return out;
  }
}

  Object.assign(__exports, { PaperLedger });
});
__def("risk/risk", function(__req, __exports) {
  const { mean } = __req("utils");
/**
 * risk.js — 风控（Phase 2）：历史 VaR / CVaR / 最大回撤 / 单日冲击压力测试。
 */


function dailyReturns(nav) {
  const rets = [];
  for (let i = 1; i < nav.length; i++) {
    if (nav[i] != null && nav[i - 1] != null && nav[i - 1] > 0) {
      rets.push(nav[i] / nav[i - 1] - 1);
    }
  }
  return rets;
}

/** 历史 VaR（正值 = 损失）：分位数法 */
function historicalVaR(nav, confidence = 0.95) {
  const rets = dailyReturns(nav).sort((a, b) => a - b);
  if (!rets.length) {
    return 0;
  }
  const idx = Math.max(0, Math.floor((1 - confidence) * rets.length));
  return -rets[idx];
}

/** 期望损失 CVaR（尾部均值） */
function expectedShortfall(nav, confidence = 0.95) {
  const rets = dailyReturns(nav).sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor((1 - confidence) * rets.length));
  const tail = rets.slice(0, idx);
  return tail.length ? -mean(tail) : 0;
}

/** 最大回撤 */
function maxDrawdown(nav) {
  let peak = -Infinity;
  let maxDD = 0;
  for (const v of nav) {
    if (v == null) {
      continue;
    }
    if (v > peak) {
      peak = v;
    }
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > maxDD) {
      maxDD = dd;
    }
  }
  return maxDD;
}

/** 压力测试：单日 shock 本身即造成 |shock| 回撤（保守口径：压力后最大回撤 = max(原回撤, |shock|)） */
function stressTest(nav, shock = -0.1) {
  const dd = maxDrawdown(nav);
  const shockAbs = Math.abs(shock);
  return { shock, maxDrawdownBefore: dd, maxDrawdownAfter: Math.max(dd, shockAbs) };
}

  Object.assign(__exports, { dailyReturns, historicalVaR, expectedShortfall, maxDrawdown, stressTest });
});
__def("portfolio/optimizer", function(__req, __exports) {
  const { std } = __req("utils");
/**
 * optimizer.js — 组合优化（Phase 2，JS 实现，等价 cvxpy 风险平价/板块约束的简化版）。
 * 逆波动率权重（naive risk parity）+ 等风险贡献迭代 + 板块暴露上限缩放。
 */


/** 逆波动率权重：weight_i 正比于 1/vol_i */
function inverseVolWeights(returnsByCode, codes) {
  const inv = {};
  let sum = 0;
  for (const code of codes) {
    const s = std(returnsByCode[code] || []);
    inv[code] = s > 0 ? 1 / s : 0;
    sum += inv[code];
  }
  const w = {};
  for (const code of codes) {
    w[code] = sum > 0 ? inv[code] / sum : 1 / codes.length;
  }
  return w;
}

/** 等风险贡献（ERC）近似：迭代调整 w_i 正比于 1/vol_i */
function riskParityWeights(returnsByCode, codes, iterations = 20) {
  const vols = {};
  for (const code of codes) {
    const s = std(returnsByCode[code] || []);
    vols[code] = s > 0 ? s : 1;
  }
  let w = inverseVolWeights(returnsByCode, codes);
  for (let it = 0; it < iterations; it++) {
    let sum = 0;
    const next = {};
    for (const code of codes) {
      next[code] = w[code] / vols[code];
      sum += next[code];
    }
    for (const code of codes) {
      next[code] = sum > 0 ? next[code] / sum : 1 / codes.length;
    }
    w = next;
  }
  return w;
}

/** 板块暴露上限：某板块权重超过 maxSectorWeight 则按比例缩减该板块内权重 */
function capSectorExposure(weights, codes, sectorOf, maxSectorWeight = 0.3) {
  const sectorW = {};
  for (const code of codes) {
    const sec = sectorOf(code);
    sectorW[sec] = (sectorW[sec] || 0) + Math.abs(weights[code] || 0);
  }
  const w = Object.assign({}, weights);
  for (const sec of Object.keys(sectorW)) {
    if (sectorW[sec] > maxSectorWeight) {
      const scale = maxSectorWeight / sectorW[sec];
      for (const code of codes) {
        if (sectorOf(code) === sec) {
          w[code] *= scale;
        }
      }
    }
  }
  return w;
}

  Object.assign(__exports, { inverseVolWeights, riskParityWeights, capSectorExposure });
});
  var entry = __req('index');
  if (typeof module !== 'undefined' && module.exports) { module.exports = entry; }
  global.MockTrader = entry;
})(typeof globalThis !== 'undefined' ? globalThis : this);
