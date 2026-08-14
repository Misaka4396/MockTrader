using System;
using System.Collections.Generic;

namespace MockTrader.Data
{
    public sealed class RollEvent
    {
        public string Date, From, To;
        public double? FromClose, ToClose;
    }

    public sealed class ContinuousSeries
    {
        public List<string> Dates;
        public Dictionary<string, string> MainCode;
        public Dictionary<string, string> SubCode;
        public double?[] MainRaw, MainAdj, SubRaw, SubAdj, MainOi, SubOi, MainVol;
        public List<RollEvent> Rolls;
    }

    public static class Roll
    {
        static Dictionary<string, Dictionary<string, Bar>> BuildIndex(Dictionary<string, List<Bar>> contracts)
        {
            var idx = new Dictionary<string, Dictionary<string, Bar>>();
            foreach (var kv in contracts)
            {
                var m = new Dictionary<string, Bar>();
                foreach (var b in kv.Value) m[b.Date] = b;
                idx[kv.Key] = m;
            }
            return idx;
        }

        static bool Better(string aCode, Bar a, string bCode, Bar b)
        {
            if (a.OpenInterest != b.OpenInterest) return a.OpenInterest > b.OpenInterest;
            if (a.Volume != b.Volume) return a.Volume > b.Volume;
            return string.CompareOrdinal(aCode, bCode) < 0;
        }

        public static (Dictionary<string, string> Main, Dictionary<string, string> Sub) BuildMainSub(
            List<string> dates, Dictionary<string, List<Bar>> contracts, double hysteresis = 1.15)
        {
            var idx = BuildIndex(contracts);
            var codes = new List<string>(contracts.Keys);
            var main = new Dictionary<string, string>();
            var sub = new Dictionary<string, string>();
            string currentMain = null;
            foreach (var d in dates)
            {
                var cands = new List<(string code, Bar bar)>();
                foreach (var c in codes)
                    if (idx[c].TryGetValue(d, out var b)) cands.Add((c, b));

                if (cands.Count == 0) { main[d] = null; sub[d] = null; continue; }
                cands.Sort((x, y) => Better(x.code, x.bar, y.code, y.bar) ? -1 : 1);
                var rawBest = cands[0];
                string m;
                if (currentMain == null) m = rawBest.code;
                else
                {
                    bool hasCur = idx[currentMain].TryGetValue(d, out var curBar);
                    if (!hasCur) m = rawBest.code;
                    else if (rawBest.code == currentMain) m = currentMain;
                    else m = rawBest.bar.OpenInterest > curBar.OpenInterest * hysteresis ? rawBest.code : currentMain;
                }
                currentMain = m;
                string s = null;
                foreach (var cand in cands) { if (cand.code != m) { s = cand.code; break; } }
                main[d] = m; sub[d] = s;
            }
            return (main, sub);
        }

        public static double[] BackAdjustFactors(List<string> dates, Dictionary<string, string> codeByDate, Func<string, string, double?> getClose)
        {
            int T = dates.Count;
            var factors = new double[T];
            for (int i = 0; i < T; i++) factors[i] = 1.0;
            for (int t = T - 2; t >= 0; t--)
            {
                string cur = codeByDate[dates[t]];
                string nxt = codeByDate[dates[t + 1]];
                if (cur != null && nxt != null && cur != nxt)
                {
                    double? cn = getClose(nxt, dates[t]);
                    double? co = getClose(cur, dates[t]);
                    if (cn != null && co != null && co > 0) factors[t] = factors[t + 1] * (cn.Value / co.Value);
                    else factors[t] = factors[t + 1];
                }
                else factors[t] = factors[t + 1];
            }
            return factors;
        }

        public static ContinuousSeries ComputeSeries(List<string> dates, Dictionary<string, List<Bar>> contracts, double hysteresis = 1.15)
        {
            var (main, sub) = BuildMainSub(dates, contracts, hysteresis);
            var idx = BuildIndex(contracts);
            double? GetClose(string code, string date) =>
                idx.TryGetValue(code, out var m) && m.TryGetValue(date, out var b) ? (double?)b.Close : null;

            int T = dates.Count;
            var mainRaw = new double?[T]; var mainAdj = new double?[T];
            var subRaw = new double?[T]; var subAdj = new double?[T];
            var mainOi = new double?[T]; var subOi = new double?[T]; var mainVol = new double?[T];
            var mainFactors = BackAdjustFactors(dates, main, GetClose);
            var subFactors = BackAdjustFactors(dates, sub, GetClose);
            var rolls = new List<RollEvent>();
            for (int t = 0; t < T; t++)
            {
                string d = dates[t];
                string mc = main[d]; string sc = sub[d];
                if (mc != null)
                {
                    var b = idx[mc][d];
                    mainRaw[t] = b.Close; mainOi[t] = b.OpenInterest; mainVol[t] = b.Volume;
                    mainAdj[t] = mainRaw[t].Value * mainFactors[t];
                }
                if (sc != null)
                {
                    var b = idx[sc][d];
                    subRaw[t] = b.Close; subOi[t] = b.OpenInterest;
                    subAdj[t] = subRaw[t].Value * subFactors[t];
                }
                if (t > 0 && mc != null && main[dates[t - 1]] != null && mc != main[dates[t - 1]])
                {
                    string from = main[dates[t - 1]];
                    rolls.Add(new RollEvent { Date = d, From = from, To = mc, FromClose = GetClose(from, dates[t - 1]), ToClose = mainRaw[t] });
                }
            }
            return new ContinuousSeries
            {
                Dates = dates, MainCode = main, SubCode = sub,
                MainRaw = mainRaw, MainAdj = mainAdj, SubRaw = subRaw, SubAdj = subAdj,
                MainOi = mainOi, SubOi = subOi, MainVol = mainVol, Rolls = rolls
            };
        }

        public static double MaxAbsReturn(double?[] prices)
        {
            double mx = 0;
            for (int i = 1; i < prices.Length; i++)
                if (prices[i] != null && prices[i - 1] != null && prices[i - 1] > 0)
                    mx = Math.Max(mx, Math.Abs(Math.Log(prices[i].Value / prices[i - 1].Value)));
            return mx;
        }
    }
}
