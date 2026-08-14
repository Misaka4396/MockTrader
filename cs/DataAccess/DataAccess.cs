using System;
using System.Collections.Generic;

namespace MockTrader.Data
{
    public sealed class ContractInfo
    {
        public int Year { get; set; }
        public int Month { get; set; }
        public string Delivery { get; set; }
    }

    public sealed class DataAccess
    {
        public List<string> Dates { get; private set; }
        public Dictionary<string, Dictionary<string, List<Bar>>> Dataset { get; private set; }
        public Dictionary<string, ContinuousSeries> Series { get; private set; }

        public DataAccess() { Reset(); }

        public void Reset()
        {
            Dates = new List<string>();
            Dataset = new Dictionary<string, Dictionary<string, List<Bar>>>();
            Series = new Dictionary<string, ContinuousSeries>();
        }

        public static ContractInfo ParseContractCode(string varietyCode, string contractCode)
        {
            string yyMM = contractCode.Substring(varietyCode.Length);
            int yy = int.Parse(yyMM.Substring(0, 2));
            int mm = int.Parse(yyMM.Substring(2));
            return new ContractInfo { Year = 2000 + yy, Month = mm, Delivery = Synthetic.DeliveryIso(2000 + yy, mm) };
        }

        public void Generate(string start = "2022-01-03", string end = "2024-12-31",
            string masterSeed = "mocktrader-default-seed", IList<string> varieties = null)
        {
            var dates = Util.TradingDates(start, end);
            var codes = (varieties != null && varieties.Count > 0)
                ? new List<string>(varieties)
                : Metadata.All.ConvertAll(v => v.Code);
            var dataset = new Dictionary<string, Dictionary<string, List<Bar>>>();
            foreach (var code in codes)
            {
                var meta = Metadata.Get(code);
                if (meta == null) continue;
                dataset[code] = Synthetic.GenerateVariety(meta, dates, masterSeed);
            }
            Dates = dates;
            Dataset = dataset;
            Series = new Dictionary<string, ContinuousSeries>();
        }

        public List<string> Codes => new List<string>(Dataset.Keys);

        public Variety GetMeta(string code) => Metadata.Get(code);

        public List<Variety> AllMetadata => Metadata.All;

        public List<string> GetContracts(string code)
        {
            if (!Dataset.TryGetValue(code, out var c)) return new List<string>();
            var list = new List<string>(c.Keys);
            list.Sort(StringComparer.Ordinal);
            return list;
        }

        public List<Bar> GetBars(string code, string contractCode) =>
            Dataset.TryGetValue(code, out var c) && c.TryGetValue(contractCode, out var bars) ? bars : null;

        public ContinuousSeries GetSeries(string code)
        {
            if (!Dataset.TryGetValue(code, out var c)) return null;
            if (!Series.TryGetValue(code, out var s))
            {
                s = Roll.ComputeSeries(Dates, c);
                Series[code] = s;
            }
            return s;
        }

        public List<RollEvent> GetRolls(string code)
        {
            var s = GetSeries(code);
            return s != null ? s.Rolls : new List<RollEvent>();
        }

        public double GetMaxJump(string code)
        {
            var s = GetSeries(code);
            return s != null ? Roll.MaxAbsReturn(s.MainAdj) : 0;
        }
    }
}
