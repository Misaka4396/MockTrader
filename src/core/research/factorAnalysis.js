/**
 * factorAnalysis.js — alphalens 式因子研究流水线（Phase 2）。
 * 分层收益 / IC 序列与衰减 / 换手率 / 因子相关性矩阵 / 正交化（Gram-Schmidt 截面）。
 */
import { mean, pearson, spearman } from '../utils.js';

/** 未来 horizon 日收益：fwd[code][t] = P[t+horizon]/P[t]-1 */
export function forwardReturns(ds, codes, dates, horizon) {
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
export function quantileReturns(panel, ds, factorKey, nQuantiles = 5, horizon = 5) {
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
export function icSeries(panel, ds, factorKey, horizon = 5) {
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
export function icDecay(panel, ds, factorKey, horizons = [1, 2, 3, 5, 10, 20]) {
  return horizons.map((h) => ({ horizon: h, ic: mean(icSeries(panel, ds, factorKey, h)) }));
}

/** top N 组合平均换手率（每日名字变化比例） */
export function topTurnover(panel, factorKey, topN = 5) {
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
export function factorCorrelation(panel, factors) {
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
export function orthogonalize(panel, factors) {
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
