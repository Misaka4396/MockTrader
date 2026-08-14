using System;
using System.Collections.Generic;
using MockTrader.Data;

namespace MockTrader.Core
{
    public sealed class PipelineOptions
    {
        public string Start = "2022-01-03", End = "2024-12-31", MasterSeed = "mocktrader-default-seed";
        public string CsvPath;
        public List<string> Varieties;
        public Action<string, double> OnProgress;
        public FactorParams FactorParams = new FactorParams();
        public StrategyConfig StrategyConfig = new StrategyConfig();
        public BacktestConfig BacktestConfig = new BacktestConfig();
        public PerformanceConfig PerformanceConfig = new PerformanceConfig();
    }

    public sealed class PipelineResult
    {
        public DataAccess Ds;
        public FactorPanel Panel;
        public StrategyResult Strategy;
        public BacktestResult Backtest;
        public PerformanceResult Performance;
    }

    public static class Pipeline
    {
        public static PipelineResult Run(PipelineOptions o = null)
        {
            o = o ?? new PipelineOptions();
            void P(string step, double frac) => o.OnProgress?.Invoke(step, frac);
            P("生成数据", 0.05);
            var ds = new DataAccess();
            ds.Generate(o.Start, o.End, o.MasterSeed, o.Varieties);
            P("计算因子", 0.35);
            var panel = new FactorEngine().Compute(ds, o.FactorParams);
            P("生成信号", 0.55);
            var strat = new StrategyEngine().Generate(panel, ds, o.StrategyConfig);
            P("回测", 0.75);
            var bt = new BacktestEngine().Run(ds, strat, o.BacktestConfig);
            P("绩效", 0.90);
            var perf = new PerformanceEngine().Compute(bt.Equity, bt.Dates, o.PerformanceConfig);
            P("完成", 1.0);
            return new PipelineResult { Ds = ds, Panel = panel, Strategy = strat, Backtest = bt, Performance = perf };
        }
    }
}
