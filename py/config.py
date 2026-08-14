# -*- coding: utf-8 -*-
"""方案 A 配置：品种、新闻源、情感词典、调度时段、路径。"""
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, 'data', 'market')
NEWS = os.path.join(BASE, 'data', 'news')
SIGNAL = os.path.join(BASE, 'data', 'signals')
for p in (DATA, NEWS, SIGNAL):
    os.makedirs(p, exist_ok=True)

# 品种：代码 -> (交易所, 交易所内 product_id)；用于 TQsdk 查询，也用于新闻关键词
VARIETIES = {
    'RB': ('SHFE', 'rb'), 'HC': ('SHFE', 'hc'), 'I': ('DCE', 'i'), 'J': ('DCE', 'j'),
    'CU': ('SHFE', 'cu'), 'AL': ('SHFE', 'al'), 'ZN': ('SHFE', 'zn'), 'AU': ('SHFE', 'au'),
    'AG': ('SHFE', 'ag'), 'M': ('DCE', 'm'), 'Y': ('DCE', 'y'), 'C': ('DCE', 'c'),
    'SC': ('INE', 'sc'), 'TA': ('CZCE', 'TA'), 'MA': ('CZCE', 'MA'), 'SR': ('CZCE', 'SR'),
}

# 品种 -> 新闻关键词（代码 + 中文名 + 别名），用于新闻打标签
VARIETY_KEYWORDS = {
    'RB': ['螺纹钢', '螺纹', 'rb', '钢筋'],
    'HC': ['热卷', '热轧卷板', 'hc'],
    'I': ['铁矿石', '铁矿', '矿石'],
    'J': ['焦炭', '焦'],
    'CU': ['铜', '沪铜', '电解铜', '铜价'],
    'AL': ['铝', '沪铝', '电解铝'],
    'AU': ['黄金', '沪金', '金价'],
    'AG': ['白银', '沪银', '银价'],
    'M': ['豆粕', '豆粕'],
    'SC': ['原油', 'sc', '国际油价'],
    'TA': ['pta', '精对苯二甲酸'],
    'MA': ['甲醇', 'ma'],
    'SR': ['白糖', '糖价', 'sr'],
}

# TQsdk 凭证（留空则回退 AkShare）
TQ_USER = os.environ.get('TQ_USER', '')
TQ_PASSWORD = os.environ.get('TQ_PASSWORD', '')

# 新闻源（7x24 快讯等）
NEWS_SOURCES = [
    'https://finance.sina.com.cn/7x24/',
    'https://futures.eastmoney.com/a/czqyw.html',
]

# 情感词典（多 / 空）
BULL_WORDS = ['上涨', '大涨', '拉升', '走强', '利多', '利好', '库存下降', '减产', '需求回暖', '涨停',
              '突破', '扩仓', '增仓', '去库', '供应收紧', '上调', '看多', '创新高', '回升', '反弹']
BEAR_WORDS = ['下跌', '大跌', '跳水', '走弱', '利空', '利淡', '库存上升', '增产', '需求疲软', '跌停',
              '跌破', '减仓', '累库', '供应过剩', '下调', '看空', '创新低', '回落', '下挫', '承压']

# 情绪因子参数（与 JS newsSentiment.js 保持一致）
LOOKBACK_HOURS = 4
DECAY_LAMBDA = 0.05

# 调度：日盘 09:00-11:30、13:30-15:00（30 分钟一次）
TRADING_SESSIONS = [('09:00', '11:30'), ('13:30', '15:00')]
INTERVAL_MINUTES = 30

# 可选 LLM 打标（OpenAI 兼容接口；留空则只用词典）
LLM_BASE_URL = os.environ.get('LLM_BASE_URL', '')
LLM_API_KEY = os.environ.get('LLM_API_KEY', '')
LLM_MODEL = os.environ.get('LLM_MODEL', 'deepseek-chat')
# 金十数据 / 财联社（官方/付费 API，需凭证与签名，视官方接口调整）
JIN10_APP_ID = os.environ.get('JIN10_APP_ID', '')
JIN10_SECRET = os.environ.get('JIN10_SECRET', '')
CLS_TOKEN = os.environ.get('CLS_TOKEN', '')
CLS_API_BASE = 'https://www.cls.cn'

