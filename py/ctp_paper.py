# -*- coding: utf-8 -*-
"""CTP 模拟盘骨架（Phase 3）。需 vnpy/ctpbee + 真实 CTP 账号与前置地址。

流程：订阅主力行情 -> 读 data/signals/latest.json 信号 -> 模拟下单 -> 回报对账。
本文件为接口骨架，实际接入需填账号与前置，并实现 on_tick/on_trade 回调。
"""
import json
import os
from config import SIGNAL


def load_signals():
    p = os.path.join(SIGNAL, 'latest.json')
    if not os.path.exists(p):
        return None
    with open(p, 'r', encoding='utf-8') as f:
        return json.load(f)


def main():
    sig = load_signals()
    print('[ctp_paper] CTP 模拟盘骨架')
    if not sig:
        print('  无信号：先跑 predict.mjs 生成 data/signals/latest.json')
        return
    print('  做多:', [s['code'] for s in sig.get('longs', [])])
    print('  做空:', [s['code'] for s in sig.get('shorts', [])])
    print('  TODO: 接入 vnpy CtpGateway 下单，成交回报写入 data/signals/execution.json 对账')


if __name__ == '__main__':
    main()