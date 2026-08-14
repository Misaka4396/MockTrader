import { BacktestEngine } from '../src/core/backtest/backtestEngine.js';

function fakeDs({ prices, rolls = [], mult = 1, margin = 0.1, tickValue = 1 }) {
  const dates = prices.map((_, i) => `2022-01-${String(3 + i).padStart(2, '0')}`);
  return {
    dates,
    codes: ['XX'],
    getMeta: () => ({ code: 'XX', mult, margin, tickValue }),
    getSeries: () => ({
      dates,
      mainAdj: prices.slice(),
      mainRaw: prices.slice(),
      subRaw: prices.slice(),
      mainOi: prices.map(() => 100),
      mainVol: prices.map(() => 100),
      mainCode: Object.fromEntries(dates.map((d) => [d, 'XX001'])),
      subCode: Object.fromEntries(dates.map((d) => [d, 'XX002'])),
      rolls,
    }),
  };
}

test('S4 long PnL sign + cost deduction (rising market)', () => {
  const ds = fakeDs({ prices: [100, 101, 102, 103, 104] });
  const strategy = { rebalanceDates: [ds.dates[0]], targets: { [ds.dates[0]]: { XX: 1.0 } } };
  const bt = new BacktestEngine().run(ds, strategy, {
    initialCapital: 1000,
    executionDelay: 1,
    commissionRate: 0.0002,
    slippageTicks: 1,
  });
  // 9 lots @101 (floor(1000/101)=9); cost = 0.0002*101*9 + 1*1*9 = 9.1818; PnL = 9*(104-101)=27
  const final = bt.equity[bt.equity.length - 1];
  assertClose(final, 1000 + 27 - 9.1818, 1e-6, 'long final equity');
  assert(
    bt.trades.some((t) => t.side === 'open' && t.dir === 1),
    'opened long'
  );
});

test('S4 short PnL sign (rising market => loss)', () => {
  const ds = fakeDs({ prices: [100, 101, 102, 103, 104] });
  const strategy = { rebalanceDates: [ds.dates[0]], targets: { [ds.dates[0]]: { XX: -1.0 } } };
  const bt = new BacktestEngine().run(ds, strategy, {
    initialCapital: 1000,
    executionDelay: 1,
    commissionRate: 0.0002,
    slippageTicks: 1,
  });
  const final = bt.equity[bt.equity.length - 1];
  assertClose(final, 1000 - 27 - 9.1818, 1e-6, 'short final equity (loss)');
});

test('S4 roll recorded + cost charged, no equity jump', () => {
  const prices = [100, 101, 102, 103];
  const ds = fakeDs({
    prices,
    rolls: [{ date: '2022-01-05', from: 'XX001', to: 'XX002', fromClose: 101.5, toClose: 102 }],
  });
  const strategy = { rebalanceDates: [ds.dates[0]], targets: { [ds.dates[0]]: { XX: 1.0 } } };
  const bt = new BacktestEngine().run(ds, strategy, {
    initialCapital: 1000,
    executionDelay: 1,
    commissionRate: 0.0002,
    slippageTicks: 1,
  });
  assert(bt.rolls.length === 1, 'one roll recorded');
  assert(bt.rolls[0].from === 'XX001' && bt.rolls[0].to === 'XX002', 'roll from/to');
  // 换月成本被扣除：equity 在换月日后的值与无成本情形相比减少
  const rollCost = bt.rolls[0].cost;
  assertGt(rollCost, 0, 'roll cost positive');
  // 无换月跳空：换月日前后权益仅因正常盯市 + 成本变化（连续主连价）
  const idx = ds.dates.indexOf('2022-01-05');
  const jump = bt.equity[idx] - bt.equity[idx - 1];
  // 当日盯市 +9*(102-101)=9；换月成本 rollCost
  assertClose(jump, 9 - rollCost, 1e-6, 'no jump beyond normal pnl + roll cost');
});

test('S4 margin cap respected', () => {
  const ds = fakeDs({ prices: [100, 101, 102, 103, 104], mult: 10, margin: 0.1, tickValue: 10 });
  const strategy = { rebalanceDates: [ds.dates[0]], targets: { [ds.dates[0]]: { XX: 1.0 } } };
  const bt = new BacktestEngine().run(ds, strategy, {
    initialCapital: 10000,
    executionDelay: 1,
    maxLeverage: 0.05,
    commissionRate: 0.0002,
    slippageTicks: 1,
  });
  const snap = bt.snapshots[bt.snapshots.length - 1];
  assert(snap.usedMargin <= snap.equity * 0.05 + 1e-6, 'usedMargin <= equity * maxLeverage');
  assertGt(snap.usedMargin, 0, 'some margin used (scaled, not zeroed)');
});
