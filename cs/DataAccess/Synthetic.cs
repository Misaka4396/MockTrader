using System;
using System.Collections.Generic;

namespace MockTrader.Data
{
    public sealed class Bar
    {
        public string Date;
        public double Open, High, Low, Close, Settle;
        public long Volume, OpenInterest;
    }

    public sealed class SimParams
    {
        public double Vol, Drift, CarryMean, CarryVol, Rho, SeasonAmp, OiPeak, OiSpread, VolBase, OiBase;
    }

    public static class Synthetic
    {
        static SimParams Sp(double vol, double drift, double carryMean, double carryVol, double rho,
            double seasonAmp, double oiPeak, double oiSpread, double volBase, double oiBase) => new SimParams
        {
            Vol = vol, Drift = drift, CarryMean = carryMean, CarryVol = carryVol, Rho = rho,
            SeasonAmp = seasonAmp, OiPeak = oiPeak, OiSpread = oiSpread, VolBase = volBase, OiBase = oiBase
        };

        static readonly Dictionary<string, SimParams> SectorDefault = new Dictionary<string, SimParams>
        {
            ["黑色"]   = Sp(0.25, 0, -0.05, 0.09, 0.995, 0.04, 2.2, 3.0, 120000, 160000),
            ["有色"]   = Sp(0.22, 0,  0.04, 0.07, 0.995, 0.03, 2.2, 3.0,  90000, 140000),
            ["能化"]   = Sp(0.28, 0,  0.02, 0.10, 0.995, 0.05, 2.2, 3.0, 150000, 200000),
            ["农产品"] = Sp(0.20, 0,  0.00, 0.09, 0.995, 0.06, 2.5, 3.2, 110000, 180000),
            ["贵金属"] = Sp(0.14, 0,  0.05, 0.05, 0.995, 0.02, 2.5, 3.0,  80000, 120000),
        };

        static readonly Dictionary<string, double> CarryOverride = new Dictionary<string, double>
        {
            ["RB"]=-0.06, ["HC"]=-0.06, ["I"]=-0.08, ["J"]=-0.07, ["JM"]=-0.07,
            ["SF"]=-0.03, ["SM"]=-0.03, ["FG"]=-0.04, ["SA"]=0.01,
            ["CU"]=0.06, ["AL"]=0.03, ["ZN"]=0.04, ["PB"]=0.02, ["NI"]=0.05, ["SN"]=0.05,
            ["AO"]=0.03, ["SS"]=0.04,
            ["SC"]=0.06, ["FU"]=0.05, ["RU"]=-0.03, ["BU"]=0.02, ["TA"]=0.01,
            ["EG"]=0.02, ["MA"]=0.01, ["PP"]=0.02, ["L"]=0.02, ["V"]=0.03, ["EB"]=0.02,
            ["M"]=-0.05, ["Y"]=-0.02, ["P"]=-0.03, ["A"]=-0.02, ["C"]=-0.02,
            ["CS"]=-0.01, ["CF"]=0.02, ["SR"]=0.03, ["OI"]=-0.01, ["RM"]=-0.04,
            ["AP"]=-0.03, ["JD"]=-0.02,
            ["AU"]=0.06, ["AG"]=0.05,
            ["WR"]=-0.05, ["BB"]=0.02, ["RS"]=-0.03,
        };

        public static SimParams ParamsFor(string code, string sector)
        {
            var s = SectorDefault[sector];
            var p = new SimParams { Vol = s.Vol, Drift = s.Drift, CarryMean = s.CarryMean, CarryVol = s.CarryVol,
                Rho = s.Rho, SeasonAmp = s.SeasonAmp, OiPeak = s.OiPeak, OiSpread = s.OiSpread,
                VolBase = s.VolBase, OiBase = s.OiBase };
            if (CarryOverride.TryGetValue(code, out var cm)) p.CarryMean = cm;
            return p;
        }

        const double DT = 1.0 / 252.0;

        public static string ContractCode(string code, int year, int month)
            => code + year.ToString().Substring(2) + month.ToString("00");

        public static string DeliveryIso(int year, int month) => year + "-" + month.ToString("00") + "-15";

        static double OiShape(double m, double peak, double spread)
        {
            double s = m < peak ? spread * 0.55 : spread;
            return Math.Exp(-((m - peak) * (m - peak)) / (2.0 * s * s));
        }

        static double VolShape(double m, double peak, double spread)
            => Math.Exp(-((m - peak) * (m - peak)) / (2.0 * spread * spread));

        static int[] DeliveryMonths(Variety meta)
        {
            if (meta.Months != null) return (int[])meta.Months.Clone();
            var all = new int[12];
            for (int m = 1; m <= 12; m++) all[m - 1] = m;
            return all;
        }

        sealed class ContractSpec
        {
            public string Code, Delivery, ListDate, LastTrade;
        }

        public static Dictionary<string, List<Bar>> GenerateVariety(Variety meta, List<string> dates, string masterSeed)
        {
            var sim = ParamsFor(meta.Code, meta.Sector);
            var rng = new Mulberry32(Rng.StringSeed(masterSeed + ":" + meta.Code));
            int N = dates.Count;
            string first = dates[0], last = dates[N - 1];

            int warmupDays = 260;
            string extStart = Util.AddDays(first, -(int)Math.Round(warmupDays * 1.45));
            var extDates = Util.TradingDates(extStart, last);
            int extN = extDates.Count;
            var idxOf = new Dictionary<string, int>();
            for (int i = 0; i < extN; i++) idxOf[extDates[i]] = i;

            var logP = new double[extN];
            var carry = new double[extN];
            double kappa = 0.03;
            double dailyVol = sim.Vol * Math.Sqrt(DT);
            double lp = Math.Log(meta.Ref);
            double c = sim.CarryMean;
            for (int i = 0; i < extN; i++)
            {
                string d = extDates[i];
                int month = int.Parse(d.Substring(5, 2));
                double seasonalDrift = sim.SeasonAmp * Math.Cos((2.0 * Math.PI * (month - 1)) / 12.0) * DT;
                if (i == 0) { logP[0] = lp; carry[0] = c; }
                else
                {
                    lp = lp + sim.Drift * DT + seasonalDrift + kappa * (Math.Log(meta.Ref) - lp) * DT + dailyVol * rng.NextGaussian();
                    c = sim.CarryMean + sim.Rho * (c - sim.CarryMean) + sim.CarryVol * Math.Sqrt(DT) * rng.NextGaussian();
                    logP[i] = lp; carry[i] = c;
                }
            }

            var months = DeliveryMonths(meta);
            int gap = months.Length >= 2 ? (((months[1] - months[0]) % 12) + 12) % 12 : 1;
            double oiPeak = gap == 1 ? 2.0 : sim.OiPeak;
            double oiSpread = gap == 1 ? 1.3 : sim.OiSpread;

            int y0 = int.Parse(first.Substring(0, 4));
            int y1 = int.Parse(last.Substring(0, 4));
            var specs = new List<ContractSpec>();
            for (int y = y0 - 1; y <= y1 + 1; y++)
            {
                foreach (int mm in months)
                {
                    string del = DeliveryIso(y, mm);
                    string listDate = Util.AddDays(del, -360);
                    string lastTrade = Util.AddDays(del, -7);
                    if (string.CompareOrdinal(lastTrade, first) < 0 || string.CompareOrdinal(listDate, last) > 0) continue;
                    specs.Add(new ContractSpec { Code = ContractCode(meta.Code, y, mm), Delivery = del, ListDate = listDate, LastTrade = lastTrade });
                }
            }
            specs.Sort((a, b) => string.CompareOrdinal(a.Delivery, b.Delivery));

            var contracts = new Dictionary<string, List<Bar>>();
            foreach (var con in specs)
            {
                double basisC = 0.0015 * rng.NextGaussian();
                var bars = new List<Bar>();
                double? prevClose = null;
                foreach (string d in dates)
                {
                    if (string.CompareOrdinal(d, con.ListDate) < 0 || string.CompareOrdinal(d, con.LastTrade) > 0) continue;
                    if (meta.Delist != null && string.CompareOrdinal(d, meta.Delist) > 0) continue;
                    if (!idxOf.TryGetValue(d, out int i)) continue;
                    double spot = Math.Exp(logP[i]);
                    double ttm = Math.Max(Util.DiffDays(d, con.Delivery), 1) / 365.0;
                    double fair = spot * Math.Exp(carry[i] * ttm) * (1.0 + basisC);
                    double dailyEps = 0.0006 * rng.NextGaussian();
                    double close = fair * (1.0 + dailyEps);
                    double gapV = prevClose == null ? 0.0 : 0.0008 * rng.NextGaussian();
                    double open = prevClose == null ? close : prevClose.Value * (1.0 + gapV);
                    double hnoise = 0.0006 * Math.Abs(rng.NextGaussian());
                    double lnoise = 0.0006 * Math.Abs(rng.NextGaussian());
                    double high = Math.Max(open, close) * (1.0 + hnoise);
                    double low = Math.Min(open, close) * (1.0 - lnoise);
                    double m = ttm * 12.0;
                    double liq = VolShape(m, oiPeak, oiSpread);
                    long volume = Math.Max(0, (long)Math.Floor(sim.VolBase * liq * (1.0 + 0.25 * rng.NextGaussian()) + 0.5));
                    long oi = Math.Max(0, (long)Math.Floor(sim.OiBase * OiShape(m, oiPeak, oiSpread) * (1.0 + 0.02 * rng.NextGaussian()) + 0.5));
                    double tick = meta.Tick;
                    bars.Add(new Bar
                    {
                        Date = d,
                        Open = Util.RoundTo(Util.RoundTick(open, tick), 6),
                        High = Util.RoundTo(Util.RoundTick(high, tick), 6),
                        Low = Util.RoundTo(Util.RoundTick(low, tick), 6),
                        Close = Util.RoundTo(Util.RoundTick(close, tick), 6),
                        Settle = Util.RoundTo(Util.RoundTick(close, tick), 6),
                        Volume = volume,
                        OpenInterest = oi
                    });
                    prevClose = close;
                }
                if (bars.Count > 0) contracts[con.Code] = bars;
            }
            return contracts;
        }
    }
}
