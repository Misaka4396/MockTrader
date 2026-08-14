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

import { mean, std, winsorize, zscore } from '../utils.js';
import { parseContractCode } from '../data/dataAccess.js';

export const DEFAULT_FACTOR_PARAMS = {
  momentum: { lookback: 120, skip: 21 },
  liquidity: { amihudWindow: 20 },
  volume: { ratioWindow: 20, momentumLookback: 60 },
  skewness: { window: 20 },
  rollYield: { annualize: true },
  winsorizeK: 2.5,
  crossSectionalZ: true,
};

/** 因子符号默认值（更高 = 更倾向做多） */
export const FACTOR_SIGNS = { momentum: 1, liquidity: 1, volume: 1, skewness: 1, rollYield: 1 };

/** 样本偏度 */
export function skewness(arr) {
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
export function computeVarietyFactors(ds, code, params) {
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
export function crossSectionalZ(dates, varieties, rawByCode, winsorizeK) {
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

export class FactorEngine {
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
