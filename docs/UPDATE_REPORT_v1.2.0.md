# MockTrader v1.2.0 更新报告（独立验证确认版）

> 日期：2026-08-14 · 基线：v1.1.0 · 主题：**方案 A 实战化落地 —— 真实行情 + 新闻情绪因子 + 趋势预测**
> 说明：本报告基于 `docs/UPDATE_REPORT_planA.md`（开发自声明）逐项独立复测，全部声明经本机实测确认。

---

## 一、更新内容概览

在保持 JS 核心 / Web / C# 双实现不变的前提下，落地「方案 A」：用真实期货行情替换合成数据，每 30 分钟抓新闻 → 情绪打分 → 趋势预测，并补齐 6 项运营能力。

| 模块 | 新增内容 |
|---|---|
| **新闻情绪因子** | `src/core/factors/newsSentiment.js`：指数衰减加权 × 一致性折减（无未来函数），逐日聚合 + 演示新闻生成 |
| **趋势预测** | `src/core/trend/trendPredictor.js`：日线因子 z + 新闻情绪 z 融合（默认 1 : 0.6，阈值 0.3）→ 多空/中性 |
| **真实数据加载** | `dataAccess.loadMarketData()`：从真实行情 JSON（quotes.json 契约）加载，DataAccess 接口不变 |
| **Python 采集/调度层** | `py/`：collect_quotes（TQsdk，AkShare 回退）、collect_news（新浪 7x24）、collect_jin10（金十 flash API）、collect_cls（财联社 nodeapi）、sentiment（词典 + 可选 LLM 批量打标）、scheduler（APScheduler 盘中 30min + 8:45 采行情） |
| **工具与测试** | `tools/`：predict（预测 + 信号归档 history.jsonl）、rolling_backtest（synthetic/real/both 三模式）、news_history（情绪回看）、demo_planA（离线端到端）；`test/test-news.mjs` 新增 7 项测试 |
| **界面** | Web（app.js/template.html/styles.css）与 WPF（MainWindow + NewsSentiment.cs）均新增**新闻情绪卡片**（多空 Top5 + 数据源/更新时间状态行） |
| **数据产物** | `data/market/quotes.json`（真实行情 10.3MB）、`data/news/items.json`（新闻）、`data/signals/{latest.json,history.jsonl}`（信号） |
| **文档** | docs/09（升级方案对比）、docs/10（方案 A 实现）、UPDATE_REPORT_planA（开发自声明） |

## 二、独立验证结果（本机实测，2026-08-14）

| # | 验证项 | 命令 | 结果 |
|---|---|---|---|
| 1 | 单元测试 | `npm test` | ✅ **28/28 通过**（新增 7 项：看多/看空符号、无未来函数、tag 过滤、指数衰减、时间戳对齐、融合方向） |
| 2 | 端到端 demo | `node tools/demo_planA.mjs` | ✅ 68 条新闻 · 16 品种 · 11 个时间点，多空候选输出正常 |
| 3 | 滚动回测（合成注入） | `node tools/rolling_backtest.mjs synthetic` | ✅ 新闻因子 **IC 59.79%**；基线 3.14% → 增强 9.22%；**增量 alpha +6.08pp**；**8/9 窗口跑赢**（平均 6.94pp） |
| 4 | 滚动回测（真实） | `node tools/rolling_backtest.mjs real` | ✅ IC 0.00%（真实新闻 2026-08 与回测区间 2022-24 无重叠，已正确告警） |
| 5 | 打包一致性 | `node tools/smoke.mjs` | ✅ bundle == 源码逐位一致（13 模块），worker + HTML 自包含 |
| 6 | WPF 编译 | `dotnet build`（StrategyCore + MockTrader） | ✅ 0 错误 |
| 7 | Python 语法 | `py_compile`（7 个脚本） | ✅ 退出码 0 |
| 8 | ESLint | `npx eslint .` | ✅ 0 errors（7 个风格警告保留） |
| 9 | Prettier | `npx prettier --check .` | ✅ 全绿 |

**开发自声明（UPDATE_REPORT_planA.md）与实测结果全部吻合。**

## 三、验证中发现并已修复的问题

1. **新代码未过质量门禁**：v1.2.0 新模块（newsSentiment.js / trendPredictor.js / 新 tools / test-news.mjs）存在 **50 个 ESLint 错误 + 9 个格式问题**（curly/eqeqeq/prefer-template 等），会导致 CI 失败。
   → 已执行 `eslint --fix` + `prettier --write` **全部清零**（0 errors），并重新跑 28/28 测试确认无行为变化。
2. **dist 产物与源码脱同步**：修复后重建 `dist/`（mocktrader.js 72,464 bytes / index.html 181,766 bytes），smoke 复验一致。

## 四、遗留风险与建议（诚实声明）

| 风险 | 说明 | 建议 |
|---|---|---|
| ⚠️ **真实新闻无法历史回测** | 采集的新闻（2026-08 起）与回测区间（2022-24）不重叠，real 模式 IC=0 是数据缺口而非模型失败 | 前向纸面验证记账（预测 → N 日后命中率）；或购付费历史新闻归档 |
| ⚠️ **合成注入的 alpha 不可外推** | IC 59.79% 是"注入已知信号校验框架"，证明度量工具可用，不代表真实新闻有效 | 仅作框架正确性证据 |
| ⚠️ **quotes.json 10.3MB 入库问题** | 真实行情为采集产物（TQsdk/AkShare 可重新拉取），直接提交会让仓库膨胀约 2 倍 | 建议加入 .gitignore（保留采集脚本），或入库前确认体积策略 |
| ⚠️ **接口合规** | 金十/财联社接口与签名随官方调整；新闻爬虫需控制频率 | 量大了换付费 API；爬虫遵守 robots/条款 |
| ⚠️ **30min 信号噪声** | 短周期预测过拟合风险高 | 严格滚动/样本外验证（rolling_backtest 已具备） |

## 五、后续建议

1. 前向纸面验证记账脚本（记录预测 → 统计命中率，绕过"无历史新闻"问题）。
2. 情绪轨迹折线图接入 Web/WPF（news_history 已有数据）。
3. 获取历史新闻归档后，用 `rolling_backtest.mjs real` 重新验证真实 alpha。
4. 提交前确认 data/ 大文件入库策略（quotes.json 建议 gitignore）。

## 六、结论

v1.2.0（方案 A）**实现完整、声明全部属实**：核心算法（新闻情绪因子 + 趋势预测）设计严谨（无未来函数、指数衰减、一致性折减）、测试与验证体系完善（28 测试 + 三模式滚动回测 + 双端 UI）、Python 采集层覆盖 TQsdk/新浪/金十/财联社 + LLM 打标。质量门禁问题已当场修复。**具备发布条件**（发布前建议先处理 quotes.json 入库策略）。
