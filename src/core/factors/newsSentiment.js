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

import { rngFromString } from '../utils.js';

/** 解析时间戳：number 视为 epoch ms，字符串用 Date.parse */
export function parseTs(x) {
  if (typeof x === 'number') {
    return x;
  }
  return Date.parse(x);
}

export function hoursBetween(tsA, tsB) {
  return (tsB - tsA) / 3600000;
}

export function labelToScore(label) {
  if (label === 'bullish') {
    return 1;
  }
  if (label === 'bearish') {
    return -1;
  }
  return 0;
}

/** 单品种在某时刻的情绪统计 */
export function sentimentFactor(items, code, nowTs, opts = {}) {
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
export function dailySentimentByDate(items, codes, dates, opts = {}) {
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

export class NewsSentimentEngine {
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
export const DEFAULT_LEAN = {
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
export function generateMockNews(codes, opts = {}) {
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
