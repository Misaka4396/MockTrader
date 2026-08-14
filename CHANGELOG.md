# Changelog

本项目所有重要变更均记录在此文件中，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.3.1] - 2026-08-14

### Added

- **模拟盘报告生成**：`src/core/report/reportGenerator.js`（六章节报告：绩效 / 基准对比 / 交易与成本 / 风控 VaR·压力 / 因子摘要 / 结论免责）+ C# `ReportGenerator.cs` 镜像 + `tools/generate_report.mjs` 一键生成（Markdown + JSON，含数据版本指纹）。
- **报告入口**：Web（app.js / template.html / worker.js）与 WPF（MainWindow）均新增报告查看/生成入口。
- 单元测试 37 → **39 项**（报告章节完整性、JSON 数据完整性）。
- `docs/14_economic_analysis.md`：策略多学派经济学分析（奥地利 / 新古典 / 行为经济学三视角）。

### Changed

- 版本号 1.3.0 → 1.3.1。

## [1.3.0] - 2026-08-14

### Added

- **Phase 1 研究可信度**：样本外分割 + Walk-forward（`tools/walkforward.mjs`，含参数稳健性网格）、
  `DataAccess.dataFingerprint()` 数据版本指纹、多源交叉校验（`py/verify_sources.py`）、
  冲击成本模型（平方根，可选默认关闭保持逐位一致）、真实路径前视审计（`tools/lookahead_audit.mjs`）。
- **Phase 2 研究深度**：alphalens 式因子流水线 `src/core/research/factorAnalysis.js`（分层收益 / IC 衰减 / 换手 / 相关性矩阵 / Gram-Schmidt 正交化）、
  风控 `src/core/risk/risk.js`（历史 VaR / CVaR / 压力测试）、组合优化 `src/core/portfolio/optimizer.js`（逆波动率 / 等风险贡献 / 板块上限）、
  因子注册表 `FACTOR_REGISTRY`、回撤熔断 `drawdownCutoff`（JS + C# 双实现镜像）；`tools/factor_report.mjs` / `risk_report.mjs` / `portfolio_demo.mjs`。
- **Phase 3 实盘准备（部分）**：前向纸面验证账本 `src/core/research/paperLedger.js` + `tools/paper_trading.mjs`、
  告警 `py/alert.py`（钉钉/企微）、调度监控 `py/monitor.py`（心跳 + 数据新鲜度）、CTP 模拟盘骨架 `py/ctp_paper.py`。
- 单元测试 28 → **37 项**（因子分析×5 / 风控 / 组合 / 纸面账本 / 回撤熔断）。

### Changed

- `BacktestEngine`（JS + C#）：新增可选冲击成本与回撤熔断（默认关闭，与原行为逐位一致）。
- 版本号 1.2.0 → 1.3.0；docs 新增 11_roadmap / 12_phase2_research / 13_phase3_live。

## [1.2.0] - 2026-08-14

### Added

- **方案 A 实战化**：新闻情绪因子（newsSentiment.js）+ 趋势预测（trendPredictor.js）+ 真实行情加载（loadMarketData）
- **Python 采集/调度层**：collect_quotes（TQsdk/AkShare）、collect_news（新浪/金十/财联社）、sentiment（词典+LLM 批量打标）、scheduler（盘中 30min）
- **新闻情绪 UI**：Web 与 WPF 均新增新闻情绪卡片（看多/看空 Top5 + 数据源/更新时间状态）
- **增量 alpha 验证**：rolling_backtest 三模式（合成注入/真实/对照）+ 新闻因子 IC 分析
- **信号归档与回看**：predict.mjs 追加 history.jsonl + news_history.mjs 回看情绪轨迹

### Changed

- 单元测试 21 → 28 项；docs 新增 09/10 与 UPDATE_REPORT；版本号 1.1.0 → 1.2.0

## [1.1.0] - 2026-08-14

### Added

- **Lint/Format 工具链**：ESLint 9（flat config）+ Prettier 3 + .editorconfig；质量与格式职责分离，`npm run lint` / `npm run format`。
- **Git Hooks**：husky + lint-staged（提交前自动 lint+format）+ commitlint（Conventional Commits 强制校验提交信息）。
- **CI 流水线**：GitHub Actions（.github/workflows/ci.yml）——lint → format check → commitlint → 21 项单测 → build:web → smoke，push/PR 触发。
- **开源治理**：CONTRIBUTING.md、CODE_OF_CONDUCT.md（Contributor Covenant 2.1）、Issue 模板（bug/feature）、PR 模板。

### Changed

- `src/web/`（app.js / worker.js）消除全部 `var`（改用 let/const，并修复 `worker` 未声明即使用的隐式全局缺陷）。
- 全量 JS 代码按 Prettier 规范重排（行宽 100、单引号、尾逗号）；清理 13 处未使用导入。
- **C# 移植版重构（P1 整改）**：9 个源码文件全部 public 可变字段改为自动属性（含多变量声明拆分、保留默认值）；
  `Synthetic.cs` 价格/成交量合成噪声系数等魔法数字收敛为命名常量（`NoiseBasis`/`NoiseDailyEps`/`WarmupDays`/`ContractListLeadDays` 等 11 个）。
  编译通过 + 数值一致性验证逐位不变（期末权益 9,164,404 / 450 笔 / 245 展期 / 年化 -2.78% / 结论「跑输」）。
- **API 文档**：接入 TypeDoc（`npm run docs:api` 生成 docs/api，产物不入库），修复 `buildMainSub` JSDoc 兼容性。
- **工具链修复**：lint-staged 排除 `dist/**`（构建产物不再被 eslint/prettier 改写）。
- **E2E 冒烟（P10 整改）**：Playwright 驱动 `dist/index.html`（离线自包含 + 系统 Edge/Chromium 双通道），
  跑通 45 品种全流水线并断言结论卡片「跑输」、6 项 KPI、摘要、Canvas 与零页面错误；已纳入 CI 质量门禁。

## [1.0.0] - 2026-08-14

### Added

- **S1 数据层**：45 个中国商品期货品种元数据（黑色/有色/能化/农产品/贵金属，含 3 个已退市品种），
  确定性种子合成多合约日线（OHLCV+持仓量），主力/次主力连续序列，后复权比值法展期复权（消除换月跳空），
  1.15 迟滞系数防主力抖动。
- **S2 因子引擎**：5 因子面板（截面动量 12-1、-Amihud 流动性、量比、价格偏度、展期收益率），
  纯函数、无未来函数，MAD winsorize + 截面 z-score 标准化，参数可调。
- **S3 策略引擎**：因子合成得分（等权/IC 加权/自定义权重）、多空选品（多 5 空 5）、方向中性、
  月度/周度调仓 + 缓冲带降换手。
- **S4 回测引擎**：初始资金 1000 万、逐日盯市、保证金占用与 1.5 倍杠杆上限、t+1 日收盘成交、
  双边手续费 + 滑点成本、主力切换自动换月（复权价算盈亏 / 原始价算保证金双价记账）、退市强平、爆仓保护。
- **S5 绩效引擎**：年化收益、Sharpe、最大回撤、卡玛、波动率、胜率 6 项指标；纳指长线基准对比
  （默认 15% 可配置），±2pp 阈值判定「跑赢/跑输/接近」。
- **S6/S7 Web 原型**：自包含单文件 HTML（dist/index.html，离线双击可用），Web Worker 后台执行不卡 UI，
  品种池多选、策略参数面板、结论卡片 + 6 项指标卡片、Canvas 自绘净值图（缩放/拖拽/悬停/回撤阴影）。
- **S8 原生 C# 版本**：DataAccess.dll + StrategyCore.dll + MockTrader.exe（WPF）三层 exe+dll 分层，
  与 JS 核心逐位一致（同一确定性种子：45 品种 / 782 日 / 450 笔交易 / 期末权益 9,164,404）；
  完全离线编译适配（DOTNET_CLI_HOME / NUGET_PACKAGES 重定向、HintPath 引用、零包源）。
- **测试与工具链**：21 项零依赖单元测试（S1-S5 验收）、正则驱动迷你 ESM 打包器、
  冒烟验证脚本（打包一致性 / Worker / HTML 自包含）、数据持久化脚本。
