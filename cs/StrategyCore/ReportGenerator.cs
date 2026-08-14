using System;
using System.Text;

namespace MockTrader.Core
{
    /// <summary>模拟盘报告生成器（C# 版，与 JS reportGenerator.js 对齐的核心章节）。</summary>
    public static class ReportGenerator
    {
        static string Pct(double x) => (x * 100).ToString("F2") + "%";

        public static string BuildMarkdown(PipelineResult r)
        {
            var m = r.Performance.M;
            var c = r.Performance.Cmp;
            var s = r.Backtest.Summary;
            var sb = new StringBuilder();
            sb.AppendLine("# MockTrader 模拟盘报告");
            sb.AppendLine();
            sb.AppendLine("- 生成时间: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
            sb.AppendLine("- 品种 " + r.Ds.Codes.Count + " / 交易日 " + r.Ds.Dates.Count);
            sb.AppendLine("- 策略: 5 因子合成 · 多" + r.Strategy.Config.LongCount + "空" + r.Strategy.Config.ShortCount + " · " + (r.Strategy.Config.Weighting == "score" ? "得分加权" : "等权") + " · " + (r.Strategy.Config.Rebalance == "weekly" ? "周度" : "月度"));
            sb.AppendLine();
            sb.AppendLine("## 一、绩效");
            sb.AppendLine();
            sb.AppendLine("| 指标 | 值 |");
            sb.AppendLine("|---|---|");
            sb.AppendLine("| 年化收益率 | " + Pct(m.AnnualizedReturn) + " |");
            sb.AppendLine("| Sharpe | " + m.Sharpe.ToString("F3") + " |");
            sb.AppendLine("| 波动率 | " + Pct(m.Volatility) + " |");
            sb.AppendLine("| 最大回撤 | " + Pct(m.MaxDrawdown) + " |");
            sb.AppendLine("| 卡玛比率 | " + m.Calmar.ToString("F3") + " |");
            sb.AppendLine("| 胜率 | " + Pct(m.WinRate) + " |");
            sb.AppendLine();
            sb.AppendLine("## 二、基准对比（纳指长线年化）");
            sb.AppendLine();
            sb.AppendLine("- 策略年化 " + Pct(c.StrategyAnnual) + " vs 基准 " + Pct(c.BenchmarkAnnual));
            sb.AppendLine("- 超额收益 " + (c.Excess >= 0 ? "+" : "") + Pct(c.Excess));
            sb.AppendLine("- 结论: **" + c.Verdict + "**");
            sb.AppendLine();
            sb.AppendLine("## 三、交易与成本");
            sb.AppendLine();
            sb.AppendLine("- 交易 " + s.NTrades + " 笔 / 展期 " + s.NRolls + " 次" + (s.CircuitBroken ? " / 已触发回撤熔断" : ""));
            sb.AppendLine("- 手续费+滑点 " + s.TotalCost.ToString("F0") + " / 展期成本 " + s.TotalRollCost.ToString("F0"));
            sb.AppendLine("- 期末权益 " + s.FinalEquity.ToString("F0") + "（初始 " + s.InitialCapital.ToString("F0") + "）");
            sb.AppendLine();
            sb.AppendLine("## 四、结论与免责");
            sb.AppendLine();
            sb.AppendLine("- 判定: " + c.Verdict + "（对 " + Pct(c.BenchmarkAnnual) + " 基准）");
            sb.AppendLine("- 免责: 数据为确定性合成行情，仅用于验证算法正确性，不代表真实收益。");
            return sb.ToString();
        }
    }
}