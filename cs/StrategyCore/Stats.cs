using System;
using System.Collections.Generic;
using System.Linq;

namespace MockTrader.Core
{
    public static class Stats
    {
        public static double Sum(IEnumerable<double> a) { double s = 0; foreach (var x in a) s += x; return s; }
        public static double Mean(IEnumerable<double> a)
        {
            var list = a as IList<double> ?? a.ToList();
            return list.Count == 0 ? double.NaN : Sum(list) / list.Count;
        }
        public static double Variance(IEnumerable<double> a, int ddof = 1)
        {
            var arr = a as double[] ?? a.ToArray();
            int n = arr.Length;
            if (n - ddof <= 0) return double.NaN;
            double m = Mean(arr);
            double s = 0;
            foreach (var x in arr) s += (x - m) * (x - m);
            return s / (n - ddof);
        }
        public static double Std(IEnumerable<double> a, int ddof = 1) => Math.Sqrt(Variance(a, ddof));

        public static double Percentile(IEnumerable<double> a, double p)
        {
            var sorted = a.OrderBy(x => x).ToArray();
            if (sorted.Length == 0) return double.NaN;
            if (p <= 0) return sorted[0];
            if (p >= 1) return sorted[sorted.Length - 1];
            double idx = (sorted.Length - 1) * p;
            int lo = (int)Math.Floor(idx), hi = (int)Math.Ceiling(idx);
            double w = idx - lo;
            return sorted[lo] * (1 - w) + sorted[hi] * w;
        }
        public static double Median(IEnumerable<double> a) => Percentile(a, 0.5);

        public static double[] ZScore(IEnumerable<double> a)
        {
            var arr = a as double[] ?? a.ToArray();
            double m = Mean(arr), s = Std(arr, 0);
            if (!(s > 0)) return arr.Select(_ => 0.0).ToArray();
            return arr.Select(x => (x - m) / s).ToArray();
        }

        public static double[] Rank(IEnumerable<double> a)
        {
            var arr = a as double[] ?? a.ToArray();
            int n = arr.Length;
            var idx = arr.Select((v, i) => (v, i)).OrderBy(x => x.v).ToArray();
            var outArr = new double[n];
            int i = 0;
            while (i < n)
            {
                int j = i;
                while (j + 1 < n && idx[j + 1].v == idx[i].v) j++;
                double avg = (i + j) / 2.0 + 1.0;
                for (int k = i; k <= j; k++) outArr[idx[k].i] = avg;
                i = j + 1;
            }
            return outArr;
        }

        public static double Pearson(IEnumerable<double> a, IEnumerable<double> b)
        {
            var aa = a as double[] ?? a.ToArray();
            var bb = b as double[] ?? b.ToArray();
            int n = aa.Length;
            if (n < 2 || n != bb.Length) return double.NaN;
            double ma = Mean(aa), mb = Mean(bb);
            double num = 0, da = 0, db = 0;
            for (int i = 0; i < n; i++)
            {
                num += (aa[i] - ma) * (bb[i] - mb);
                da += (aa[i] - ma) * (aa[i] - ma);
                db += (bb[i] - mb) * (bb[i] - mb);
            }
            double den = Math.Sqrt(da * db);
            return den > 0 ? num / den : double.NaN;
        }
        public static double Spearman(IEnumerable<double> a, IEnumerable<double> b) => Pearson(Rank(a), Rank(b));

        public static double[] Winsorize(IEnumerable<double> a, double k = 2.5)
        {
            var arr = a as double[] ?? a.ToArray();
            if (arr.Length == 0) return arr;
            double med = Median(arr);
            var absDev = arr.Select(x => Math.Abs(x - med)).ToArray();
            double mad = Median(absDev);
            if (!(mad > 0)) mad = 1e-12;
            double cap = k * 1.4826 * mad;
            double lo = med - cap, hi = med + cap;
            return arr.Select(x => Math.Max(lo, Math.Min(hi, x))).ToArray();
        }

        public static double Skewness(IEnumerable<double> a)
        {
            var arr = a as double[] ?? a.ToArray();
            int n = arr.Length;
            if (n < 3) return double.NaN;
            double m = Mean(arr), s = Std(arr, 0);
            if (!(s > 0)) return double.NaN;
            double acc = 0;
            for (int i = 0; i < n; i++) acc += Math.Pow(arr[i] - m, 3);
            return (acc / n) / Math.Pow(s, 3);
        }
    }
}
