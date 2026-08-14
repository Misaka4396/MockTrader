# MockTrader · 商品期货多空因子回测系统

[English](README.md) | **简体中文**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/Misaka4396/MockTrader/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933.svg)](package.json)
[![.NET](https://img.shields.io/badge/.NET-8.0-512BD4.svg)](cs/)
[![Test](https://img.shields.io/badge/test-21%20passed-brightgreen.svg)](test/)
[![CI](https://github.com/Misaka4396/MockTrader/actions/workflows/ci.yml/badge.svg)](https://github.com/Misaka4396/MockTrader/actions/workflows/ci.yml)

中国商品期货 **多合约 + 展期收益率 + 多空组合** 因子回测系统（方案 B），对比纳指长线收益率（单值基准）。
交付**三套产物**：可移植 **JS 核心** + 自包含 **Web 原型**（开发/验证/可视化）+ 原生 **C# exe+dll**（S8），
C# 每个 dll 职责与 JS 模块一一对应，同一确定性种子下**逐位一致**。

> ⚠️ 数据为确定性种子合成的模拟行情，**不代表真实收益**，仅用于验证算法正确性。

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [原生 exe+dll（S8）](#原生-exedlls8)
- [项目结构](#项目结构)
- [双实现一致性](#双实现一致性)
- [验收对照](#验收对照)
- [License](#license)

## 功能特性

| 模块 | 特性 |
|------|------|
| 📊 数据层 S1 | 45 品种元数据（乘数/保证金/tick/上市退市日期）、确定性合成多合约日线、主力/次主力连续、后复权比值法展期复权（**换月零跳空**）、1.15 迟滞防抖动 |
| 🧮 因子引擎 S2 | 5 因子面板：截面动量(12-1) / -Amihud 流动性 / 量比 / 价格偏度 / 展期收益率；纯函数无未来函数；MAD winsorize + 截面 z-score |
| 🎯 策略引擎 S3 | 因子合成（等权/IC 加权/自定义）、多 5 空 5 多空选品、方向中性、月度/周度调仓、缓冲带降换手 |
| 💰 回测引擎 S4 | 逐日盯市、保证金与 1.5 倍杠杆上限、t+1 收盘成交（无前视）、双边手续费+滑点、展期自动换月、退市强平、爆仓保护 |
| 📈 绩效引擎 S5 | 年化/Sharpe/最大回撤/卡玛/波动率/胜率；纳指长线基准（默认 15% 可配置），±2pp 判定跑赢/跑输/接近 |
| 🖥️ Web 原型 S6/S7 | 自包含单文件 HTML（离线双击可用）、Worker 后台执行不卡 UI、Canvas 自绘净值图（缩放/拖拽/悬停/回撤阴影） |
| 🏗️ C# 原生版 S8 | DataAccess.dll + StrategyCore.dll + MockTrader.exe（WPF）三层分层，与 JS 逐位一致，离线可编译 |

## 快速开始

```bash
npm test                       # 21 项单元测试（S1-S5 验收）
npm run lint                   # ESLint 质量检查
npm run format                 # Prettier 格式化
node tools/persist.mjs         # 生成本地数据文件到 data/
npm run build:web              # 打包为 dist/index.html
# 双击 dist/index.html 即可运行（离线自包含，后台线程 + 进度条不卡 UI）
node tools/smoke.mjs           # 验证打包核心与源码结果一致 + worker + HTML
```

## 原生 exe+dll（S8）

沙箱实测有 dotnet 8 SDK（离线可编译），已产出真正 exe+dll：

```bash
powershell -ExecutionPolicy Bypass -File cs\build.ps1   # 产物在 release/
release\MockTrader.exe
```

| 文件 | 大小 | 职责 |
|------|------|------|
| MockTrader.exe | ~140 KB | 薄入口 + WPF 图形界面（apphost 地板） |
| StrategyCore.dll | ~29 KB | S2-S5 因子/策略/回测/绩效 |
| DataAccess.dll | ~25 KB | S1 数据层 |

> 预编译产物可在 [Releases](https://github.com/Misaka4396/MockTrader/releases) 页面下载。

## 项目结构

```text
src/core/          可移植核心（S1-S5，纯函数 ESM，Node 可测、浏览器可打包）
  index.js         公共 API 桶 + runPipeline 一键流水线
  types.js utils.js
  data/            S1：metadata / synthetic / roll / dataAccess
  factors/         S2：factorEngine
  strategy/        S3：strategyEngine
  backtest/        S4：backtestEngine
  performance/     S5：performanceEngine
src/web/           薄 GUI（S6/S7）：app.js / chart.js / worker.js / styles.css / template.html
cs/                S8 原生 C# 版：DataAccess / StrategyCore / MockTrader（WPF）三项目
test/              21 项单元测试（零依赖运行器）+ 冒烟脚本
tools/             打包器 build-web.mjs / 冒烟 smoke.mjs / 持久化 persist.mjs
docs/              设计文档 01-08（架构/数据 schema/因子/策略/回测会计/绩效/基准风险/exe-dll）
data/              本地数据文件（manifest / metadata / continuous 45 品种）
dist/              可分发产物：index.html（离线自包含）+ mocktrader.js（UMD）
release/           原生 exe+dll 产物（由 Release 附件分发，不入库）
```

## 双实现一致性

| 原规格 | C# 产物 | JS 模块 | 职责 |
|--------|---------|---------|------|
| S1 数据层 | DataAccess.dll | `src/core/data/dataAccess.js` | 多合约日线、主力/次主力连续、展期复权、元数据 |
| S2 因子 | StrategyCore.dll | `src/core/factors/factorEngine.js` | 5 因子面板（纯函数、无未来函数） |
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
| 基准可配置、口径备注 | perfConfig.benchmarkAnnual + docs/06/07 |
| exe 薄 / 逻辑在 dll / 可分发 | 核心在 JS 模块，GUI 只调 runPipeline；dist/index.html 单文件分发 |

## License

[MIT](LICENSE) © Misaka4396
