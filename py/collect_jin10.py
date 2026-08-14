# -*- coding: utf-8 -*-
"""金十数据 7x24 快讯采集 -> 按品种关键词打标签 -> 追加到 items.json。

金十 flash API（网页同款接口）：POST https://flash-api.jin10.com/get_flash_list
  headers 需 x-app-id / x-version；官方付费 API 用 JIN10_SECRET 签名。
  注：app-id 与签名随官方调整，需按当前版本更新；凭证放环境变量。
"""
import json
import os
import time
from datetime import datetime, timezone, timedelta
import requests
from config import NEWS, VARIETY_KEYWORDS, JIN10_APP_ID, JIN10_SECRET

OUT = os.path.join(NEWS, 'items.json')
URL = 'https://flash-api.jin10.com/get_flash_list'
CST = timezone(timedelta(hours=8))
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'x-app-id': JIN10_APP_ID or 'bVBF4FyRTn5NJF5n',
    'x-version': '1.0.0',
    'Content-Type': 'application/x-www-form-urlencoded',
}


def match_tags(text):
    tags = []
    t = text.lower()
    for code, words in VARIETY_KEYWORDS.items():
        for w in words:
            if w.lower() in t:
                tags.append(code)
                break
    return tags


def fetch():
    items = []
    try:
        r = requests.post(URL, data='channel=-8200&vip=1', headers=HEADERS, timeout=10)
        data = r.json().get('data', [])
        for d in data:
            content = d.get('content') or d.get('data') or ''
            if not content:
                continue
            tags = match_tags(content)
            if not tags:
                continue
            ts = datetime.fromtimestamp(float(d.get('time') or time.time()), CST).isoformat(timespec='seconds')
            items.append({'ts': ts, 'source': 'jin10', 'title': content[:80], 'content': content, 'tags': tags})
    except Exception as e:
        print('[collect_jin10] 抓取失败:', e)
    return items


def main():
    existing = []
    if os.path.exists(OUT):
        with open(OUT, 'r', encoding='utf-8') as f:
            existing = json.load(f)
    fresh = fetch()
    seen = {(it['source'], it['title']) for it in existing}
    added = [it for it in fresh if (it['source'], it['title']) not in seen]
    merged = existing + added
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False)
    print('[collect_jin10] 新增', len(added), '条，累计', len(merged), '条 ->', OUT)


if __name__ == '__main__':
    main()
