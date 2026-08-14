# S4 期货回测引擎 (docs/05)

## 账户核算（逐日）

```
floatingPnL = Σ dir × (mainAdj[t] - entryAdj) × mult × lots
equity      = cash + floatingPnL
usedMargin  = Σ lots × close[t] × mult × marginRate
available   = equity - usedMargin
```

- **逐日盯市盈亏 = 价差 × 乘数 × 手数 × 方向**（dir=+1 多 / -1 空）。
- 盈亏用**后复权主连续价**（消除展期跳空），保证金/乘数从品种元数据读取。

## 成交与成本

- 撮合：信号 t 日生成，**t+delay 日收盘成交**（默认 delay=1，无前视）。
- 手续费（单边，按名义额）：`commissionRate × price × mult × lots`。
- 滑点（单边）：`slippageTicks × tickValue × lots`。
- 开/加仓扣成本；平/减仓实现盈亏并扣成本；方向翻转 = 平旧 + 开新（两腿）。

## 展期滚动

主力切换时**自动换月**：平旧开新（两腿成本），但盈亏连续（后复权价，无跳空），仅更新合约代码与保证金基准价，并记录展期明细（`rolls`）。

## 保证金约束

目标仓位总保证金 ≤ equity × maxLeverage，否则按比例下调手数（取整）；equity ≤ 0 时全部平仓（爆仓）。退市品种在数据结束后按最后有效价强平。

## 输出

`equity/snapshots/trades/rolls/positions/summary`，交易明细含展期记录，净值可复现。
