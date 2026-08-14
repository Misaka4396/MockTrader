# Phase 3 落地：实盘准备（docs/13）

实盘准备的核心是「前向纸面验证」：不回溯历史（新闻无法回测），而是前向记录每个预测、事后统计命中率/收益。
告警/监控/CTP 为真实机接入骨架。

## 新增模块与脚本

    src/core/research/paperLedger.js  前向纸面验证账本（记录/结算/统计/按品种聚合）
    tools/paper_trading.mjs           前向模拟：日线因子+新闻情绪 -> 每日多空信号 -> horizon 日后结算 -> 命中率看板
    py/alert.py                       钉钉/企业微信 webhook 告警
    py/monitor.py                     调度心跳 + 行情/新闻数据新鲜度监控（超 30 分钟未更新则告警）
    py/ctp_paper.py                   CTP 模拟盘骨架（vnpy/ctpbee 接入点）

## 关键结果（合成数据）

    - 前向纸面验证：3942 笔预测，命中率 48.8%（多 48.4% / 空 49.3%），平均单笔 -0.003%
    - 结论：合成随机游走数据无方向优势（命中率≈抛硬币），符合预期；框架有效，接真实信号即前向累计
    - 按品种命中率：MA 55% / HC 54% / CF 53% ... AL 41%（可作为品种级信号质量参考）

## 验证

    - 37/37 单元测试（新增 PaperLedger 记录/结算/统计）
    - Python 全部通过 py_compile

## 真实机接入清单（Phase 3 剩余）

    1) 配 ALERT_DINGTALK_URL / ALERT_WECOM_URL -> py/alert.py 告警
    2) scheduler.py 每轮末尾调 py/monitor.py check()（心跳+新鲜度）
    3) CTP 模拟盘：填 vnpy CtpGateway 账号/前置，实现 on_tick/on_trade，写 execution.json 对账
    4) 前向账本生产化：predict.mjs 每日信号 -> PaperLedger 归档 -> 每 horizon 日结算统计