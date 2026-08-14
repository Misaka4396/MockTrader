# MockTrader v1.2.0 更新报告：方案 A 实战化（真实行情 + 新闻趋势预测）

> 日期：2026-08-14 · 基线：v1.1.0 · 主题：把系统从「合成数据演示」推进为「真实数据 + 30 分钟新闻趋势预测」

## 一、本轮目标与成果概览

在保持原有 JS 核心 / Web / C# exe+dll 双实现不变的前提下，落地「方案 A」：
① 用真实期货行情替换合成数据；② 每 30 分钟抓新闻 → 情绪 → 趋势预测。
并补齐 6 项增强：

| # | 任务 | 状态 |
|---|---|---|
| 方案A | 数据采集层 + 新闻情绪因子 + 趋势预测 + 调度 | ✅ |
| ① | 新闻情绪接入 Web/WPF 界面 | ✅ |
| ② | 滚动回测验证新闻因子增量 alpha | ✅ |
| ③ | 金十/财联社 API + LLM 打标 | ✅ |
| ④ | 信号历史归档 + 回看 | ✅ |
| ⑤ | 滚动回测「真实 vs 合成」对照模式 | ✅ |
| ⑥ | Web/WPF 新闻源状态/更新时间显示 | ✅ |

## 二、新增/修改文件

### 核心算法（JS，可离线测试）
    src/core/factors/newsSentiment.js   新增：新闻情绪因子引擎（指数衰减加权 × 一致性折减，无未来函数）
                                          + dailySentimentByDate（逐日聚合）+ generateMockNews（演示新闻）
    src/core/trend/trendPredictor.js     新增：趋势预测（日线因子 z + 新闻情绪 z 融合 → 多空/中性）
    src/core/data/dataAccess.js          新增：loadMarketData()（从真实行情 JSON 加载）
    src/core/index.js                    导出新模块

### 数据采集/调度（Python，真实机运行）
    py/config.py                         品种/新闻源/多空词典/调度时段/LLM/Jin10/CLS 配置
    py/collect_quotes.py                 行情采集：TQsdk 全合约日线（回退 AkShare 主力连续）→ quotes.json
    py/collect_news.py                   新闻采集：新浪 7x24 + 品种关键词打标签 → items.json
    py/collect_jin10.py                  金十数据 7x24 快讯 flash API
    py/collect_cls.py                    财联社电报 nodeapi（含 sign 签名骨架）
    py/sentiment.py                      情感打标：词典 + 可选 LLM 批量（JSON 输出）
    py/scheduler.py                      APScheduler 盘中每 30min 调度，8:45 采行情
    py/requirements.txt / py/README.md   依赖与用法

### 工具与测试
    tools/predict.mjs                    趋势预测入口：读行情+新闻 → 信号 + 归档 history.jsonl
    tools/rolling_backtest.mjs           增量 alpha 验证（synthetic/real/both 三模式）
    tools/news_history.mjs               新闻情绪历史回看
    tools/demo_planA.mjs                 离线端到端演示
    test/test-news.mjs                   新增 7 项新闻/趋势测试（总数 28）

### 界面
    src/web/app.js / template.html / styles.css    Web 新闻情绪卡片 + 状态行
    cs/StrategyCore/NewsSentiment.cs               C# 新闻情绪（因子 + 演示新闻）
    cs/MockTrader/MainWindow.xaml(.cs)              WPF 新闻情绪卡片 + 状态行

### 文档
    docs/10_planA_implementation.md      数据契约/因子公式/启动清单
    docs/09_upgrade_proposals.md         三套升级方案对比
    docs/UPDATE_REPORT_planA.md（本文件）

## 三、核心设计

### 数据契约（JS 与 Python 对齐）
    quotes.json : { version, dates:[YYYY-MM-DD], dataset:{ code:{ contracts:{ contract:[bar] } } } }
                  bar = { date, open, high, low, close, settle, volume, openInterest }
    items.json  : [{ ts(ISO+08:00), source, title, content, tags:[code], sentiment:-1..1, label }]
    latest.json : { ts, lastDate, meta, news, newsZ, longs, shorts, top }

### 新闻情绪因子公式
    品种 c 在时刻 now（回看 4h）：
      weight_i = exp(-lambda * hours(ts_i, now))
      score    = Σ(sentiment_i * weight_i) / Σ(weight_i)
      agreement= max(多,空,中性)/n
      factor   = score * (0.5 + 0.5*agreement)
    随后截面 winsorize + z-score（与 5 因子同口径）

### 趋势预测
    trendScore(c) = wDaily * dailyZ(c) + wNews * newsZ(c)   （默认 1 : 0.6，阈值 0.3）

## 四、验证结果

| 项 | 结果 |
|---|---|
| 单元测试 | 28/28 通过（新增 7 项：符号/无未来函数/tag 过滤/衰减/方向） |
| 端到端 demo | 16 品种 × 11 个 30min 时间点 × 68 条新闻 → 多空候选 |
| 滚动回测(合成注入) | 新闻因子 IC 59.79%，增量 alpha +6.08pp，8/9 窗口跑赢 |
| 滚动回测(真实) | IC 0%（新闻时间与回测区间不重叠，已告警） |
| Web 冒烟 | 打包核心 == 源码逐位一致（13 模块） |
| WPF | 编译 0 错误、窗口正常启动、新闻面板就位 |
| Python | 全部通过 py_compile 语法检查 |

## 五、使用方式（真实机）

    pip install -r py/requirements.txt
    # 配环境变量：TQ_USER/TQ_PASSWORD（行情）、JIN10_*/CLS_*（新闻）、LLM_*（打标）
    py py/scheduler.py              # 8:45 采行情；盘中每 30min 新闻→打标→预测
    node tools/news_history.mjs     # 回看情绪归档
    node tools/rolling_backtest.mjs [synthetic|real|both]   # 验证 alpha

## 六、已知限制（诚实声明）

1. 新闻时间与历史回测区间不重叠：现在采集的新闻只能做「前向纸面验证」，历史回测需付费「历史新闻归档」。
2. 合成新闻「注入信号」只用于校验度量框架（证明能测出 alpha），不代表真实新闻有效。
3. 词典是冷启动基线，LLM 打标需配 API 凭证。
4. 金十/财联社接口与签名随官方调整，需按当前版本更新；新闻爬虫需遵守频率与条款。
5. 30 分钟级信号噪声大，务必滚动/样本外验证后再用于实盘。

## 七、下一步建议

    - 前向纸面验证记账脚本（每天记录预测 → N 日后统计命中率/收益，替代无法历史回测的问题）
    - 把 news_history 情绪轨迹画成折线图接入 Web/WPF
    - 接历史新闻归档后，用 rolling_backtest 真实模式重新验证 alpha
