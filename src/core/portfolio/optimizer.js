/**
 * optimizer.js — 组合优化（Phase 2，JS 实现，等价 cvxpy 风险平价/板块约束的简化版）。
 * 逆波动率权重（naive risk parity）+ 等风险贡献迭代 + 板块暴露上限缩放。
 */
import { std } from '../utils.js';

/** 逆波动率权重：weight_i 正比于 1/vol_i */
export function inverseVolWeights(returnsByCode, codes) {
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
export function riskParityWeights(returnsByCode, codes, iterations = 20) {
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
export function capSectorExposure(weights, codes, sectorOf, maxSectorWeight = 0.3) {
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
