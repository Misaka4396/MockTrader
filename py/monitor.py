# -*- coding: utf-8 -*-
"""调度心跳 + 数据新鲜度监控（每次调度后调用）。"""
import json
import os
import time
from datetime import datetime, timezone, timedelta
from config import DATA, NEWS, SIGNAL

CST = timezone(timedelta(hours=8))


def heartbeat():
    with open(os.path.join(SIGNAL, 'heartbeat.json'), 'w', encoding='utf-8') as f:
        json.dump({'ts': datetime.now(CST).isoformat(timespec='seconds'), 'pid': os.getpid()}, f)


def data_freshness():
    issues = []
    checks = [('行情', os.path.join(DATA, 'quotes.json')), ('新闻', os.path.join(NEWS, 'items.json'))]
    for name, path in checks:
        if not os.path.exists(path):
            issues.append(name + ' 缺失')
            continue
        age_min = (time.time() - os.path.getmtime(path)) / 60
        if age_min > 30:
            issues.append(name + ' 超过 30 分钟未更新（%.0f 分钟）' % age_min)
    return issues


def check():
    heartbeat()
    issues = data_freshness()
    if issues:
        from alert import alert
        alert('MockTrader 数据告警', '\n'.join(issues))
        print('[monitor] 告警:', issues)
    else:
        print('[monitor] 数据新鲜度正常')


if __name__ == '__main__':
    check()