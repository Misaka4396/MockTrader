/**
 * paperLedger.js — 前向纸面验证账本（Phase 3）。
 * 记录每个预测（ts/code/方向/得分/入场价），到 horizon 后按实际价结算（收益/命中），并给出统计。
 * 解决「历史新闻无法回测」：不回溯，而是前向记录并事后统计命中率/收益。
 */
import { mean } from '../utils.js';

export class PaperLedger {
  constructor() {
    this.records = [];
  }

  /** 记录一条预测：{ ts, code, direction(1/-1), score, entryPrice } */
  add(record) {
    this.records.push(record);
  }

  /** 结算一条：给定结算价，回填 ret / hit */
  settle(record, settlePrice) {
    const ret = record.direction * (settlePrice / record.entryPrice - 1);
    record.settlePrice = settlePrice;
    record.ret = ret;
    record.hit = ret > 0;
    return record;
  }

  settled() {
    return this.records.filter((r) => r.settlePrice != null);
  }

  stats() {
    const s = this.settled();
    const n = s.length;
    const longs = s.filter((r) => r.direction === 1);
    const shorts = s.filter((r) => r.direction === -1);
    return {
      n: n,
      hitRate: n ? s.filter((r) => r.hit).length / n : 0,
      avgRet: n ? mean(s.map((r) => r.ret)) : 0,
      cumRet: n ? s.reduce((a, r) => a + r.ret, 0) : 0,
      nLong: longs.length,
      nShort: shorts.length,
      longHitRate: longs.length ? longs.filter((r) => r.hit).length / longs.length : 0,
      shortHitRate: shorts.length ? shorts.filter((r) => r.hit).length / shorts.length : 0,
    };
  }

  /** 按品种聚合命中率 */
  byCode() {
    const map = {};
    for (const r of this.settled()) {
      (map[r.code] = map[r.code] || []).push(r);
    }
    const out = {};
    for (const code of Object.keys(map)) {
      const arr = map[code];
      out[code] = {
        n: arr.length,
        hitRate: arr.filter((x) => x.hit).length / arr.length,
        avgRet: mean(arr.map((x) => x.ret)),
      };
    }
    return out;
  }
}
