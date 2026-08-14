# -*- coding: utf-8 -*-
"""多源交叉校验：TQsdk vs AkShare 同一合约（主力连续）日线收盘价对比。

用法：python py/verify_sources.py
输出：每个品种两源的对齐样本数、最大/平均相对差异率；差异过大说明某源有问题
（错价 / 缺交易日 / 复权口径不一致 / 主力切换规则不同）。
"""
import os
import pandas as pd
from config import VARIETIES, TQ_USER, TQ_PASSWORD


def fetch_tqsdk(code, exchange, product):
    from tqsdk import TqApi, TqAuth
    api = TqApi(auth=TqAuth(TQ_USER, TQ_PASSWORD))
    try:
        # 主力连续合约代码：KQ.m@交易所.品种（如 KQ.m@SHFE.rb）
        symbol = 'KQ.m@' + exchange + '.' + product
        k = api.get_kline_serial(symbol, 86400, data_length=600)
        df = k[['datetime', 'close']].copy()
        df['date'] = df['datetime'].astype(str).str[:10]
        return df.set_index('date')['close']
    finally:
        api.close()


def fetch_akshare(code):
    import akshare as ak
    df = ak.futures_zh_daily_sina(symbol=code + '0')
    df['date'] = df['date'].astype(str)
    return df.set_index('date')['close']


def compare(a, b, label):
    both = a.to_frame('a').join(b.to_frame('b'), how='inner').dropna()
    if len(both) == 0:
        print('%-6s 无重叠样本' % label)
        return None
    diff = (both['a'] - both['b']).abs() / both['b']
    return len(both), float(diff.mean()), float(diff.max())


def main():
    print('%-6s %8s %12s %12s' % ('品种', '对齐样本', '平均差异', '最大差异'))
    print('-' * 44)
    for code, (exchange, product) in VARIETIES.items():
        try:
            a = fetch_tqsdk(code, exchange, product)
        except Exception as e:
            print('%-6s TQsdk 失败: %s' % (code, e))
            continue
        try:
            b = fetch_akshare(code)
        except Exception as e:
            print('%-6s AkShare 失败: %s' % (code, e))
            continue
        r = compare(a, b, code)
        if r:
            n, md, xd = r
            flag = '  <-- 差异异常，需排查' if xd > 0.02 else ''
            print('%-6s %8d %11.4f%% %11.4f%%%s' % (code, n, md * 100, xd * 100, flag))
    print()
    print('判读：平均差异通常 <0.5%（不同源收盘价口径/时点略不同）；某源最大差异 >2% 说明有错价或缺日。')


if __name__ == '__main__':
    main()
