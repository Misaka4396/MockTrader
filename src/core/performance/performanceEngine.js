/**
 * performanceEngine.js — 绩效与基准对比 (S5: PerformanceEngine "dll")。
 * 指标：年化收益率、Sharpe、最大回撤、卡玛、波动率、胜率（公式定义见 docs/06）。
 * 基准：纳指100 长线年化收益率（可配置常数，默认 15%），非逐日曲线。
 * 对比：超额收益 = 策略年化 - 基准年化；结论：跑赢/跑输/接近。
 */

import { std } from '../utils.js';

export const DEFAULT_BENCHMARK = {
  annual: 0.15,
  name: '纳指100 长线年化',
  note: '基准为可配置常数（默认 15%，约 10 年口径）；非逐日曲线，仅代表长线收益率参照。',
};

export const DEFAULT_PERF_CONFIG = {
  riskFreeRate: 0,
  benchmarkAnnual: 0.15,
  benchmarkName: DEFAULT_BENCHMARK.name,
  benchmarkNote: DEFAULT_BENCHMARK.note,
  verdictThreshold: 0.02, // ±2pp 判定"接近"
  tradingDaysPerYear: 252,
};

export class PerformanceEngine {
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
