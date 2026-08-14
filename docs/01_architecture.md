# 架构说明 (S8 映射)

本交付为**沙箱可运行**的原型：核心算法用纯 JavaScript（ESM）实现，可移植到任意运行时（Node / 浏览器 / 后续 C# 重写）。
因沙箱无法编译 C#/C++ exe+dll，C# 的「dll」职责映射为独立 JS 模块（每个引擎一个文件/类），接口与职责一一对应。

## 模块 ↔ 原 C# 架构映射

| 原规格 | C# 产物 | 本实现 (JS) | 职责 |
|--------|---------|-------------|------|
| S1 数据层 | DataAccess.dll | `src/core/data/dataAccess.js` | 多合约日线、主力/次主力连续、展期复权、元数据、本地存储 |
| S2 因子 | FactorEngine (dll) | `src/core/factors/factorEngine.js` | 5 因子面板（纯函数、向量化、无未来函数） |
| S3 策略 | StrategyEngine | `src/core/strategy/strategyEngine.js` | 因子合成、多空选品、中性化、调仓 |
| S4 回测 | BacktestEngine | `src/core/backtest/backtestEngine.js` | 保证金/乘数/逐日盯市/展期滚动/成本 |
| S5 绩效 | PerformanceEngine | `src/core/performance/performanceEngine.js` | 指标 + 纳指长线基准对比 |
| S6 主程序 | MockTrader.exe | `src/web/app.js` + `dist/index.html` | 薄 GUI，只调核心 |
| S7 图表 | ChartControl | `src/web/chart.js` | 净值单线 + 基准虚线 + 缩放/悬停/区间/回撤阴影 |
| S8 打包 | exe+dll 分层 | `tools/build-web.mjs` | ESM 打包为单 UMD + 自包含 HTML |

## 目录结构

```
src/core/          可移植核心（ESM，Node 可测、浏览器可打包）
  index.js         公共 API 桶 + runPipeline 一键流水线
  types.js utils.js
  data/            S1：metadata / synthetic / roll / dataAccess
  factors/         S2：factorEngine
  strategy/        S3：strategyEngine
  backtest/        S4：backtestEngine
  performance/     S5：performanceEngine
src/web/           薄 GUI：app.js / chart.js / worker.js / styles.css / template.html
tools/             build-web.mjs（打包器）/ smoke.mjs / persist.mjs
test/              单元测试（无依赖运行器 run-tests.mjs）
docs/              本文档
data/              本地存储产物（manifest/metadata/continuous/…）
dist/              可双击打开的 index.html + UMD mocktrader.js
```

## 流水线

```
DataAccess.generate() -> FactorEngine.compute() -> StrategyEngine.generate()
   -> BacktestEngine.run() -> PerformanceEngine.compute()
```
`runPipeline(options)` 将五步串起来并回报进度，GUI 在 Web Worker 中调用它，保证 UI 不阻塞。

## 运行方式

- 核心测试：`npm test`（或 `node test/run-tests.mjs`）
- 端到端验证：`node tools/smoke.mjs`
- 数据持久化：`node tools/persist.mjs`
- 构建 Web 原型：`npm run build:web` -> 双击 `dist/index.html`（离线自包含）
