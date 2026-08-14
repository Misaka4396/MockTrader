/**
 * utils.js — 纯函数工具库：确定性随机数、日期、统计 (pure numeric/date/random helpers).
 *
 * 所有函数均为纯函数，无 I/O、无外部依赖。日期统一使用 UTC 避免时区/夏令时问题。
 */

// ---------------------------------------------------------------------------
// 确定性随机数 (deterministic PRNG) — 保证数据/结果可复现
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit 字符串哈希 -> 稳定的随机种子 */
export function stringSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG：返回函数 rand() -> [0,1) */
export function mulberry32(seed) {
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
export function rngFromString(key) {
  return mulberry32(stringSeed(key));
}

/** Box–Muller 标准正态随机数 (给定 [0,1) 随机源) */
export function randn(rng) {
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
export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** epoch ms -> 'YYYY-MM-DD' (UTC) */
export function fmtISO(ms) {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** iso + n 天 */
export function addDays(iso, n) {
  return fmtISO(parseISO(iso) + n * DAY_MS);
}

/** b - a 的天数 (可为负) */
export function diffDays(aIso, bIso) {
  return Math.round((parseISO(bIso) - parseISO(aIso)) / DAY_MS);
}

/** 是否为工作日 (周一~周五) */
export function isWeekday(iso) {
  const day = new Date(parseISO(iso)).getUTCDay();
  return day !== 0 && day !== 6;
}

/** 生成 [start, end] 区间内的交易日 (工作日，忽略交易所节假日——原型口径，见 docs) */
export function tradingDates(startIso, endIso) {
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
export function inRange(iso, startIso, endIso) {
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

export function sum(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    s += arr[i];
  }
  return s;
}

export function mean(arr) {
  if (!arr.length) {
    return NaN;
  }
  return sum(arr) / arr.length;
}

/** 样本方差 (ddof=1) 或总体方差 (ddof=0) */
export function variance(arr, ddof = 1) {
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

export function std(arr, ddof = 1) {
  return Math.sqrt(variance(arr, ddof));
}

/** 线性插值分位数 (p in [0,1]) */
export function percentile(arr, p) {
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
export function median(arr) {
  return percentile(arr, 0.5);
}

/** 总体 z-score (ddof=0)：返回与输入等长数组 */
export function zscore(arr) {
  const m = mean(arr);
  const s = std(arr, 0);
  if (!(s > 0)) {
    return arr.map(() => 0);
  }
  return arr.map((x) => (x - m) / s);
}

/** 秩 (rank)：升序，平均并列，返回 1..n */
export function rank(arr) {
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
export function pearson(a, b) {
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
export function spearman(a, b) {
  return pearson(rank(a), rank(b));
}

/** 稳健 winsorize：基于中位数 + MAD 截尾 (k 倍 MAD) */
export function winsorize(arr, k = 2.5) {
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
export function rollingMean(arr, window) {
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
export function rollingStd(arr, window) {
  const out = new Array(arr.length).fill(NaN);
  for (let i = window - 1; i < arr.length; i++) {
    const win = arr.slice(i - window + 1, i + 1);
    out[i] = std(win, 0);
  }
  return out;
}

export function last(arr) {
  return arr.length ? arr[arr.length - 1] : undefined;
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/** 四舍五入到 dp 位小数 (返回 number) */
export function roundTo(x, dp = 6) {
  const f = Math.pow(10, dp);
  return Math.round((x + Number.EPSILON) * f) / f;
}

/** 深拷贝 (结构化可克隆对象) */
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** 键控均值：对象 {key: number} -> values 的均值 */
export function meanOfMap(map) {
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
