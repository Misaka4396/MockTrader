# -*- coding: utf-8 -*-
"""钉钉 / 企业微信 告警（webhook 机器人）。"""
import requests
from config import ALERT_DINGTALK_URL, ALERT_WECOM_URL


def send_dingtalk(title, text):
    if not ALERT_DINGTALK_URL:
        return
    try:
        requests.post(ALERT_DINGTALK_URL, json={'msgtype': 'markdown', 'markdown': {'title': title, 'text': text}}, timeout=10)
    except Exception as e:
        print('[alert] 钉钉发送失败:', e)


def send_wecom(text):
    if not ALERT_WECOM_URL:
        return
    try:
        requests.post(ALERT_WECOM_URL, json={'msgtype': 'text', 'text': {'content': text}}, timeout=10)
    except Exception as e:
        print('[alert] 企微发送失败:', e)


def alert(title, text):
    send_dingtalk(title, text)
    send_wecom(title + '\n' + text)