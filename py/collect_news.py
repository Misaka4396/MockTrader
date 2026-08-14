# -*- coding: utf-8 -*-
"""采集财经快讯 -> 按品种关键词打标签 -> 去重后追加到 data/news/items.json。

新闻 item：{ ts, source, title, content, tags:[code...], raw:true }
情感打分由 sentiment.py 补齐（sentiment / label 字段）。
"""
import json
import os
import re
import time
from datetime import datetime, timezone, timedelta
import requests
from bs4 import BeautifulSoup
from config import VARIETY_KEYWORDS, NEWS_SOURCES, NEWS

OUT = os.path.join(NEWS, 'items.json')
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
CST = timezone(timedelta(hours=8))


def now_iso():
    return datetime.now(CST).isoformat(timespec='seconds')


def match_tags(text):
    """按关键词给文本打品种标签。"""
    tags = []
    t = text.lower()
    for code, words in VARIETY_KEYWORDS.items():
        for w in words:
            if w.lower() in t:
                tags.append(code)
                break
    return tags


def fetch_sina():
    """新浪 7x24 快讯（返回 list[dict]）。"""
    items = []
    try:
        r = requests.get(NEWS_SOURCES[0], headers=HEADERS, timeout=10)
        r.encoding = 'utf-8'
        soup = BeautifulSoup(r.text, 'html.parser')
        for li in soup.select('.bd_i_list li, ul.list li'):
            a = li.find('a')
            if not a:
                continue
            title = a.get_text(strip=True)
            tags = match_tags(title)
            if not tags:
                continue
            items.append({'ts': now_iso(), 'source': 'sina', 'title': title, 'content': title, 'tags': tags})
    except Exception as e:
        print('[collect_news] sina 抓取失败:', e)
    return items


def load_existing():
    if os.path.exists(OUT):
        with open(OUT, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []


def dedupe(items):
    """按 (source, title) 去重，保留最新。"""
    seen = set()
    out = []
    for it in items:
        key = (it['source'], it['title'])
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    return out


def main():
    existing = load_existing()
    fresh = fetch_sina()
    merged = dedupe(fresh + existing)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False)
    print('[collect_news] 新增', len(fresh), '条，累计', len(merged), '条 ->', OUT)


if __name__ == '__main__':
    main()
