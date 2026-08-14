/**
 * backtestEngine.js — 期货回测引擎 (S4: BacktestEngine "dll")。
 * 组合核算：现金、保证金占用、持仓市值、浮动盈亏、权益；逐日盯市；
 * 展期滚动（主力切换自动换月）；交易成本（双边手续费 + 滑点）；保证金约束。
 * 撮合：信号 t 日生成，t+delay 日收盘成交（默认 delay=1，无前视）。
 */

export const DEFAULT_BACKTEST_CONFIG = {
  initialCapital: 10_000_000,
  commissionRate: 0.0002,   // 单边手续费率（按名义额）
  slippageTicks: 1,         // 单边滑点（跳）
  executionDelay: 1,        // 成交延迟（交易日）：1 = 次日收盘成交
  maxLeverage: 1.5,         // 总保证金 / 权益 上限
  useAdjPrice: true,        // 盈亏按后复权主连续价（消除展期跳空）
};

export class BacktestEngine {
  /**
   * @param {DataAccess} ds
   * @param {{rebalanceDates: string[], targets: Object<string,Object<string,number>>}} strategy
   * @returns 回测结果（权益曲线、交易明细、展期记录、每日快照）
   */
  run(ds, strategy, config = {}) {
    const cfg = Object.assign({}, DEFAULT_BACKTEST_CONFIG, config);
    const dates = ds.dates;
    const T = dates.length;
    const metaOf = (code) => ds.getMeta(code);
    const seriesCache = {};
    const S = (code) => (seriesCache[code] = seriesCache[code] || ds.getSeries(code));

    // 每个品种最后一个有效主连续价的下标（用于退市强平）
    const lastValidIdx = {};
    for (const code of ds.codes) {
      const s = S(code);
      let li = null;
      for (let t = 0; t < T; t++) if (s.mainAdj[t] != null) li = t;
      lastValidIdx[code] = li;
    }

    // 展期事件索引：code -> Map(date -> roll)
    const rollByDate = {};
    for (const code of ds.codes) {
      const m = new Map();
      for (const r of S(code).rolls) m.set(r.date, r);
      rollByDate[code] = m;
    }

    let cash = cfg.initialCapital;
    const positions = {}; // code -> {lots, dir, entryAdj, entryRaw, contract}
    const trades = [];
    const rolls = [];
    const equityArr = new Array(T).fill(null);
    const snapshots = new Array(T).fill(null);

    let pending = null; // {execIdx, targets}

    const legCost = (meta, price, lots) =>
      cfg.commissionRate * price * meta.mult * lots + cfg.slippageTicks * meta.tickValue * lots;

    // 计算当前浮动盈亏 / 权益 / 保证金占用 / 可用资金
    const stats = (t) => {
      let floatingPnL = 0;
      let usedMargin = 0;
      let gross = 0;
      for (const code of Object.keys(positions)) {
        const pos = positions[code];
        const s = S(code);
        const meta = metaOf(code);
        const adjT = s.mainAdj[t];
        const rawT = s.mainRaw[t];
        if (adjT != null) floatingPnL += pos.dir * (adjT - pos.entryAdj) * meta.mult * pos.lots;
        if (rawT != null) { usedMargin += pos.lots * rawT * meta.mult * meta.margin; gross += pos.lots * rawT * meta.mult; }
      }
      const equity = cash + floatingPnL;
      return { floatingPnL, usedMargin, gross, equity, available: equity - usedMargin };
    };

    // 退市强平：数据结束后按最后有效价平仓
    const liquidateDelisted = (t, date) => {
      for (const code of Object.keys(positions)) {
        const s = S(code);
        if (s.mainAdj[t] != null) continue;
        const li = lastValidIdx[code];
        if (li == null) { delete positions[code]; continue; }
        const pos = positions[code];
        const meta = metaOf(code);
        const adjP = s.mainAdj[li];
        const rawP = s.mainRaw[li] != null ? s.mainRaw[li] : pos.entryRaw;
        const pnl = pos.dir * (adjP - pos.entryAdj) * meta.mult * pos.lots;
        const cost = legCost(meta, rawP, pos.lots);
        cash += pnl - cost;
        trades.push({ date, code, side: 'close', dir: pos.dir, lots: pos.lots, price: rawP, adjPrice: adjP, notional: rawP * meta.mult * pos.lots, cost, pnl, contract: pos.contract, reason: 'delist' });
        delete positions[code];
      }
    };

    // 展期滚动：主力切换自动换月（平旧开新），盈亏连续（后复权），仅计换月成本
    const processRolls = (t, date) => {
      for (const code of Object.keys(positions)) {
        const roll = rollByDate[code] && rollByDate[code].get(date);
        if (!roll) continue;
        const pos = positions[code];
        const meta = metaOf(code);
        const oldRaw = roll.fromClose != null ? roll.fromClose : pos.entryRaw;
        const newRaw = roll.toClose != null ? roll.toClose : pos.entryRaw;
        const cost = legCost(meta, oldRaw, pos.lots) + legCost(meta, newRaw, pos.lots);
        cash -= cost;
        pos.contract = roll.to;
        pos.entryRaw = newRaw;
        rolls.push({ date, code, from: roll.from, to: roll.to, lots: pos.lots, cost });
      }
    };

    // 交易到目标（含手续费/滑点/已实现盈亏/平均成本）
    const tradeTo = (date, t, code, targetLots, targetDir, targetContract) => {
      const meta = metaOf(code);
      const s = S(code);
      const rawT = s.mainRaw[t];
      const adjT = s.mainAdj[t];
      const cur = positions[code];
      const curLots = cur ? cur.lots : 0;
      const curDir = cur ? cur.dir : 0;

      if (targetLots === 0 && curLots === 0) return;
      if (targetLots === 0) {
        const pnl = curDir * (adjT - cur.entryAdj) * meta.mult * curLots;
        const cost = legCost(meta, rawT, curLots);
        cash += pnl - cost;
        trades.push({ date, code, side: 'close', dir: curDir, lots: curLots, price: rawT, adjPrice: adjT, notional: rawT * meta.mult * curLots, cost, pnl, contract: cur.contract, reason: 'rebalance' });
        delete positions[code];
        return;
      }
      if (curLots === 0) {
        const cost = legCost(meta, rawT, targetLots);
        cash -= cost;
        positions[code] = { lots: targetLots, dir: targetDir, entryAdj: adjT, entryRaw: rawT, contract: targetContract };
        trades.push({ date, code, side: 'open', dir: targetDir, lots: targetLots, price: rawT, adjPrice: adjT, notional: rawT * meta.mult * targetLots, cost, pnl: 0, contract: targetContract, reason: 'rebalance' });
        return;
      }
      if (curDir === targetDir) {
        if (targetLots > curLots) {
          const add = targetLots - curLots;
          const cost = legCost(meta, rawT, add);
          cash -= cost;
          positions[code] = {
            lots: targetLots, dir: targetDir,
            entryAdj: (cur.lots * cur.entryAdj + add * adjT) / targetLots,
            entryRaw: (cur.lots * cur.entryRaw + add * rawT) / targetLots,
            contract: targetContract,
          };
          trades.push({ date, code, side: 'add', dir: targetDir, lots: add, price: rawT, adjPrice: adjT, notional: rawT * meta.mult * add, cost, pnl: 0, contract: targetContract, reason: 'rebalance' });
        } else if (targetLots < curLots) {
          const close = curLots - targetLots;
          const pnl = curDir * (adjT - cur.entryAdj) * meta.mult * close;
          const cost = legCost(meta, rawT, close);
          cash += pnl - cost;
          positions[code] = { lots: targetLots, dir: targetDir, entryAdj: cur.entryAdj, entryRaw: cur.entryRaw, contract: targetContract };
          trades.push({ date, code, side: 'reduce', dir: curDir, lots: close, price: rawT, adjPrice: adjT, notional: rawT * meta.mult * close, cost, pnl, contract: cur.contract, reason: 'rebalance' });
        }
        return;
      }
      // 方向翻转
      const pnlClose = curDir * (adjT - cur.entryAdj) * meta.mult * curLots;
      const costClose = legCost(meta, rawT, curLots);
      const costOpen = legCost(meta, rawT, targetLots);
      cash += pnlClose - costClose - costOpen;
      positions[code] = { lots: targetLots, dir: targetDir, entryAdj: adjT, entryRaw: rawT, contract: targetContract };
      trades.push({ date, code, side: 'flip', dir: curDir + '->' + targetDir, lots: curLots, lotsNew: targetLots, price: rawT, adjPrice: adjT, notional: rawT * meta.mult * (curLots + targetLots), cost: costClose + costOpen, pnl: pnlClose, contract: targetContract, reason: 'rebalance' });
    };

    // 执行调仓
    const executeRebalance = (t, date, targets) => {
      const st = stats(t);
      if (st.equity <= 0) { // 爆仓：全部平仓
        for (const code of Object.keys(positions)) tradeTo(date, t, code, 0, 0, null);
        return;
      }
      // 目标手数
      const desired = {};
      for (const code of Object.keys(targets)) {
        const w = targets[code];
        const meta = metaOf(code);
        const s = S(code);
        const rawT = s.mainRaw[t];
        if (rawT == null || !(rawT > 0)) continue;
        const notional = Math.abs(w) * st.equity;
        const lots = Math.floor(notional / (rawT * meta.mult));
        if (lots <= 0) continue;
        desired[code] = { lots, dir: w > 0 ? 1 : -1, contract: s.mainCode[date] };
      }
      // 保证金约束：总保证金 <= 权益 * maxLeverage
      let totalMargin = 0;
      for (const code of Object.keys(desired)) {
        const d = desired[code];
        const meta = metaOf(code);
        totalMargin += d.lots * S(code).mainRaw[t] * meta.mult * meta.margin;
      }
      const cap = st.equity * (cfg.maxLeverage || 1.5);
      if (totalMargin > cap) {
        const f = cap / totalMargin;
        for (const code of Object.keys(desired)) desired[code].lots = Math.floor(desired[code].lots * f);
      }
      // 交易到目标
      const allCodes = new Set([...Object.keys(positions), ...Object.keys(desired)]);
      for (const code of allCodes) {
        const d = desired[code];
        tradeTo(date, t, code, d ? d.lots : 0, d ? d.dir : 0, d ? d.contract : null);
      }
    };

    const rebSet = new Set(strategy.rebalanceDates);
    for (let t = 0; t < T; t++) {
      const date = dates[t];

      // 1) 退市强平
      liquidateDelisted(t, date);
      // 2) 展期滚动
      processRolls(t, date);
      // 3) 执行待成交调仓（收盘价成交）
      if (pending && pending.execIdx === t) {
        executeRebalance(t, date, pending.targets);
        pending = null;
      }
      // 4) 计划新调仓（信号 t 日生成，t+delay 成交）
      if (rebSet.has(date) && !pending) {
        const execIdx = Math.min(t + (cfg.executionDelay || 1), T - 1);
        pending = { execIdx, targets: strategy.targets[date] || {} };
      }

      // 5) 快照
      const st = stats(t);
      equityArr[t] = st.equity;
      snapshots[t] = {
        date,
        equity: st.equity,
        cash,
        floatingPnL: st.floatingPnL,
        usedMargin: st.usedMargin,
        available: st.available,
        grossNotional: st.gross,
        nav: st.equity / cfg.initialCapital,
        nPositions: Object.keys(positions).length,
      };
    }

    const final = stats(T - 1);
    const totalCost = trades.reduce((a, x) => a + (x.cost || 0), 0);
    const totalRollCost = rolls.reduce((a, x) => a + (x.cost || 0), 0);
    return {
      dates,
      equity: equityArr,
      snapshots,
      trades,
      rolls,
      positions,
      config: cfg,
      summary: {
        initialCapital: cfg.initialCapital,
        finalEquity: final.equity,
        totalCost,
        totalRollCost,
        nTrades: trades.length,
        nRolls: rolls.length,
      },
    };
  }
}
