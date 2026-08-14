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

import { rngFromString, randn, tradingDates, addDays, diffDays, roundTo } from '../utils.js';

/** 板块级合成参数默认值 */
export const SECTOR_SIM_DEFAULT = {
  '黑色': { vol: 0.25, drift: 0.00, carryMean: -0.05, carryVol: 0.09, rho: 0.995, seasonAmp: 0.04, oiPeak: 2.2, oiSpread: 3.0, volBase: 120000, oiBase: 160000 },
  '有色': { vol: 0.22, drift: 0.00, carryMean: 0.04, carryVol: 0.07, rho: 0.995, seasonAmp: 0.03, oiPeak: 2.2, oiSpread: 3.0, volBase: 90000, oiBase: 140000 },
  '能化': { vol: 0.28, drift: 0.00, carryMean: 0.02, carryVol: 0.10, rho: 0.995, seasonAmp: 0.05, oiPeak: 2.2, oiSpread: 3.0, volBase: 150000, oiBase: 200000 },
  '农产品': { vol: 0.20, drift: 0.00, carryMean: 0.00, carryVol: 0.09, rho: 0.995, seasonAmp: 0.06, oiPeak: 2.5, oiSpread: 3.2, volBase: 110000, oiBase: 180000 },
  '贵金属': { vol: 0.14, drift: 0.00, carryMean: 0.05, carryVol: 0.05, rho: 0.995, seasonAmp: 0.02, oiPeak: 2.5, oiSpread: 3.0, volBase: 80000, oiBase: 120000 },
};

/** 单品种覆盖 (制造 carry 符号的截面差异：负=backwardation，正=contango) */
export const SIM_OVERRIDES = {
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

export function simParams(code, sector) {
  return Object.assign({}, SECTOR_SIM_DEFAULT[sector], SIM_OVERRIDES[code] || {});
}

const DT = 1 / 252;

/** 合约代码：RB + YYMM -> 'RB2305' */
export function contractCode(code, year, month) {
  return code + String(year).slice(-2) + String(month).padStart(2, '0');
}

/** 交割日（约定为交割月 15 日，用于距交割天数与展期年化） */
export function deliveryISO(year, month) {
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
export function generateVariety(meta, dates, masterSeed) {
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
