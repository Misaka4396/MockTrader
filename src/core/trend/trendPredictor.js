/**
 * trendPredictor.js — 趋势预测（方案 A 新增）：日线因子（慢信号）+ 新闻情绪因子（快信号）融合。
 * 输出每个品种的趋势得分 / 方向 / 强度，用于 30 分钟级趋势预测。
 */

export class TrendPredictor {
  /**
   * @param {Object<string, number>} dailyScoreByCode 日线合成得分（已截面标准化，如 composite z）
   * @param {Object<string, number>} newsZByCode 新闻情绪因子 z 值（当前时刻，截面标准化后）
   * @param {Object} config { wDaily=1, wNews=0.5, threshold=0.25 }
   * @returns {Array<{code, score, direction, strength, daily, news}>} 按 score 降序
   */
  predict(dailyScoreByCode, newsZByCode, config = {}) {
    const wDaily = config.wDaily != null ? config.wDaily : 1.0;
    const wNews = config.wNews != null ? config.wNews : 0.5;
    const threshold = config.threshold != null ? config.threshold : 0.25;
    const out = [];
    for (const code of Object.keys(dailyScoreByCode)) {
      const d = dailyScoreByCode[code] != null ? dailyScoreByCode[code] : 0;
      const n = newsZByCode[code] != null ? newsZByCode[code] : 0;
      const score = wDaily * d + wNews * n;
      const direction = score > threshold ? 1 : score < -threshold ? -1 : 0;
      out.push({ code, score, direction, strength: Math.abs(score), daily: d, news: n });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }
}
