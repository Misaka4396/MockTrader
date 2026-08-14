# S2 5 因子引擎 (docs/03)

所有因子为**纯函数**、逐品种向量化、仅用 t 日及之前数据（无未来函数）。截面标准化：逐日对品种因子值 **winsorize(中位数±2.5×1.4826×MAD) 后 z-score（总体标准差）**。

## 符号约定

因子值**更高 = 更倾向做多**（方向可在 S3 `factorSigns` 覆盖，默认全 +1）。

## 1. 截面动量 momentum（默认 lookback=120, skip=21）

```
mom[t] = mainAdj[t - skip] / mainAdj[t - lookback] - 1
```

即「12-1 动量」：过去 120 日收益、跳过最近 21 日（近 1 月）。用后复权主连续价（无展期跳空污染）。

## 2. 流动性 liquidity（默认窗口 20）

```
ret[i] = mainAdj[i]/mainAdj[i-1] - 1
amihud[t] = (1/w) Σ_{i=t-w+1..t} |ret[i]| / (close[i] × volume[i])
liquidity[t] = -amihud[t]      // 越高越流动
```

成交额/持仓量（turnover）作为辅助量一并输出（`aux.turnover`）。

## 3. 成交量 volume（默认窗口 20）

```
vol[t] = volume[t] / mean(volume[t-w .. t-1]) - 1     // 量比
```

## 4. 价格偏度 skewness（默认窗口 20）

对窗口内主连续日收益（`mainAdj` 派生）求样本偏度：

```
skew = (Σ (r_i - μ)^3 / n) / σ^3
```

## 5. 展期收益率 rollYield（核心特色因子）

```
ΔT = |delivery(sub) - delivery(main)| （天，由合约代码解析，非未来信息）
rollYield[t] = (mainRaw[t] - subRaw[t]) / subRaw[t] × (365 / ΔT)
```

- 用 t 日收盘的**主力 vs 次主力原始价差**（横截面），**Backwardation（主力>次主力）为正**、Contango 为负。
- 年化后 ≈ -carry（展期收益 = 期限结构斜率）；符号与升贴水方向一致（验收测试覆盖）。

## 输出面板

```
{ dates, varieties,
  raw: { momentum|…: { code: [value|null, …] } },   // 原始因子
  z:   { momentum|…: { code: [z|null, …] } },        // 截面 z
  aux: { turnover, amihud }, params, signs }
```
