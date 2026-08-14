using System;
using System.Collections.Generic;
using MockTrader.Data;

namespace MockTrader.Core
{
    public sealed class FactorParams
    {
        public int MomentumLookback { get; set; } = 120;
        public int MomentumSkip { get; set; } = 21;
        public int AmihudWindow { get; set; } = 20;
        public int VolumeRatioWindow { get; set; } = 20;
        public int SkewWindow { get; set; } = 20;
        public bool RollYieldAnnualize { get; set; } = true;
        public double WinsorizeK { get; set; } = 2.5;
    }

    public sealed class FactorPanel
    {
        public List<string> Dates { get; set; }
        public List<string> Varieties { get; set; }
        public Dictionary<string, Dictionary<string, double?[]>> Raw { get; set; } // factor -> code -> array
        public Dictionary<string, Dictionary<string, double?[]>> Z { get; set; }
    }

    public static class FactorKeys
    {
        public static readonly string[] All = { "momentum", "liquidity", "volume", "skewness", "rollYield" };
    }

    public sealed class FactorEngine
    {
        public FactorPanel Compute(DataAccess ds, FactorParams p = null)
        {
            p = p ?? new FactorParams();
            var varieties = ds.Codes;
            var dates = ds.Dates;
            var raw = new Dictionary<string, Dictionary<string, double?[]>>();
            foreach (var f in FactorKeys.All) raw[f] = new Dictionary<string, double?[]>();

            foreach (var code in varieties)
            {
                var f = ComputeVariety(ds, code, p);
                foreach (var k in FactorKeys.All) raw[k][code] = f[k];
            }

            var z = new Dictionary<string, Dictionary<string, double?[]>>();
            foreach (var k in FactorKeys.All)
                z[k] = CrossSectionalZ(dates, varieties, raw[k], p.WinsorizeK);

            return new FactorPanel { Dates = dates, Varieties = varieties, Raw = raw, Z = z };
        }

        static double?[] Empty(int n) => new double?[n];

        static Dictionary<string, double?[]> ComputeVariety(DataAccess ds, string code, FactorParams p)
        {
            var s = ds.GetSeries(code);
            var dates = ds.Dates;
            int T = dates.Count;
            var outF = new Dictionary<string, double?[]>();
            foreach (var k in FactorKeys.All) outF[k] = Empty(T);

            var ret = Empty(T);
            for (int t = 1; t < T; t++)
            {
                var a = s.MainAdj[t]; var b = s.MainAdj[t - 1];
                if (a != null && b != null && b > 0) ret[t] = a.Value / b.Value - 1.0;
            }

            for (int t = 0; t < T; t++)
            {
                // momentum
                int iEnd = t - p.MomentumSkip, iStart = t - p.MomentumLookback;
                if (iStart >= 0 && iEnd >= 0 && s.MainAdj[iEnd] != null && s.MainAdj[iStart] != null && s.MainAdj[iStart] > 0)
                    outF["momentum"][t] = s.MainAdj[iEnd].Value / s.MainAdj[iStart].Value - 1.0;

                // amihud + liquidity
                int w = p.AmihudWindow;
                if (t >= w)
                {
                    double acc = 0; int cnt = 0;
                    for (int i = t - w + 1; i <= t; i++)
                    {
                        double? dolVol = (s.MainRaw[i] != null && s.MainVol[i] != null) ? s.MainRaw[i].Value * s.MainVol[i].Value : (double?)null;
                        if (ret[i] != null && dolVol != null && dolVol > 0) { acc += Math.Abs(ret[i].Value) / dolVol.Value; cnt++; }
                    }
                    if (cnt > 0) outF["liquidity"][t] = -(acc / cnt);
                }

                // volume ratio
                int vw = p.VolumeRatioWindow;
                if (t >= vw && s.MainVol[t] != null)
                {
                    double sv = 0; int cnt = 0;
                    for (int i = t - vw; i < t; i++)
                        if (s.MainVol[i] != null) { sv += s.MainVol[i].Value; cnt++; }
                    if (cnt > 0 && sv > 0) outF["volume"][t] = s.MainVol[t].Value / (sv / cnt) - 1.0;
                }

                // skewness
                int sw = p.SkewWindow;
                if (t >= sw)
                {
                    var win = new List<double>();
                    for (int i = t - sw + 1; i <= t; i++) if (ret[i] != null) win.Add(ret[i].Value);
                    if (win.Count >= 10) outF["skewness"][t] = Stats.Skewness(win);
                }

                // roll yield
                if (s.MainRaw[t] != null && s.SubRaw[t] != null && s.SubRaw[t] > 0)
                {
                    string mc = s.MainCode[dates[t]];
                    string sc = s.SubCode[dates[t]];
                    if (mc != null && sc != null)
                    {
                        var dm = DataAccess.ParseContractCode(code, mc).Delivery;
                        var dsc = DataAccess.ParseContractCode(code, sc).Delivery;
                        double dtDays = Math.Abs(Util.DiffDays(dm, dsc));
                        double rawRY = (s.MainRaw[t].Value - s.SubRaw[t].Value) / s.SubRaw[t].Value;
                        outF["rollYield"][t] = p.RollYieldAnnualize && dtDays > 0 ? rawRY * (365.0 / dtDays) : rawRY;
                    }
                }
            }
            return outF;
        }

        static Dictionary<string, double?[]> CrossSectionalZ(List<string> dates, List<string> varieties,
            Dictionary<string, double?[]> rawByCode, double winsorizeK)
        {
            var outZ = new Dictionary<string, double?[]>();
            foreach (var code in varieties) outZ[code] = Empty(dates.Count);
            for (int t = 0; t < dates.Count; t++)
            {
                var vals = new List<double>();
                var idx = new List<string>();
                foreach (var code in varieties)
                {
                    var v = rawByCode[code][t];
                    if (v != null && !double.IsNaN(v.Value) && !double.IsInfinity(v.Value)) { vals.Add(v.Value); idx.Add(code); }
                }
                if (vals.Count < 2) continue;
                var w = Stats.Winsorize(vals, winsorizeK);
                var z = Stats.ZScore(w);
                for (int k = 0; k < idx.Count; k++) outZ[idx[k]][t] = z[k];
            }
            return outZ;
        }
    }
}
