/**
 * risk.js — 风控（Phase 2）：历史 VaR / CVaR / 最大回撤 / 单日冲击压力测试。
 */
import { mean } from '../utils.js';

export function dailyReturns(nav) {
  const rets = [];
  for (let i = 1; i < nav.length; i++) {
    if (nav[i] != null && nav[i - 1] != null && nav[i - 1] > 0) {
      rets.push(nav[i] / nav[i - 1] - 1);
    }
  }
  return rets;
}

/** 历史 VaR（正值 = 损失）：分位数法 */
export function historicalVaR(nav, confidence = 0.95) {
  const rets = dailyReturns(nav).sort((a, b) => a - b);
  if (!rets.length) {
    return 0;
  }
  const idx = Math.max(0, Math.floor((1 - confidence) * rets.length));
  return -rets[idx];
}

/** 期望损失 CVaR（尾部均值） */
export function expectedShortfall(nav, confidence = 0.95) {
  const rets = dailyReturns(nav).sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor((1 - confidence) * rets.length));
  const tail = rets.slice(0, idx);
  return tail.length ? -mean(tail) : 0;
}

/** 最大回撤 */
export function maxDrawdown(nav) {
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
export function stressTest(nav, shock = -0.1) {
  const dd = maxDrawdown(nav);
  const shockAbs = Math.abs(shock);
  return { shock, maxDrawdownBefore: dd, maxDrawdownAfter: Math.max(dd, shockAbs) };
}
