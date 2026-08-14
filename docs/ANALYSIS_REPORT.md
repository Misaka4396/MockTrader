# MockTrader 项目分析报告（重新分析）

> 生成时间：2026-08-14 · 版本 v1.1.0 · 分析范围：整个工作目录（排除 node_modules / bin / obj / 生成产物）

## 1. 项目概览

MockTrader 是中国商品期货「多合约 + 展期收益率 + 多空组合」因子回测系统（方案 B），对比纳指长线收益率（单值基准）。
核心算法用纯 JavaScript（ESM）实现，可移植到任意运行时；另提供自包含 Web 原型与原生 C# exe+dll 两套前端，
三者在同一确定性种子下逐位一致。

| 项 | 值 |
|---|---|
| 版本 | v1.1.0（v1.0.0 首发，v1.1.0 工程化整改） |
| 许可证 | MIT（Copyright 2026 Misaka4396） |
| 运行要求 | Node ≥18（核心/Web）；.NET 8 运行时（exe，框架依赖） |
| 语言/技术 | JS ESM + Node；C# / .NET 8 / WPF；HTML5 Canvas |

## 2. 三套交付物

| 交付物 | 产物 | 定位 |
|---|---|---|
| 可移植 JS 核心 | src/core/（11 模块，1913 行） | S1–S5 全部业务逻辑 |
| 自包含 Web 原型 | dist/index.html（~164 KB） | S6/S7 GUI：品种池、参数、结论卡片、Canvas 净值图、Worker 后台 |
| 原生 C# exe+dll | release/（exe 170KB + 3 dll ≈300KB） | S8：DataAccess.dll + StrategyCore.dll + MockTrader.exe（WPF） |

## 3. 目录结构与代码规模

| 目录 | 内容 | 规模 |
|---|---|---|
| src/core/ | S1–S5 核心 | 11 文件 / 1913 行 |
| src/web/ | Web GUI + 图表 + Worker | 5 文件 / 1064 行 |
| cs/ | C# 三项目 + 图标 + 构建脚本 | 16 文件 / ~1814 行 |
| test/ | 21 项无依赖单元测试 | 8 文件 / 533 行 |
| tools/ | 打包器/冒烟/持久化/图标生成 | 4 文件 / 342 行 |
| e2e/ | Playwright 冒烟 | 1 文件 / 42 行 |
| docs/ | 手写文档 9 篇 + TypeDoc API 文档 | 76 文件 / ~5100 行 |

手写源码合计约 5700 行（不含 node_modules、生成的 docs/api、data、dist、release）。

## 4. 模块分析（S1–S8）

| 模块 | 文件 | 职责与关键点 | 验收 |
|---|---|---|---|
| S1 数据层 | src/core/data/ | 45 品种元数据（含 3 个已退市）；确定性合成多合约日线；主力=最大持仓量+1.15 迟滞；后复权比值法展期（换月零跳空）；快照持久化 | 通过 |
| S2 因子引擎 | factors/factorEngine.js | 5 因子：动量(12-1)/-Amihud/量比/偏度/展期收益率；纯函数无未来函数；MAD winsorize+截面 z | 通过 |
| S3 策略引擎 | strategy/strategyEngine.js | 因子合成（等权/IC/自定义）；多5空5；方向中性；月度/周度调仓+缓冲带 | 通过 |
| S4 回测引擎 | backtest/backtestEngine.js | 逐日盯市；保证金+1.5×杠杆上限；t+1 成交；双边手续费+滑点；展期换月；退市强平 | 通过 |
| S5 绩效引擎 | performance/performanceEngine.js | 6 项指标；纳指长线基准(15% 可配)；±2pp 判定跑赢/跑输/接近 | 通过 |
| S6/S7 Web | src/web/ | Worker 后台不卡 UI；结论卡片+6 指标；Canvas 自绘净值图 | 通过 |
| S8 C# 原生版 | cs/ | 三层 exe+dll；WPF 浅色主题 + 二次元图标；与 JS 逐位一致；离线编译适配 | 通过 |

## 5. 双实现一致性（核心验证结论）

同一确定性种子（mulberry32 + FNV-1a 逐位移植）下，JS 核心与 C# 版结果逐位一致：

| 指标 | 值 |
|---|---|
| 品种 / 交易日 | 45 / 782 |
| 交易 / 展期 | 450 / 245 |
| 期末权益 | 9,164,404（初始 1000 万） |
| 年化 / Sharpe / 回撤 | -2.78% / -0.447 / 13.14% |
| 结论（vs 15% 基准） | 超额 -17.78pp，跑输 |

冒烟验证：打包核心与源码结果逐位一致（annualized 0.00379531 / 84 trades 完全相等）。

## 6. 工程化与工具链（v1.1.0 新增）

- 质量：ESLint 9（0 error / 4 warning）+ Prettier 3 + .editorconfig；src/web 消除 var→let/const 并修复 worker 隐式全局。
- Git Hooks：husky + lint-staged + commitlint（Conventional Commits）。
- CI：GitHub Actions 八步门禁 lint→format→commitlint→21 单测→build:web→smoke→Playwright E2E。
- API 文档：TypeDoc 一键生成 docs/api/。
- 开源治理：CONTRIBUTING、CODE_OF_CONDUCT、Issue/PR 模板、MIT、README.zh、CHANGELOG、RELEASE_NOTES。

## 7. 测试与验证状态（本次实测）

| 项 | 结果 |
|---|---|
| 单元测试 | 21/21 passed |
| Web 构建 | 11 模块打包，dist/index.html ~164KB 自包含 |
| 冒烟一致性 | 打包核心==源码（逐位）+ Worker + HTML 自包含 |
| ESLint | 0 error（4 个嵌套三元 warning） |
| C# 构建 | 三项目 0 error |
| exe 运行 | WPF 窗口常驻、图标已嵌入 |

## 8. 已知限制与风险

1. 数据为确定性合成行情（非真实行情），仅验证算法正确性，不代表真实收益。
2. 默认组合对 15% 基准结论「跑输」属预期（合成随机游走无稳定 alpha）。
3. 纳指基准为「是否值得主动交易」的决策参照，非同风险基准。
4. 沙箱离线编译有特定适配（见 docs/08）。
5. 交易日为工作日简化口径（未含交易所节假日）。

## 9. 结论

项目结构完整、职责清晰，S1–S8 全部落地并通过验收；JS 与 C# 双实现逐位一致；
v1.1.0 补齐 lint/format/hooks/CI/E2E/API 文档/开源治理，工程化完整，可直接开源分发与持续集成。