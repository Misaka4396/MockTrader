# MockTrader · 商品期货多空因子回测系统

[English](README.md) | **简体中文**

[![Version](https://img.shields.io/badge/version-1.3.0-blue.svg)](https://github.com/Misaka4396/MockTrader/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933.svg)](package.json)
[![.NET](https://img.shields.io/badge/.NET-8.0-512BD4.svg)](cs/)
[![Test](https://img.shields.io/badge/test-37%20passed-brightgreen.svg)](test/)
[![CI](https://github.com/Misaka4396/MockTrader/actions/workflows/ci.yml/badge.svg)](https://github.com/Misaka4396/MockTrader/actions/workflows/ci.yml)

中国商品期货 **多合约 + 展期收益率 + 多空组合** 因子回测系统（方案 B），对比纳指长线收益率（单值基准）。
交付**三套产物**：可移植 **JS 核心** + 自包含 **Web 原型**（开发/验证/可视化）+ 原生 **C# exe+dll**（S8），
C# 每个 dll 职责与 JS 模块一一对应，同一确定性种子下**逐位一致**。

**v1.2.0（方案 A 实战化）**：新增 Python 真实数据采集层（TQSDK/AkShare 行情、新浪/金十/财联社新闻）、
**新闻情绪因子**（指数衰减 × 一致性折减，无未来函数）、**趋势预测**（日线因子 + 新闻情绪 → 多空/中性）、
盘中 30 分钟调度与信号归档；Web 与 WPF 均展示实时行情/新闻状态。

**v1.3.0（Phase 1-3）**：研究可信度（**样本外分割 + Walk-forward**、数据版本指纹、多源交叉校验、冲击成本模型、前视审计）、
研究深度（alphalens 式**因子分析流水线**、**组合优化**、**VaR/CVaR 风控**、回撤熔断、因子注册表）、
实盘准备（前向**纸面验证账本**、钉钉/企微告警、调度监控、CTP 模拟盘骨架）——JS 与 C# 双实现镜像同步。

> ⚠️ 回测核心默认使用确定性种子合成的模拟行情，**不代表真实收益**，仅用于验证算法正确性；
> 真实行情/新闻由 `py/` 脚本采集，新闻时间戳与回测区间不重叠，新闻增量 alpha 需前向纸面验证后再使用。

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [真实数据流水线（v1.2.0）](#真实数据流水线v120)
- [原生 exe+dll（S8）](#原生-exedlls8)
- [项目结构](#项目结构)
- [双实现一致性](#双实现一致性)
- [验收对照](#验收对照)
- [License](#license)

## 功能特性

| 模块 | 特性 |
|------|------|
| 📊 数据层 S1 | 45 品种元数据（乘数/保证金/tick/上市退市日期）、多合约日线、主力/次主力连续、后复权比值法展期复权（**换月零跳空**）、1.15 迟滞防抖动；`loadMarketData` 加载真实行情 |
| 🧮 因子引擎 S2 | 5 因子面板：截面动量(12-1) / -Amihud 流动性 / 量比 / 价格偏度 / 展期收益率；纯函数无未来函数；MAD winsorize + 截面 z-score |
| 🎯 策略引擎 S3 | 因子合成（等权/IC 加权/自定义）、多 5 空 5 多空选品、方向中性、月度/周度调仓、缓冲带降换手 |
| 💰 回测引擎 S4 | 逐日盯市、保证金与 1.5 倍杠杆上限、t+1 收盘成交（无前视）、双边手续费+滑点、展期自动换月、退市强平、爆仓保护 |
| 📈 绩效引擎 S5 | 年化/Sharpe/最大回撤/卡玛/波动率/胜率；纳指长线基准（默认 15% 可配置），±2pp 判定跑赢/跑输/接近 |
| 🖥️ Web 原型 S6/S7 | 自包含单文件 HTML（离线双击可用）、Worker 后台执行不卡 UI、Canvas 自绘净值图（缩放/拖拽/悬停/回撤阴影） |
| 🏗️ C# 原生版 S8 | DataAccess.dll + StrategyCore.dll + MockTrader.exe（WPF）三层分层，与 JS 逐位一致，离线可编译 |
| 📰 新闻情绪 S9 | 新闻情绪因子：指数时间衰减加权 × 一致性折减、按品种 tag 过滤、**无未来函数**；与 5 因子同口径 winsorize+z-score；C# `NewsSentiment.cs` 镜像实现 |
| 🔮 趋势预测 S10 | `trendScore = wDaily·dailyZ + wNews·newsZ`（默认 1:0.6，阈值 0.3）→ 多空/中性；滚动回测三模式（合成/真实/对照） |
| 🐍 Python 采集 S11 | 行情采集（TQSDK 全合约，AkShare 回退）、新闻采集（新浪 7x24/金十 flash/财联社电报）、词典+可选 LLM 打标、APScheduler 盘中 30min 调度、信号归档 JSONL |
| 🔬 研究平台 S12 | alphalens 式因子分析（分层收益/IC 衰减/换手/相关性矩阵/Gram-Schmidt 正交化）、因子注册表、样本外分割 + Walk-forward + 参数稳健性网格、数据指纹、前视审计 |
| 🛡️ 风控 S13 | 历史 VaR/CVaR/最大回撤/压力测试；逆波动率 & 等风险贡献组合加权 + 板块暴露上限；回撤熔断（可选，默认关闭） |
| 🚀 实盘准备 S14 | 前向纸面验证账本（记录→结算→命中率统计）、钉钉/企微告警、调度心跳与数据新鲜度监控、CTP 模拟盘骨架 |

## 快速开始

```bash
npm test                       # 37 项单元测试（S1-S5 + 新闻/趋势 + 研究/风控/组合/纸面）
npm run lint                   # ESLint 质量检查
npm run format                 # Prettier 格式化
npm run build:web              # 打包为 dist/index.html
# 双击 dist/index.html 即可运行（离线自包含，后台线程 + 进度条不卡 UI）
node tools/smoke.mjs           # 验证打包核心与源码结果一致 + worker + HTML
```

## 真实数据流水线（v1.2.0）

```bash
pip install -r py/requirements.txt
# 环境变量：TQ_USER/TQ_PASSWORD（行情）、JIN10_*/CLS_*（新闻）、LLM_*（打标）
python py/collect_quotes.py    # 行情 → data/market/quotes.json
python py/collect_news.py      # 新闻 → data/news/items.json
python py/sentiment.py         # 词典 + LLM 打标
node tools/predict.mjs         # 趋势信号 → data/signals/latest.json + history.jsonl
python py/scheduler.py         # 长期运行：8:45 采行情；盘中每 30min 新闻→打标→预测
node tools/rolling_backtest.mjs [synthetic|real|both]   # 新闻因子增量 alpha 验证
node tools/news_history.mjs    # 情绪历史回看
```

## 研究与风控工具（v1.3.0）

```bash
node tools/walkforward.mjs        # 样本外分割 + 参数网格 + Walk-forward
node tools/factor_report.mjs      # 因子研究报告（分层/IC 衰减/换手/相关性/正交化）
node tools/risk_report.mjs        # VaR / CVaR / 回撤 / 压力测试
node tools/portfolio_demo.mjs     # 等权 vs 逆波动率 vs 板块上限对比
node tools/lookahead_audit.mjs    # 真实数据路径无前视审计
node tools/impact_check.mjs       # 冲击成本模型对期末权益的影响
node tools/paper_trading.mjs      # 前向纸面验证（命中率统计）
python py/verify_sources.py       # TQSDK vs AkShare 多源交叉校验
python py/monitor.py              # 调度心跳 + 数据新鲜度监控
python py/alert.py                # 钉钉 / 企微告警推送
```

## 原生 exe+dll（S8）

```bash
powershell -ExecutionPolicy Bypass -File cs\build.ps1   # 产物在 release/
release\MockTrader.exe
```

| 文件 | 大小 | 职责 |
|------|------|------|
| MockTrader.exe | ~140 KB | 薄入口 + WPF 图形界面（apphost 地板） |
| StrategyCore.dll | ~30-45 KB | S2-S5 因子/策略/回测/绩效 + S9 新闻情绪 |
| DataAccess.dll | ~25-32 KB | S1 数据层 |

> 预编译产物可在 [Releases](https://github.com/Misaka4396/MockTrader/releases) 页面下载。

## 项目结构

```text
src/core/          可移植核心（纯函数 ESM，Node 可测、浏览器可打包）
  index.js         公共 API 桶 + runPipeline 一键流水线
  data/            S1：metadata / synthetic / roll / dataAccess（+ loadMarketData、dataFingerprint）
  factors/         S2：factorEngine · S9：newsSentiment
  strategy/        S3：strategyEngine
  backtest/        S4：backtestEngine（+ 冲击成本、回撤熔断）
  performance/     S5：performanceEngine
  trend/           S10：trendPredictor
  research/        S12：factorAnalysis / paperLedger
  risk/            S13：risk（VaR / CVaR / 压力）
  portfolio/       S13：optimizer（逆波动率 / ERC / 板块上限）
src/web/           薄 GUI（S6/S7）：app.js / chart.js / worker.js / styles.css / template.html
cs/                S8 原生 C# 版：DataAccess / StrategyCore（NewsSentiment、冲击、熔断）/ MockTrader（WPF）
py/                S11/S14 Python 层：collect_* / sentiment / scheduler / verify_sources / monitor / alert / ctp_paper
test/              37 项单元测试（零依赖运行器）+ 冒烟脚本
tools/             build-web / smoke / persist / predict / rolling_backtest / news_history / walkforward / factor_report / risk_report / portfolio_demo / lookahead_audit / impact_check / paper_trading / demo_planA
docs/              设计文档 01-13（架构/数据/因子/策略/会计/绩效/基准/exe-dll/升级方案/方案A/路线图/Phase2/Phase3）
data/              本地数据：manifest / metadata / continuous + market / news / signals（真实数据）
dist/              可分发产物：index.html（离线自包含）+ mocktrader.js（UMD）
release/           原生 exe+dll 产物（由 Release 附件分发，不入库）
```

## 双实现一致性

| 原规格 | C# 产物 | JS 模块 | 职责 |
|--------|---------|---------|------|
| S1 数据层 | DataAccess.dll | `src/core/data/dataAccess.js` | 多合约日线、主力/次主力连续、展期复权、元数据、真实行情加载 |
| S2 因子 | StrategyCore.dll | `src/core/factors/factorEngine.js` | 5 因子面板（纯函数、无未来函数） |
| S9 新闻情绪 | StrategyCore.dll | `src/core/factors/newsSentiment.js` | 新闻情绪因子（指数衰减×一致性折减） |
| S10 趋势预测 | — | `src/core/trend/trendPredictor.js` | 日线+新闻融合 → 多空/中性 |
| S3 策略 | StrategyCore.dll | `src/core/strategy/strategyEngine.js` | 因子合成、多空选品、中性化、调仓 |
| S4 回测 | StrategyCore.dll | `src/core/backtest/backtestEngine.js` | 保证金/乘数/逐日盯市/展期滚动/成本 |
| S5 绩效 | StrategyCore.dll | `src/core/performance/performanceEngine.js` | 指标 + 纳指长线基准对比 |
| S6/S7 GUI | MockTrader.exe | `src/web/app.js` + `dist/index.html` | 薄 GUI，只调核心 |
| S8 打包 | exe+dll 分层 | `tools/build-web.mjs` | ESM 打包为单 UMD + 自包含 HTML |

## 验收对照

| 验收点 | 实现/验证 |
|--------|-----------|
| 任意品种主力/次主力/各月合约可读 | DataAccess.getSeries/getBars/getContracts |
| 展期复权后无异常跳空 | 后复权比值法 + test-data「back-adjust removes roll jump exactly」 |
| 品种元数据完整 | 45 品种（含 3 个已退市）乘数/保证金/tick/上市退市日期 |
| 因子可复现/符号正确/无未来函数 | FactorEngine + test-factors |
| 展期收益率与升贴水一致 | rollYield ≈ -carry，test-data/test-factors 断言 |
| 单/多因子切换、多空信号、方向中性 | StrategyEngine + test-strategy |
| 净值可复现/展期滚动无跳空/成本正确/多空符号 | BacktestEngine + test-backtest |
| 指标可复现/超额收益/结论判定 | PerformanceEngine + test-performance |
| 新闻因子符号正确/无未来函数/tag 过滤/衰减 | NewsSentimentEngine + test-news（7 项） |
| 趋势融合得分与方向判定 | TrendPredictor + test-news |
| 新闻因子增量 alpha 可度量 | rolling_backtest 三模式（合成 IC 59.79% / alpha +6.08pp） |
| 因子分析流水线（分层/IC 衰减/换手/相关/正交） | factorAnalysis + test-research（5 项） |
| 风控指标（VaR/CVaR/压力）与回撤熔断 | risk.js + backtest drawdownCutoff + 测试 |
| 组合优化（逆波动率/ERC/板块上限） | portfolio optimizer + 测试 |
| 样本外/Walk-forward 度量框架 | tools/walkforward.mjs（4/5 窗口 OOS 为正） |
| 前向纸面验证 | PaperLedger + paper_trading.mjs（3942 笔预测） |
| 基准可配置、口径备注 | perfConfig.benchmarkAnnual + docs/06/07 |
| exe 薄 / 逻辑在 dll / 可分发 | 核心在 JS 模块，GUI 只调 runPipeline；dist/index.html 单文件分发 |

## License

[MIT](LICENSE) © Misaka4396
