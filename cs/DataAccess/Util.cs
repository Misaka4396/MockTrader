using System;
using System.Collections.Generic;
using System.Globalization;

namespace MockTrader.Data
{
    public static class Util
    {
        public static DateTime Parse(string iso) =>
            DateTime.ParseExact(iso, "yyyy-MM-dd", CultureInfo.InvariantCulture);

        public static string Format(DateTime d) => d.ToString("yyyy-MM-dd");

        public static string AddDays(string iso, int n) => Format(Parse(iso).AddDays(n));

        public static int DiffDays(string a, string b) =>
            (int)Math.Round((Parse(b) - Parse(a)).TotalDays);

        public static bool IsWeekday(string iso)
        {
            var d = Parse(iso).DayOfWeek;
            return d != DayOfWeek.Saturday && d != DayOfWeek.Sunday;
        }

        public static List<string> TradingDates(string start, string end)
        {
            var list = new List<string>();
            var cur = Parse(start);
            var e = Parse(end);
            while (cur <= e)
            {
                var s = Format(cur);
                if (IsWeekday(s)) list.Add(s);
                cur = cur.AddDays(1);
            }
            return list;
        }

        public static double RoundTick(double x, double tick) => Math.Floor(x / tick + 0.5) * tick;

        public static double RoundTo(double x, int dp) => Math.Round(x, dp, MidpointRounding.AwayFromZero);
    }
}
