# -*- coding: utf-8 -*-
"""30 分钟调度：盘中每 30min 跑 采集新闻 -> 打标 -> 趋势预测；日盘前采行情。

用法：python py/scheduler.py
"""
import subprocess
import sys
from datetime import datetime
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from config import TRADING_SESSIONS, INTERVAL_MINUTES, BASE

PY = sys.executable
NODE = 'node'


def run(cmd, cwd=BASE):
    try:
        subprocess.run(cmd, cwd=cwd, check=True, shell=True)
    except subprocess.CalledProcessError as e:
        print('[scheduler] 任务失败:', cmd, e)


def job_quotes():
    print('[scheduler]', datetime.now(), '采集行情')
    run(f'"{PY}" py/collect_quotes.py')


def job_news_predict():
    print('[scheduler]', datetime.now(), '采集新闻 + 打标 + 预测')
    run(f'"{PY}" py/collect_news.py')
    run(f'"{PY}" py/sentiment.py')
    run(f'{NODE} tools/predict.mjs')


def build_cron(session):
    start_h, start_m = [int(x) for x in session[0].split(':')]
    end_h, end_m = [int(x) for x in session[1].split(':')]
    # 每 INTERVAL_MINUTES 分钟，在 [start, end] 区间内
    triggers = []
    h, m = start_h, start_m
    while (h, m) <= (end_h, end_m):
        triggers.append(CronTrigger(day_of_week='mon-fri', hour=h, minute=m))
        m += INTERVAL_MINUTES
        h += m // 60
        m %= 60
    return triggers


def main():
    sched = BlockingScheduler()
    # 每个交易日开盘前采一次行情
    sched.add_job(job_quotes, CronTrigger(day_of_week='mon-fri', hour=8, minute=45))
    # 盘中每 30min 新闻+预测
    for session in TRADING_SESSIONS:
        for tr in build_cron(session):
            sched.add_job(job_news_predict, tr)
    print('[scheduler] 已启动：日盘 30min 新闻预测 + 8:45 行情采集')
    sched.start()


if __name__ == '__main__':
    main()
