# S3 策略组合与信号生成 (docs/04)

## 配置 schema (`DEFAULT_STRATEGY_CONFIG`)

| 参数 | 默认 | 说明 |
|------|------|------|
| factors | 全部 5 因子 | 选用哪些因子（单/多因子切换） |
| factorSigns | 全 +1 | 每因子方向（更高=做多倾向） |
| combine | 'equal' | 'equal' 等权 / 'ic' IC 加权 / 'custom' 自定义 |
| factorWeights | null | combine='custom' 时生效（按 |w| 归一化） |
| icWindow / icHorizon | 60 / 5 | IC 加权滚动窗口与前视收益天数（已滞后，无未来函数） |
| longCount / shortCount | 5 / 5 | 做多/做空品种数量 |
| mode | 'longShort' | 'longShort'(中性) / 'longOnly' |
| weighting | 'equal' | 'equal' 等权 / 'score' 得分加权 |
| neutral | true | 方向中性（多空名义额相等） |
| rebalance | 'monthly' | 'monthly'(21 交易日) / 'weekly'(5) |
| rebalanceDays | 21 | 调仓间隔（交易日） |
| buffer | 2 | 缓冲带（排名容忍，降低换手） |
| grossExposure | 1.0 | 总名义敞口 / 权益 |
| warmup | 120 | 起始调仓所需最小历史 |

## 合成

```
score[code][t] = Σ_f sign_f × w_f × z_f[code][t]
```

IC 加权：w_f ∝ |IC_f|，IC_f = 截面 Spearman(z_f(τ), 前视 horizon 收益(τ)) 在 [t-window, t-horizon] 上滚动（仅用已知数据，无前视）。

## 选品与权重

- 按 score 截面排序：前 `longCount` 名做多、后 `shortCount` 名做空。
- 中性：多头总名义 = 空头总名义 = gross/2（等权时每名 = gross/2/count；得分加权按 |score| 归一化）。
- 缓冲带：持仓若仍位于前 (N+buffer) 名则保留，减少换手。
- 输出：`targets[date] = { code: weight }`，weight 为「名义额/权益」，正=多、负=空。

## 防过拟合

统一参数、少参数；默认全品种统一一套参数；板块内高相关由**截面中性 + 全品种统一参数**缓解。
