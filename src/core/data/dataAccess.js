/**
 * dataAccess.js — 数据访问层 (S1: DataAccess "dll")。
 * 纯内存 + 可导出快照（JSON），不依赖 Node fs，便于浏览器/Node 复用；
 * 磁盘持久化由 tools/persist.mjs 通过 exportSnapshot/importSnapshot 完成。
 */

import { METADATA, METADATA_BY_CODE } from './metadata.js';
import { generateVariety, deliveryISO } from './synthetic.js';
import { continuousSeries, maxAbsReturn } from './roll.js';
import { tradingDates } from '../utils.js';

/** 从合约代码解析交割月（依赖品种代码前缀） */
export function parseContractCode(varietyCode, contractCode) {
  const yyMM = contractCode.slice(varietyCode.length);
  const yy = Number(yyMM.slice(0, 2));
  const mm = Number(yyMM.slice(2, 4));
  const year = 2000 + yy;
  return { year, month: mm, delivery: deliveryISO(year, mm) };
}

export class DataAccess {
  constructor() {
    this.reset();
  }

  reset() {
    this.dates = [];
    this.dataset = null; // { code: { contracts: {[contractCode]: bars[]} } }
    this.series = {}; // code -> continuousSeries 结果 (缓存)
    this.config = null;
  }

  /**
   * 生成全品种多合约数据（确定性）。config: { start, end, masterSeed, varieties? }
   */
  generate(config = {}) {
    const start = config.start || '2022-01-03';
    const end = config.end || '2024-12-31';
    const masterSeed = config.masterSeed || 'mocktrader-default-seed';
    const dates = tradingDates(start, end);
    const codes = config.varieties && config.varieties.length ? config.varieties : METADATA.map((m) => m.code);
    const dataset = {};
    for (const code of codes) {
      const meta = METADATA_BY_CODE[code];
      if (!meta) {continue;}
      dataset[code] = generateVariety(meta, dates, masterSeed);
    }
    this.dates = dates;
    this.dataset = dataset;
    this.config = { start, end, masterSeed, varieties: Object.keys(dataset) };
    this.series = {};
    return this;
  }

  get codes() {
    return this.dataset ? Object.keys(this.dataset) : [];
  }

  get datesCount() {
    return this.dates.length;
  }

  /** 品种元数据 */
  getMeta(code) {
    return METADATA_BY_CODE[code] || null;
  }

  get metadata() {
    return METADATA;
  }

  /** 某品种全部合约代码（已排序） */
  getContracts(code) {
    if (!this.dataset || !this.dataset[code]) {return [];}
    return Object.keys(this.dataset[code].contracts).sort();
  }

  /** 某合约日线 */
  getBars(code, contractCode) {
    if (!this.dataset || !this.dataset[code]) {return null;}
    return this.dataset[code].contracts[contractCode] || null;
  }

  /** 某合约某日 bar */
  getBar(code, contractCode, date) {
    const bars = this.getBars(code, contractCode);
    if (!bars) {return null;}
    // 线性定位（数据按日期升序）
    for (const b of bars) {if (b.date === date) {return b;}}
    return null;
  }

  /** 某品种主力/次主力连续序列（含后复权） */
  getSeries(code) {
    if (!this.dataset || !this.dataset[code]) {return null;}
    if (!this.series[code]) {this.series[code] = continuousSeries(this.dates, this.dataset[code].contracts);}
    return this.series[code];
  }

  /** 展期事件表 */
  getRolls(code) {
    const s = this.getSeries(code);
    return s ? s.rolls : [];
  }

  /** 展期复权跳空校验：返回最大 |log-return| */
  getMaxJump(code) {
    const s = this.getSeries(code);
    return s ? maxAbsReturn(s.mainAdj) : 0;
  }

  /** 交易日历 */
  get datesArr() {
    return this.dates;
  }

  /** 某日可交易品种（已上市且未退市且有数据） */
  universeAt(date) {
    const out = [];
    for (const code of this.codes) {
      const meta = METADATA_BY_CODE[code];
      if (!meta) {continue;}
      if (meta.list && date < meta.list) {continue;}
      if (meta.delist && date > meta.delist) {continue;}
      const s = this.getSeries(code);
      if (!s) {continue;}
      const i = this.dates.indexOf(date);
      if (i >= 0 && s.mainRaw[i] != null) {out.push(code);}
    }
    return out;
  }

  /** 导出可序列化快照（含全部合约与派生连续序列） */
  exportSnapshot() {
    const series = {};
    for (const code of this.codes) {series[code] = this.getSeries(code);}
    return {
      version: 1,
      config: this.config,
      dates: this.dates,
      metadata: METADATA,
      dataset: this.dataset,
      series,
    };
  }

  /** 从真实行情数据加载（方案 A）：{ dates, dataset }，dataset = { code: { contracts: { code: [bar] } } } */
  loadMarketData(data) {
    this.dates = data.dates || [];
    this.dataset = data.dataset || {};
    this.series = {};
    if (!this.config) {this.config = { source: 'market-data' };}
    return this;
  }

  /** 从快照恢复（快照含 dataset 与 series） */
  importSnapshot(snapshot) {
    this.dates = snapshot.dates || [];
    this.dataset = snapshot.dataset || {};
    this.config = snapshot.config || null;
    this.series = snapshot.series || {};
    return this;
  }
}
