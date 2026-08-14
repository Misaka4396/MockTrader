using System;
using System.Collections.Generic;
using System.Linq;

namespace MockTrader.Core
{
    public sealed class PerformanceConfig
    {
        public double RiskFreeRate { get; set; } = 0;
        public double BenchmarkAnnual { get; set; } = 0.15;
        public string BenchmarkName { get; set; } = "纳指100 长线年化";
        public string BenchmarkNote { get; set; } = "基准为可配置常数（默认 15%，约 10 年口径）；非逐日曲线，仅代表长线收益率参照。";
        public double VerdictThreshold { get; set; } = 0.02;
        public int TradingDaysPerYear { get; set; } = 252;
    }

    public sealed class PerformanceResult
    {
        public List<string> Dates { get; set; }
        public double[] Nav { get; set; }
        public double[] BenchmarkNav { get; set; }
        public Metrics M { get; set; }
        public Comparison Cmp { get; set; }
    }
    public sealed class Metrics
    {
        public double TotalReturn { get; set; }
        public double AnnualizedReturn { get; set; }
        public double Volatility { get; set; }
        public double Sharpe { get; set; }
        public double MaxDrawdown { get; set; }
        public double Calmar { get; set; }
        public double WinRate { get; set; }
        public int NDays { get; set; }
    }
    public sealed class Comparison
    {
        public double Excess { get; set; }
        public double Threshold { get; set; }
        public double StrategyAnnual { get; set; }
        public double BenchmarkAnnual { get; set; }
        public string Verdict { get; set; }
    }

    public sealed class PerformanceEngine
    {
        public PerformanceResult Compute(double[] equity, List<string> dates, PerformanceConfig cfg = null)
        {
            cfg = cfg ?? new PerformanceConfig();
            double initialCapital = equity[0] != 0 ? equity[0] : 1;
            var nav = equity.Select(e => e / initialCapital).ToArray();
            var rets = new List<double>();
            for (int i = 1; i < nav.Length; i++)
                if (nav[i] > 0 && nav[i - 1] > 0) rets.Add(nav[i] / nav[i - 1] - 1.0);

            int n = rets.Count;
            double first = nav.FirstOrDefault(x => x != 0);
            double last = nav[nav.Length - 1];
            double totalReturn = first > 0 ? last / first - 1.0 : 0;
            double annualized = n > 0 && first > 0 ? Math.Pow(last / first, (double)cfg.TradingDaysPerYear / n) - 1.0 : 0;
            double vol = n > 0 ? Stats.Std(rets) * Math.Sqrt(cfg.TradingDaysPerYear) : 0;
            double sharpe = vol > 0 ? (annualized - cfg.RiskFreeRate) / vol : 0;

            double peak = double.NegativeInfinity, maxDD = 0;
            foreach (var v in nav)
            {
                if (v > peak) peak = v;
                double dd = peak > 0 ? (peak - v) / peak : 0;
                if (dd > maxDD) maxDD = dd;
            }
            double calmar = maxDD > 0 ? annualized / maxDD : 0;
            double winRate = n > 0 ? (double)rets.Count(r => r > 0) / n : 0;

            double annual = cfg.BenchmarkAnnual;
            var benchmarkNav = nav.Select((_, i) => Math.Pow(1.0 + annual, (double)i / cfg.TradingDaysPerYear)).ToArray();
            double excess = annualized - annual;
            string verdict = excess > cfg.VerdictThreshold ? "跑赢" : excess < -cfg.VerdictThreshold ? "跑输" : "接近";

            return new PerformanceResult
            {
                Dates = dates, Nav = nav, BenchmarkNav = benchmarkNav,
                M = new Metrics { TotalReturn = totalReturn, AnnualizedReturn = annualized, Volatility = vol, Sharpe = sharpe, MaxDrawdown = maxDD, Calmar = calmar, WinRate = winRate, NDays = n },
                Cmp = new Comparison { Excess = excess, Threshold = cfg.VerdictThreshold, StrategyAnnual = annualized, BenchmarkAnnual = annual, Verdict = verdict }
            };
        }
    }
}
