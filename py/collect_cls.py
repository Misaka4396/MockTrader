# -*- coding: utf-8 -*-
"""财联社电报采集 -> 按品种关键词打标签 -> 追加到 items.json。

财联社 nodeapi 电报接口需「sign」签名（md5(排序参数+盐)），盐值随官方前端 JS 变化；
官方付费 API 请用 CLS_TOKEN，走 https://www.cls.cn 的授权接口。此处给出 HTTP 骨架，
签名函数需按当前官方接口更新。
"""
import json
import os
import time
import hashlib
from datetime import datetime, timezone, timedelta
import requests
from config import NEWS, VARIETY_KEYWORDS, CLS_TOKEN, CLS_API_BASE

OUT = os.path.join(NEWS, 'items.json')
CST = timezone(timedelta(hours=8))
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Referer': CLS_API_BASE + '/'}


def sign(params, secret):
    """财联社签名（占位）：md5(按 key 排序的参数串 + 盐)。需按当前官方算法更新。"""
    s = '&'.join(f'{k}={params[k]}' for k in sorted(params)) + secret
    return hashlib.md5(s.encode('utf-8')).hexdigest()


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
        params = {'app': 'CailianpressWeb', 'os': 'web', 'sv': '8.4.6'}
        if CLS_TOKEN:
            params['token'] = CLS_TOKEN
        params['sign'] = sign(params, os.environ.get('CLS_SECRET', ''))
        r = requests.get(CLS_API_BASE + '/nodeapi/telegraphList', params=params, headers=HEADERS, timeout=10)
        data = r.json().get('data', {}).get('roll_data', [])
        for d in data:
            content = (d.get('content') or d.get('title') or '')
            if not content:
                continue
            tags = match_tags(content)
            if not tags:
                continue
            ts = datetime.fromtimestamp(float(d.get('ctime') or time.time()), CST).isoformat(timespec='seconds')
            items.append({'ts': ts, 'source': 'cls', 'title': content[:80], 'content': content, 'tags': tags})
    except Exception as e:
        print('[collect_cls] 抓取失败:', e)
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
    print('[collect_cls] 新增', len(added), '条，累计', len(merged), '条 ->', OUT)


if __name__ == '__main__':
    main()
