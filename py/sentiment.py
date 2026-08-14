# -*- coding: utf-8 -*-
"""新闻情感打标：词典打分 + 可选 LLM 批量打标（JSON 输出），补齐 sentiment/label 字段。

sentiment ∈ [-1, 1]（正=看多）；label ∈ bullish | bearish | neutral。
与 JS newsSentiment.js 的消费格式一致。
"""
import json
import os
import requests
from config import BULL_WORDS, BEAR_WORDS, NEWS, LLM_BASE_URL, LLM_API_KEY, LLM_MODEL

OUT = os.path.join(NEWS, 'items.json')
LLM_BATCH = int(os.environ.get('LLM_BATCH', '10'))


def dict_score(text):
    b = sum(1 for w in BULL_WORDS if w in text)
    e = sum(1 for w in BEAR_WORDS if w in text)
    if b + e == 0:
        return 0.0, 'neutral'
    s = (b - e) / (b + e)
    return s, ('bullish' if s > 0 else 'bearish')


def llm_batch_score(texts):
    """OpenAI 兼容接口批量打标，返回 [(score, label), ...]，失败返回 None。"""
    prompt = (
        '下面是若干条财经新闻标题。对每条判断其对商品期货是利多、利空还是中性，'
        '输出 JSON 数组，每项格式 {"i": 序号, "label": "bullish|bearish|neutral", "score": -1到1}。标题：\n'
        + '\n'.join('%d. %s' % (i, t) for i, t in enumerate(texts))
    )
    try:
        r = requests.post(
            LLM_BASE_URL.rstrip('/') + '/chat/completions',
            headers={'Authorization': 'Bearer ' + LLM_API_KEY, 'Content-Type': 'application/json'},
            json={'model': LLM_MODEL, 'temperature': 0, 'response_format': {'type': 'json_object'},
                  'messages': [{'role': 'user', 'content': prompt}]},
            timeout=30,
        )
        content = r.json()['choices'][0]['message']['content']
        arr = json.loads(content)
        if isinstance(arr, dict):
            arr = arr.get('items', arr.get('results', []))
        res = [None] * len(texts)
        for it in arr:
            i = int(it.get('i', it.get('index', 0)))
            if 0 <= i < len(texts):
                label = it.get('label', 'neutral')
                try:
                    score = float(it.get('score', 0))
                except (TypeError, ValueError):
                    score = 0.0
                res[i] = (max(-1.0, min(1.0, score)), label)
        return res
    except Exception as e:
        print('[sentiment] LLM 批量失败，回退词典:', e)
        return None


def main():
    with open(OUT, 'r', encoding='utf-8') as f:
        items = json.load(f)

    if LLM_BASE_URL and LLM_API_KEY:
        todo = [(i, (it.get('title') or '') + (it.get('content') or '')) for i, it in enumerate(items)
                if 'sentiment' not in it]
        for start in range(0, len(todo), LLM_BATCH):
            chunk = todo[start:start + LLM_BATCH]
            res = llm_batch_score([t for _, t in chunk])
            for (idx, _), r in zip(chunk, res or [None] * len(chunk)):
                if r:
                    items[idx]['sentiment'], items[idx]['label'] = r

    for it in items:
        if 'sentiment' not in it:
            text = (it.get('title') or '') + (it.get('content') or '')
            s, label = dict_score(text)
            it['sentiment'] = s
            it['label'] = label

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False)
    b = sum(1 for it in items if it['label'] == 'bullish')
    e = sum(1 for it in items if it['label'] == 'bearish')
    print('[sentiment] 打标完成：', len(items), '条 | 看多', b, '| 看空', e)


if __name__ == '__main__':
    main()
