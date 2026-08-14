# 方案 A 落地实现（docs/10）

方案 A = 保留现有 JS/C# 核心，前置 Python 采集层 + 新增「新闻情绪因子」与「趋势预测」。

## 1. 数据流

    真实行情(TQsdk/AkShare) ─► py/collect_quotes.py ─► data/market/quotes.json
    新闻(新浪7x24等)        ─► py/collect_news.py  ─► data/news/items.json
                             ─► py/sentiment.py    ─► 补齐 sentiment/label
    ─────────────────────────────────────────────────────────────────────
    node tools/predict.mjs ─► 日线5因子 + 新闻情绪因子 ─► TrendPredictor ─► data/signals/latest.json
    py/scheduler.py 每 30 分钟盘中自动跑（新闻->打标->预测），8:45 采行情

## 2. 数据契约

### quotes.json（真实行情，与 DataAccess.loadMarketData 对齐）
    { version:1, dates:[YYYY-MM-DD...], dataset:{ RB:{ contracts:{ RB2601:[bar...] } } } }
    bar = { date, open, high, low, close, settle, volume, openInterest }
    - TQsdk 路径：全合约日线（保留展期/roll-yield 能力）
    - AkShare 回退：主力连续（单合约 MAIN，无展期，roll-yield 因子为空）

### items.json（新闻，已打标）
    { ts: ISO+08:00, source, title, content, tags:[code...], sentiment:-1..1, label:bullish|bearish|neutral }

### latest.json（趋势信号）
    { ts, lastDate, longs:[{code,score,direction,strength,daily,news}], shorts:[...], top:[...] }

## 3. 新闻情绪因子公式（src/core/factors/newsSentiment.js）

    品种 c 在时刻 now（回看 lookbackHours=4h）：
      weight_i = exp(-lambda * hours(ts_i, now))        # 指数衰减
      score    = Σ(sentiment_i * weight_i) / Σ weight_i
      agreement= max(多,空,中性)/n                       # 一致性
      factor   = score * (0.5 + 0.5*agreement)          # 一致性折减
    随后截面 winsorize + z-score（与其它因子一致）

## 4. 趋势预测（src/core/trend/trendPredictor.js）

    trendScore(c) = wDaily * dailyZ(c) + wNews * newsZ(c)
    direction = trendScore > +threshold ? 做多 : < -threshold ? 做空 : 中性
    （默认 wDaily=1, wNews=0.6, threshold=0.3，可调）

## 5. 已验证（离线）

    - 28/28 单元测试（新增 7 项新闻/趋势测试：看多看空符号、无未来函数、tag 过滤、衰减、方向判定）
    - tools/demo_planA.mjs：16 品种 × 11 个 30min 时间点 × 68 条模拟新闻 -> 多空候选，端到端跑通
    - 真实数据路径用 loadMarketData + predict.mjs（数据契约已对齐，接真实行情/新闻即用）

## 6. 真实机启动清单

    1) pip install -r py/requirements.txt
    2) 配置 TQ_USER/TQ_PASSWORD（或接受 AkShare 回退）
    3) py py/collect_quotes.py && py py/collect_news.py && py py/sentiment.py && node tools/predict.mjs
    4) py py/scheduler.py  # 长期 30min 调度

## 6.5 运营能力（④⑤⑥）

    - 信号归档：predict.mjs 每次预测追加 data/signals/history.jsonl；tools/news_history.mjs 回看情绪排名与轨迹（可指定品种）
    - 滚动回测三模式：node tools/rolling_backtest.mjs [synthetic|real|both]，合成注入信号校验框架、真实读 items.json、both 对照
    - 历史回测需「历史新闻归档」（现在采集的新闻与 2022-2024 回测区间不重叠，只能前向纸面验证）
    - Web/WPF 新闻卡片显示「数据源 + 条数 + 更新时间」

## 7. 边界与后续

    - 新闻用多源免费爬虫，注意频率与合规；量大了换金十/财联社付费 API
    - 词典只是基线，LLM 打标在 config.py 配 LLM_* 即启用
    - 30min 信号噪声大，务必滚动回测验证；当前日线回测引擎保持不变（确定性）