using System;
using System.Collections.Generic;
using System.Linq;
using MockTrader.Data;

namespace MockTrader.Core
{
    public sealed class StrategyConfig
    {
        public List<string> Factors { get; set; } = new List<string>(FactorKeys.All);
        public Dictionary<string, int> FactorSigns { get; set; } = new Dictionary<string, int> { ["momentum"] = 1, ["liquidity"] = 1, ["volume"] = 1, ["skewness"] = 1, ["rollYield"] = 1 };
        public string Combine { get; set; } = "equal";           // equal | ic | custom
        public Dictionary<string, double> FactorWeights { get; set; } // custom
        public int IcWindow { get; set; } = 60;
        public int IcHorizon { get; set; } = 5;
        public int LongCount { get; set; } = 5;
        public int ShortCount { get; set; } = 5;
        public string Mode { get; set; } = "longShort";
        public string Weighting { get; set; } = "equal";          // equal | score
        public bool Neutral { get; set; } = true;
        public string Rebalance { get; set; } = "monthly";
        public int RebalanceDays { get; set; } = 21;
        public int Buffer { get; set; } = 2;
        public double GrossExposure { get; set; } = 1.0;
        public int Warmup { get; set; } = 120;
    }

    public sealed class StrategyResult
    {
        public List<string> RebalanceDates { get; set; }
        public Dictionary<string, Dictionary<string, double>> Targets { get; set; } // date -> code -> weight
        public Dictionary<string, double?[]> Composite { get; set; }                // code -> array
        public StrategyConfig Config { get; set; }
    }

    public sealed class StrategyEngine
    {
        public StrategyResult Generate(FactorPanel panel, DataAccess ds, StrategyConfig cfg = null)
        {
            cfg = cfg ?? new StrategyConfig();
            var dates = panel.Dates;
            var varieties = panel.Varieties;
            var weights = FactorWeights(panel, ds, cfg);

            var composite = new Dictionary<string, double?[]>();
            foreach (var code in varieties) composite[code] = new double?[dates.Count];
            for (int t = 0; t < dates.Count; t++)
            {
                foreach (var code in varieties)
                {
                    double s = 0; int cnt = 0;
                    foreach (var f in cfg.Factors)
                    {
                        var zv = panel.Z[f][code][t];
                        if (zv == null) continue;
                        int sign = cfg.FactorSigns.TryGetValue(f, out var sg) ? sg : 1;
                        double w = weights.TryGetValue(f, out var wv) ? wv : 0;
                        s += sign * w * zv.Value; cnt++;
                    }
                    if (cnt > 0) composite[code][t] = s;
                }
            }

            int rebDays = cfg.Rebalance == "weekly" ? (cfg.RebalanceDays > 0 ? cfg.RebalanceDays : 5) : (cfg.RebalanceDays > 0 ? cfg.RebalanceDays : 21);
            var rebalanceDates = new List<string>();
            for (int t = cfg.Warmup; t < dates.Count; t += rebDays) rebalanceDates.Add(dates[t]);

            var targets = new Dictionary<string, Dictionary<string, double>>();
            var prevLong = new HashSet<string>();
            var prevShort = new HashSet<string>();

            foreach (var date in rebalanceDates)
            {
                int t = dates.IndexOf(date);
                var ranked = new List<(string code, double s)>();
                foreach (var code in varieties)
                {
                    var s = composite[code][t];
                    if (s != null && !double.IsNaN(s.Value) && !double.IsInfinity(s.Value)) ranked.Add((code, s.Value));
                }
                if (ranked.Count < Math.Max(cfg.LongCount, cfg.ShortCount) + 1) { targets[date] = new Dictionary<string, double>(); continue; }
                ranked.Sort((a, b) => b.s.CompareTo(a.s));

                var longNames = SelectSide(ranked, true, cfg, prevLong);
                var shortNames = SelectSide(ranked, false, cfg, prevShort);

                var wMap = new Dictionary<string, double>();
                double gross = cfg.GrossExposure;
                double sideGross = cfg.Neutral && cfg.Mode == "longShort" ? gross / 2.0 : gross;
                AssignWeights(wMap, longNames, +sideGross, cfg, composite, t);
                AssignWeights(wMap, shortNames, -sideGross, cfg, composite, t);
                targets[date] = wMap;
                prevLong = new HashSet<string>(longNames);
                prevShort = new HashSet<string>(shortNames);
            }
            return new StrategyResult { RebalanceDates = rebalanceDates, Targets = targets, Composite = composite, Config = cfg };
        }

        static List<string> SelectSide(List<(string code, double s)> ranked, bool isLong, StrategyConfig cfg, HashSet<string> prev)
        {
            int n = isLong ? cfg.LongCount : cfg.ShortCount;
            int buffer = cfg.Buffer;
            var pool = isLong
                ? ranked.Take(n + buffer).ToList()
                : ranked.Skip(Math.Max(0, ranked.Count - (n + buffer))).Reverse().ToList();
            var kept = pool.Where(x => prev.Contains(x.code)).Take(n).ToList();
            var keptSet = new HashSet<string>(kept.Select(x => x.code));
            var chosen = kept.Select(x => x.code).ToList();
            foreach (var x in pool)
            {
                if (chosen.Count >= n) break;
                if (!keptSet.Contains(x.code)) chosen.Add(x.code);
            }
            if (chosen.Count < n)
                foreach (var x in ranked) { if (chosen.Count >= n) break; if (!chosen.Contains(x.code)) chosen.Add(x.code); }
            return chosen.Take(n).ToList();
        }

        static void AssignWeights(Dictionary<string, double> weights, List<string> names, double sideGross, StrategyConfig cfg, Dictionary<string, double?[]> composite, int t)
        {
            if (names.Count == 0) return;
            if (cfg.Weighting == "score")
            {
                double s = 0;
                foreach (var code in names) s += Math.Abs(composite[code][t] ?? 0);
                if (s > 0)
                {
                    foreach (var code in names) weights[code] = sideGross * Math.Abs(composite[code][t] ?? 0) / s;
                    return;
                }
            }
            foreach (var code in names) weights[code] = sideGross / names.Count;
        }

        Dictionary<string, double> FactorWeights(FactorPanel panel, DataAccess ds, StrategyConfig cfg)
        {
            int n = cfg.Factors.Count;
            var outW = new Dictionary<string, double>();
            if (cfg.Combine == "custom" && cfg.FactorWeights != null)
            {
                double s = 0;
                foreach (var f in cfg.Factors) s += Math.Abs(cfg.FactorWeights.TryGetValue(f, out var v) ? v : 0);
                foreach (var f in cfg.Factors) outW[f] = s > 0 ? (cfg.FactorWeights.TryGetValue(f, out var v2) ? v2 : 0) / s : 1.0 / n;
                return outW;
            }
            if (cfg.Combine == "ic")
            {
                var ic = ComputeRollingIC(panel, ds, cfg);
                double s = 0;
                foreach (var f in cfg.Factors) s += Math.Abs(ic.TryGetValue(f, out var v) ? v : 0);
                if (s > 0) { foreach (var f in cfg.Factors) outW[f] = Math.Abs(ic.TryGetValue(f, out var v2) ? v2 : 0) / s; return outW; }
            }
            foreach (var f in cfg.Factors) outW[f] = 1.0 / n;
            return outW;
        }

        static Dictionary<string, double> ComputeRollingIC(FactorPanel panel, DataAccess ds, StrategyConfig cfg)
        {
            int horizon = cfg.IcHorizon, window = cfg.IcWindow;
            int T = panel.Dates.Count;
            var fwd = new Dictionary<string, double?[]>();
            foreach (var code in panel.Varieties)
            {
                var s = ds.GetSeries(code);
                fwd[code] = new double?[T];
                for (int t = 0; t + horizon < T; t++)
                    if (s.MainAdj[t] != null && s.MainAdj[t + horizon] != null && s.MainAdj[t] > 0)
                        fwd[code][t] = s.MainAdj[t + horizon].Value / s.MainAdj[t].Value - 1.0;
            }
            var ic = new Dictionary<string, double>();
            foreach (var f in cfg.Factors)
            {
                double best = 0;
                for (int t = T - 1; t >= window; t--)
                {
                    var xs = new List<double>(); var ys = new List<double>();
                    for (int tau = t - window + 1; tau <= t - horizon; tau++)
                        foreach (var code in panel.Varieties)
                        {
                            var zz = panel.Z[f][code][tau]; var rr = fwd[code][tau];
                            if (zz != null && rr != null && !double.IsNaN(zz.Value) && !double.IsNaN(rr.Value)) { xs.Add(zz.Value); ys.Add(rr.Value); }
                        }
                    if (xs.Count >= 10) { var rho = Stats.Spearman(xs, ys); if (!double.IsNaN(rho)) { best = Math.Abs(rho); break; } }
                }
                ic[f] = best > 0 ? best : 1.0 / cfg.Factors.Count;
            }
            return ic;
        }
    }
}
