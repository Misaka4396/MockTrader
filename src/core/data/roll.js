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
export function buildIndex(contracts) {
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
 * @param {number} [opts.hysteresis] 切换阈值系数，默认 1.15
 * @returns {{mainByDate: Object<string,string|null>, subByDate: Object<string,string|null>}}
 */
export function buildMainSub(dates, contracts, opts = {}) {
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
export function backAdjustFactors(dates, codeByDate, getClose) {
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
export function continuousSeries(dates, contracts) {
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
export function maxAbsReturn(prices) {
  const vals = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] != null && prices[i - 1] != null && prices[i - 1] > 0) {
      vals.push(Math.abs(Math.log(prices[i] / prices[i - 1])));
    }
  }
  return vals.length ? Math.max(...vals) : 0;
}
