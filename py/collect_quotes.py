# -*- coding: utf-8 -*-
"""采集期货日线行情 -> 落成 DataAccess 可读的 dataset 格式（TQsdk 优先，AkShare 回退）。

输出 data/market/quotes.json：
  { "version": 1, "dates": [...], "dataset": { code: { contracts: { contract: [bar] } } } }
bar = { date, open, high, low, close, settle, volume, openInterest }
"""
import json
import os
from config import VARIETIES, TQ_USER, TQ_PASSWORD, DATA

OUT = os.path.join(DATA, 'quotes.json')


def fetch_tqsdk():
    """TQsdk 全合约日线（主力/各月，持仓量成交量齐全）。"""
    from tqsdk import TqApi, TqAuth
    api = TqApi(auth=TqAuth(TQ_USER, TQ_PASSWORD))
    try:
        dataset = {}
        all_dates = set()
        for code, (exchange, product) in VARIETIES.items():
            contracts = {}
            quotes = api.query_quotes(ins_class='FUTURE', exchange_id=exchange, product_id=product)
            for symbol in quotes:
                try:
                    kline = api.get_kline_serial(symbol, 86400, data_length=800)
                except Exception:
                    continue
                bars = []
                for i in range(len(kline)):
                    d = str(kline['datetime'][i])[:10]
                    if not d:
                        continue
                    all_dates.add(d)
                    bars.append({
                        'date': d,
                        'open': float(kline['open'][i]),
                        'high': float(kline['high'][i]),
                        'low': float(kline['low'][i]),
                        'close': float(kline['close'][i]),
                        'settle': float(kline['settle'][i]) if 'settle' in kline.columns else float(kline['close'][i]),
                        'volume': int(kline['volume'][i]),
                        'openInterest': int(kline['open_interest'][i]) if 'open_interest' in kline.columns else 0,
                    })
                if bars:
                    contracts[symbol] = bars
            if contracts:
                dataset[code] = {'contracts': contracts}
        return {'version': 1, 'dates': sorted(all_dates), 'dataset': dataset}
    finally:
        api.close()


def fetch_akshare():
    """AkShare 回退：主力连续日线（单合约 MAIN，无展期，roll-yield 因子为空）。"""
    import akshare as ak
    dataset = {}
    all_dates = set()
    for code in VARIETIES:
        try:
            df = ak.futures_zh_daily_sina(symbol=code + '0')
        except Exception:
            continue
        bars = []
        for _, row in df.iterrows():
            d = str(row['date'])
            all_dates.add(d)
            bars.append({
                'date': d,
                'open': float(row['open']),
                'high': float(row['high']),
                'low': float(row['low']),
                'close': float(row['close']),
                'settle': float(row.get('settle', row['close'])),
                'volume': int(row['volume']),
                'openInterest': int(row['hold']) if 'hold' in df.columns else 0,
            })
        if bars:
            dataset[code] = {'contracts': {'MAIN': bars}}
    return {'version': 1, 'dates': sorted(all_dates), 'dataset': dataset}


def main():
    if TQ_USER and TQ_PASSWORD:
        try:
            data = fetch_tqsdk()
            print('[collect_quotes] 用 TQsdk 采集到', len(data['dataset']), '个品种')
        except Exception as e:
            print('[collect_quotes] TQsdk 失败，回退 AkShare:', e)
            data = fetch_akshare()
    else:
        print('[collect_quotes] 未配置 TQsdk 凭证，用 AkShare')
        data = fetch_akshare()

    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    n = sum(len(v['contracts']) for v in data['dataset'].values())
    print('[collect_quotes] 已写', OUT, '| 品种', len(data['dataset']), '| 合约', n, '| 交易日', len(data['dates']))


if __name__ == '__main__':
    main()
