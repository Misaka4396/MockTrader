using System;
using System.Collections.Generic;
using MockTrader.Data;

namespace MockTrader.Core
{
    /// <summary>新闻条目（与 JS newsSentiment.js 消费格式一致）</summary>
    public sealed class NewsItem
    {
        public long Ts;          // epoch 毫秒
        public string[] Tags;
        public double Sentiment; // -1..1，正=看多
        public string Label;
    }

    /// <summary>新闻情绪因子（方案 A）：指数衰减加权 × 一致性折减 + 确定性演示新闻。</summary>
    public static class NewsSentiment
    {
        public static double? SentimentFactor(List<NewsItem> items, string code, long nowTs, double lookbackHours = 4, double lambda = 0.05)
        {
            long lo = nowTs - (long)(lookbackHours * 3600000);
            double num = 0, den = 0;
            int bull = 0, bear = 0, neu = 0, n = 0;
            foreach (var it in items)
            {
                if (it.Ts > nowTs || it.Ts < lo) continue;
                if (it.Tags == null || Array.IndexOf(it.Tags, code) < 0) continue;
                double w = Math.Exp(-lambda * Math.Max(0, (nowTs - it.Ts) / 3600000.0));
                double s = it.Sentiment;
                num += s * w; den += w; n++;
                if (s > 0.2) bull++; else if (s < -0.2) bear++; else neu++;
            }
            if (n == 0) return null;
            double score = den > 0 ? num / den : 0;
            double agreement = (double)Math.Max(Math.Max(bull, bear), neu) / n;
            return score * (0.5 + 0.5 * agreement);
        }

        static readonly Dictionary<string, double> Lean = new Dictionary<string, double>
        {
            ["RB"] = 0.5, ["HC"] = 0.4, ["I"] = 0.4, ["J"] = 0.3, ["CU"] = 0.4, ["AL"] = 0.3,
            ["ZN"] = 0.2, ["AU"] = -0.4, ["AG"] = -0.3, ["M"] = -0.4, ["C"] = -0.3, ["CF"] = -0.2,
            ["SR"] = -0.3, ["SC"] = 0.4, ["MA"] = 0.2, ["TA"] = -0.2, ["Y"] = -0.2, ["P"] = -0.2,
            ["FG"] = -0.2, ["SA"] = 0.1, ["PB"] = 0.1, ["NI"] = 0.2, ["SN"] = 0.1, ["SS"] = 0.2,
            ["FU"] = 0.2, ["RU"] = 0.1, ["SF"] = 0.1, ["SM"] = 0.1, ["AO"] = 0.2, ["JM"] = 0.3,
            ["CS"] = -0.1, ["AP"] = -0.2, ["JD"] = -0.1,
        };

        public static List<NewsItem> GenerateMockNews(List<string> codes, uint seed, long nowTs)
        {
            var rng = new Mulberry32(seed);
            var items = new List<NewsItem>();
            foreach (var code in codes)
            {
                for (int k = 0; k < 8; k++)
                {
                    if (rng.NextDouble() < 0.5) continue;
                    double baseLean = Lean.TryGetValue(code, out var v) ? v : 0;
                    double s = Math.Max(-1, Math.Min(1, baseLean + (rng.NextDouble() - 0.5) * 0.8));
                    items.Add(new NewsItem
                    {
                        Ts = nowTs - (7 - k) * 30L * 60000,
                        Tags = new[] { code },
                        Sentiment = s,
                        Label = s > 0.2 ? "bullish" : s < -0.2 ? "bearish" : "neutral",
                    });
                }
            }
            return items;
        }
    }
}
