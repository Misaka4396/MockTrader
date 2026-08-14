/**
 * strategyEngine.js — 策略组合与信号生成 (S3: StrategyEngine "dll")。
 * 因子合成 -> 截面排序 -> 多空选品 -> 权重/中性化 -> 调仓(月度/周度 + 缓冲带)。
 * 全部参数可配置，默认等权、长 5 空 5、月度调仓、方向中性。
 */

import { spearman } from '../utils.js';

export const DEFAULT_STRATEGY_CONFIG = {
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
export function compositeScores(panel, config) {
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
export function factorWeights(panel, config) {
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
export function computeRollingIC(panel, ds, config) {
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

export class StrategyEngine {
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
