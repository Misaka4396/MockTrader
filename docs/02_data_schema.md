# S1 数据层 schema (docs/02)

## 品种元数据 (metadata.js, `METADATA`)

| 字段 | 类型 | 说明 |
|------|------|------|
| code | string | 品种代码（合约前缀，如 RB） |
| name | string | 品种名 |
| sector | enum | 黑色/有色/能化/农产品/贵金属 |
| exchange | enum | SHFE/DCE/CZCE/INE |
| mult | number | 合约乘数 |
| margin | number | 保证金率（小数） |
| tick | number | 最小变动价位 |
| tickValue | number | 最小变动价值 = tick × mult |
| unit | string | 报价单位 |
| months | number[]\|null | 上市交割月；null = 全部 12 个月 |
| list | string | 品种上市日期 (YYYY-MM-DD) |
| delist | string\|null | 品种退市日期；null = 仍上市 |
| ref | number | 合成数据参考价位（仅作合成锚点，非真实行情） |

> 说明：mult/margin/tick 为真实口径典型值（交易所会调整，原型用途）；WR/BB/RS 为已退市品种，保留在元数据中以演示**幸存者偏差处理**（已退市品种不删除，按其 delist 日期停止出数据）。

## 合约日线 (bar)

每品种 `contracts[contractCode] = [bar, ...]`（按日期升序）：

```json
{ "date": "2022-01-04", "open": 3580, "high": 3610, "low": 3565,
  "close": 3590, "settle": 3590, "volume": 182340, "openInterest": 421105 }
```

- 合约代码 = 品种代码 + 交割月 YYMM，如 `RB2305`（2023-05 交割，交割日约定为当月 15 日）。
- 全月品种上市约 12 个月合约；1/5/9 品种仅上市指定月份。

## 主力/次主力连续

- **主力** = 当日持仓量最大合约（并列按成交量、再按交割月更早者），带**迟滞阈值**（hysteresis=1.15）避免噪声频繁切换；原主力到期强制切换。
- **次主力** = 除主力外持仓量最大合约。

`getSeries(code)` 返回与全局日期轴对齐的数组：`mainRaw / mainAdj / subRaw / subAdj / mainOi / subOi / mainVol` 及 `rolls`（展期事件表）。

## 展期复权（后复权，比值法，锚定最新价）

在主力切换点 t（t 日主力 A，t+1 日主力 B）：

```
factor[t] = factor[t+1] × close(B, t) / close(A, t)
adjClose[t] = rawClose[t] × factor[t]
```

- 消除切换跳空：切换日复权收益率 = B 合约自身日收益（而非 A→B 价差）。
- 锚定最新价（最新日期 factor=1），历史价按比值缩放，收益率得以保留。
- 动量/偏度/Amihud 用 **mainAdj**（无跳空）；展期收益率用 **mainRaw/subRaw**（横截面价差，须用原始价）。

## 本地存储 (tools/persist.mjs)

```
data/manifest.json      生成参数 + 时间戳 + 品种清单
data/metadata.json      品种元数据
data/continuous/XX.json 每品种主力/次主力连续序列 + 展期事件
data/bars/XX.json       每品种全部合约日线（--bars 时写出，可离线重建）
```
`DataAccess.exportSnapshot()/importSnapshot()` 提供序列化/反序列化；数据由确定性种子生成，全量合约日线可随时复现。

## 合成数据模型 (synthetic.js，仅原型)

- 现货水准：随机游走 + 弱均值回归（kappa=0.03）+ 温和季节漂移。
- carry：OU 过程（可正可负，随时间切换 contango/backwardation）。
- 合约价 F(T) = S · exp(carry · T/365)，自然收敛于交割。
- 成交量/持仓量围绕「距交割月数」形成非对称峰值，从而自然产生主力切换。
- 确定性 PRNG（mulberry32 + FNV-1a），同种子数据可复现。
