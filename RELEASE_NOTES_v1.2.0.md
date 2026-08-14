# MockTrader v1.2.0

🚀 v1.2.0 — **方案 A 实战化**：真实行情 + 新闻情绪因子 + 30 分钟趋势预测。

## 📦 发布物

- **mocktrader-web.html** — 离线自包含 Web 原型（`dist/index.html`，含新闻情绪卡片）
- **MockTrader-win-x64.zip** — 原生 C# exe+dll（v1.2.0 重新编译，含 `NewsSentiment.cs`，需 [.NET 8 运行时](https://dotnet.microsoft.com/download/dotnet/8.0)）

## ✨ 新增（v1.2.0）

| 模块 | 内容 |
|------|------|
| 📰 **新闻情绪因子 S9** | 指数时间衰减加权 × 一致性折减，按品种 tag 过滤，**无未来函数**；JS `newsSentiment.js` + C# `NewsSentiment.cs` 双实现 |
| 🔮 **趋势预测 S10** | `trendScore = wDaily·dailyZ + wNews·newsZ`（默认 1:0.6，阈值 0.3）→ 多空/中性 |
| 🐍 **Python 采集/调度层 S11** | TQSDK 行情（AkShare 回退）、新浪 7×24 / 金十 flash / 财联社电报新闻、词典+可选 LLM 打标、APScheduler 盘中 30min 调度 |
| 💾 **真实数据路径** | `DataAccess.loadMarketData()` 加载真实行情（契约与 Python 对齐）；信号归档 `history.jsonl` + `news_history.mjs` 回看 |
| 🖥️ **双端 UI** | Web 与 WPF 均新增新闻情绪卡片（多空 Top5 + 数据源/更新时间状态行） |
| 🧪 **测试与验证** | 单元测试 21 → **28 项**；`rolling_backtest.mjs` 三模式（合成注入/真实/对照） |

## ✅ 验证

- **28/28 单元测试通过**（新增 7 项：看多/看空符号、无未来函数、tag 过滤、指数衰减、时间戳对齐、融合方向）
- 端到端 demo：16 品种 × 11 个 30min 时间点 × 68 条新闻 → 多空候选
- 滚动回测（合成注入信号，校验度量框架）：**新闻因子 IC 59.79% · 基线 3.14% → 增强 9.22% · 增量 alpha +6.08pp · 8/9 窗口跑赢**
- 滚动回测（真实）：IC 0.00%（真实新闻 2026-08 与回测区间 2022-24 无重叠，已正确告警）
- Web 冒烟：打包核心 == 源码逐位一致；WPF 编译 0 错误；Python 7 脚本 py_compile 通过
- CI 全绿（lint → format → commitlint → 28 测试 → build → smoke → E2E）

## ⚠️ 诚实声明

1. 新闻时间戳与历史回测区间不重叠，真实模式 IC=0 是数据缺口；历史 alpha 需购付费新闻归档或前向纸面验证。
2. 合成注入的 IC 59.79% 仅证明度量框架正确，不代表真实新闻有效。
3. 词典为冷启动基线，LLM 打标需配置 API 凭证。
4. 30min 信号噪声大，务必滚动/样本外验证后再用于实盘；爬虫需遵守频率与条款。
