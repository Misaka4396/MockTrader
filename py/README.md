# py/ — 方案 A 数据采集与调度层（真实机上运行）

## 安装
    pip install -r py/requirements.txt

## 配置
1. 行情：TQsdk 需在环境变量配 TQ_USER / TQ_PASSWORD（免费注册 tqsdk 官网）；不配则回退 AkShare（主力连续）。
2. 新闻：新浪 7x24 快讯（免费）；如需金十/财联社，改 py/config.py 的 NEWS_SOURCES 与解析函数。
3. 情感：默认词典打分；如需 LLM 打标，配 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL（OpenAI 兼容）。

## 手动运行（四步流水线）
    py py/collect_quotes.py   # 行情 -> data/market/quotes.json
    py py/collect_news.py     # 新闻 -> data/news/items.json
    py py/sentiment.py        # 打标（补 sentiment/label）
    node tools/predict.mjs    # 因子+新闻 -> data/signals/latest.json

## 自动调度（30 分钟）
    py py/scheduler.py        # 日盘每 30min：新闻->打标->预测；8:45 采行情

## 数据契约（与 JS 核心一致）
    quotes.json: { version, dates:[...], dataset:{ code:{ contracts:{ contract:[bar] } } } }
    items.json:  [{ ts, source, title, content, tags:[code], sentiment, label }]
    latest.json: { ts, longs, shorts, top }