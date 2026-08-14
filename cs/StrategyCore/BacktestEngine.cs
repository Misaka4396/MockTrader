using System;
using System.Collections.Generic;
using System.Linq;
using MockTrader.Data;

namespace MockTrader.Core
{
    public sealed class BacktestConfig
    {
        public double InitialCapital { get; set; } = 10_000_000;
        public double CommissionRate { get; set; } = 0.0002;
        public double SlippageTicks { get; set; } = 1;
        public int ExecutionDelay { get; set; } = 1;
        public double MaxLeverage { get; set; } = 1.5;
        public double ImpactCoef { get; set; } = 0;
        public int AdvWindow { get; set; } = 20;
        public double DrawdownCutoff { get; set; } = 0;
    }

    public sealed class Trade
    {
        public string Date { get; set; }
        public string Code { get; set; }
        public string Side { get; set; }
        public string Contract { get; set; }
        public string Reason { get; set; }
        public int Dir { get; set; }
        public int Lots { get; set; }
        public int LotsNew { get; set; }
        public string DirLabel { get; set; }
        public double Price { get; set; }
        public double AdjPrice { get; set; }
        public double Notional { get; set; }
        public double Cost { get; set; }
        public double Pnl { get; set; }
    }

    public sealed class RollRecord
    {
        public string Date { get; set; }
        public string Code { get; set; }
        public string From { get; set; }
        public string To { get; set; }
        public int Lots { get; set; }
        public double Cost { get; set; }
    }

    public sealed class Position
    {
        public int Lots { get; set; }
        public int Dir { get; set; }
        public double EntryAdj { get; set; }
        public double EntryRaw { get; set; }
        public string Contract { get; set; }
    }

    public sealed class Snapshot
    {
        public string Date { get; set; }
        public double Equity { get; set; }
        public double Cash { get; set; }
        public double FloatingPnL { get; set; }
        public double UsedMargin { get; set; }
        public double Available { get; set; }
        public double GrossNotional { get; set; }
        public double Nav { get; set; }
        public int NPositions { get; set; }
    }

    public sealed class BacktestSummary
    {
        public double InitialCapital { get; set; }
        public double FinalEquity { get; set; }
        public double TotalCost { get; set; }
        public double TotalRollCost { get; set; }
        public int NTrades { get; set; }
        public int NRolls { get; set; }
        public bool CircuitBroken { get; set; }
    }

    public sealed class BacktestResult
    {
        public List<string> Dates { get; set; }
        public double[] Equity { get; set; }
        public List<Snapshot> Snapshots { get; set; }
        public List<Trade> Trades { get; set; }
        public List<RollRecord> Rolls { get; set; }
        public BacktestSummary Summary { get; set; }
    }

    public sealed class BacktestEngine
    {
        public BacktestResult Run(DataAccess ds, StrategyResult strategy, BacktestConfig cfg = null)
        {
            cfg = cfg ?? new BacktestConfig();
            var dates = ds.Dates;
            int T = dates.Count;

            var seriesCache = new Dictionary<string, ContinuousSeries>();
            ContinuousSeries S(string code)
            {
                if (!seriesCache.TryGetValue(code, out var s)) { s = ds.GetSeries(code); seriesCache[code] = s; }
                return s;
            }

            var lastValidIdx = new Dictionary<string, int>();
            foreach (var code in ds.Codes)
            {
                var s = S(code);
                int li = -1;
                for (int t = 0; t < T; t++) if (s.MainAdj[t] != null) li = t;
                lastValidIdx[code] = li;
            }

            var rollByDate = new Dictionary<string, Dictionary<string, RollEvent>>();
            foreach (var code in ds.Codes)
            {
                var m = new Dictionary<string, RollEvent>();
                foreach (var r in S(code).Rolls) m[r.Date] = r;
                rollByDate[code] = m;
            }

            double cash = cfg.InitialCapital;
            var positions = new Dictionary<string, Position>();
            var trades = new List<Trade>();
            var rolls = new List<RollRecord>();
            var equityArr = new double[T];
            var snapshots = new Snapshot[T];

            (int execIdx, Dictionary<string, double> targets)? pending = null;

            double AdvLots(string code, int t)
            {
                var s = S(code);
                int w = cfg.AdvWindow > 0 ? cfg.AdvWindow : 20;
                double sum = 0;
                int cnt = 0;
                for (int i = Math.Max(0, t - w); i < t; i++)
                {
                    if (s.MainVol[i] != null) { sum += s.MainVol[i].Value; cnt++; }
                }
                return cnt > 0 ? sum / cnt : 0;
            }

            double LegCost(string code, int t, Variety meta, double price, int lots)
            {
                double c = cfg.CommissionRate * price * meta.Mult * lots + cfg.SlippageTicks * meta.TickValue * lots;
                if (cfg.ImpactCoef > 0)
                {
                    double adv = AdvLots(code, t);
                    if (adv > 0)
                    {
                        c += cfg.ImpactCoef * price * meta.Mult * lots * Math.Sqrt(lots / adv);
                    }
                }
                return c;
            }

            (double floating, double margin, double gross, double equity, double avail) Stats(int t)
            {
                double floating = 0, margin = 0, gross = 0;
                foreach (var kv in positions)
                {
                    var pos = kv.Value;
                    var s = S(kv.Key);
                    var meta = ds.GetMeta(kv.Key);
                    double? adjT = s.MainAdj[t];
                    double? rawT = s.MainRaw[t];
                    if (adjT != null) floating += pos.Dir * (adjT.Value - pos.EntryAdj) * meta.Mult * pos.Lots;
                    if (rawT != null)
                    {
                        margin += pos.Lots * rawT.Value * meta.Mult * meta.Margin;
                        gross += pos.Lots * rawT.Value * meta.Mult;
                    }
                }
                double equity = cash + floating;
                return (floating, margin, gross, equity, equity - margin);
            }

            void LiquidateDelisted(int t, string date)
            {
                foreach (var code in positions.Keys.ToList())
                {
                    var s = S(code);
                    if (s.MainAdj[t] != null) continue;
                    int li = lastValidIdx[code];
                    if (li < 0) { positions.Remove(code); continue; }
                    var pos = positions[code];
                    var meta = ds.GetMeta(code);
                    double adjP = s.MainAdj[li].Value;
                    double rawP = s.MainRaw[li] != null ? s.MainRaw[li].Value : pos.EntryRaw;
                    double pnl = pos.Dir * (adjP - pos.EntryAdj) * meta.Mult * pos.Lots;
                    double cost = LegCost(code, t, meta, rawP, pos.Lots);
                    cash += pnl - cost;
                    trades.Add(new Trade { Date = date, Code = code, Side = "close", Dir = pos.Dir, Lots = pos.Lots, Price = rawP, AdjPrice = adjP, Notional = rawP * meta.Mult * pos.Lots, Cost = cost, Pnl = pnl, Contract = pos.Contract, Reason = "delist" });
                    positions.Remove(code);
                }
            }

            void ProcessRolls(int t, string date)
            {
                foreach (var code in positions.Keys.ToList())
                {
                    if (rollByDate.TryGetValue(code, out var m) && m.TryGetValue(date, out var roll))
                    {
                        var pos = positions[code];
                        var meta = ds.GetMeta(code);
                        double oldRaw = roll.FromClose ?? pos.EntryRaw;
                        double newRaw = roll.ToClose ?? pos.EntryRaw;
                        double cost = LegCost(code, t, meta, oldRaw, pos.Lots) + LegCost(code, t, meta, newRaw, pos.Lots);
                        cash -= cost;
                        pos.Contract = roll.To;
                        pos.EntryRaw = newRaw;
                        rolls.Add(new RollRecord { Date = date, Code = code, From = roll.From, To = roll.To, Lots = pos.Lots, Cost = cost });
                    }
                }
            }

            void TradeTo(string date, int t, string code, int targetLots, int targetDir, string targetContract)
            {
                var meta = ds.GetMeta(code);
                var s = S(code);
                double rawT = s.MainRaw[t].Value;
                double adjT = s.MainAdj[t].Value;
                positions.TryGetValue(code, out var cur);
                int curLots = cur != null ? cur.Lots : 0;
                int curDir = cur != null ? cur.Dir : 0;

                if (targetLots == 0 && curLots == 0) return;
                if (targetLots == 0)
                {
                    double pnl = curDir * (adjT - cur.EntryAdj) * meta.Mult * curLots;
                    double cost = LegCost(code, t, meta, rawT, curLots);
                    cash += pnl - cost;
                    trades.Add(new Trade { Date = date, Code = code, Side = "close", Dir = curDir, Lots = curLots, Price = rawT, AdjPrice = adjT, Notional = rawT * meta.Mult * curLots, Cost = cost, Pnl = pnl, Contract = cur.Contract, Reason = "rebalance" });
                    positions.Remove(code);
                    return;
                }
                if (curLots == 0)
                {
                    double cost = LegCost(code, t, meta, rawT, targetLots);
                    cash -= cost;
                    positions[code] = new Position { Lots = targetLots, Dir = targetDir, EntryAdj = adjT, EntryRaw = rawT, Contract = targetContract };
                    trades.Add(new Trade { Date = date, Code = code, Side = "open", Dir = targetDir, Lots = targetLots, Price = rawT, AdjPrice = adjT, Notional = rawT * meta.Mult * targetLots, Cost = cost, Pnl = 0, Contract = targetContract, Reason = "rebalance" });
                    return;
                }
                if (curDir == targetDir)
                {
                    if (targetLots > curLots)
                    {
                        int add = targetLots - curLots;
                        double cost = LegCost(code, t, meta, rawT, add);
                        cash -= cost;
                        positions[code] = new Position { Lots = targetLots, Dir = targetDir, EntryAdj = (cur.Lots * cur.EntryAdj + add * adjT) / targetLots, EntryRaw = (cur.Lots * cur.EntryRaw + add * rawT) / targetLots, Contract = targetContract };
                        trades.Add(new Trade { Date = date, Code = code, Side = "add", Dir = targetDir, Lots = add, Price = rawT, AdjPrice = adjT, Notional = rawT * meta.Mult * add, Cost = cost, Pnl = 0, Contract = targetContract, Reason = "rebalance" });
                    }
                    else if (targetLots < curLots)
                    {
                        int close = curLots - targetLots;
                        double pnl = curDir * (adjT - cur.EntryAdj) * meta.Mult * close;
                        double cost = LegCost(code, t, meta, rawT, close);
                        cash += pnl - cost;
                        positions[code] = new Position { Lots = targetLots, Dir = targetDir, EntryAdj = cur.EntryAdj, EntryRaw = cur.EntryRaw, Contract = targetContract };
                        trades.Add(new Trade { Date = date, Code = code, Side = "reduce", Dir = curDir, Lots = close, Price = rawT, AdjPrice = adjT, Notional = rawT * meta.Mult * close, Cost = cost, Pnl = pnl, Contract = cur.Contract, Reason = "rebalance" });
                    }
                    return;
                }
                double pnlClose = curDir * (adjT - cur.EntryAdj) * meta.Mult * curLots;
                double costClose = LegCost(code, t, meta, rawT, curLots);
                double costOpen = LegCost(code, t, meta, rawT, targetLots);
                cash += pnlClose - costClose - costOpen;
                positions[code] = new Position { Lots = targetLots, Dir = targetDir, EntryAdj = adjT, EntryRaw = rawT, Contract = targetContract };
                trades.Add(new Trade { Date = date, Code = code, Side = "flip", Dir = curDir, Lots = curLots, LotsNew = targetLots, DirLabel = curDir + "->" + targetDir, Price = rawT, AdjPrice = adjT, Notional = rawT * meta.Mult * (curLots + targetLots), Cost = costClose + costOpen, Pnl = pnlClose, Contract = targetContract, Reason = "rebalance" });
            }

            void ExecuteRebalance(int t, string date, Dictionary<string, double> targets)
            {
                var st = Stats(t);
                if (st.equity <= 0)
                {
                    foreach (var code in positions.Keys.ToList()) TradeTo(date, t, code, 0, 0, null);
                    return;
                }
                var desired = new Dictionary<string, (int lots, int dir, string contract)>();
                foreach (var kv in targets)
                {
                    string code = kv.Key;
                    double w = kv.Value;
                    var meta = ds.GetMeta(code);
                    var s = S(code);
                    double rawT = s.MainRaw[t] ?? 0;
                    if (!(rawT > 0)) continue;
                    double notional = Math.Abs(w) * st.equity;
                    int lots = (int)Math.Floor(notional / (rawT * meta.Mult));
                    if (lots <= 0) continue;
                    desired[code] = (lots, w > 0 ? 1 : -1, s.MainCode[date]);
                }
                double totalMargin = 0;
                foreach (var kv in desired)
                {
                    var meta = ds.GetMeta(kv.Key);
                    totalMargin += kv.Value.lots * (S(kv.Key).MainRaw[t] ?? 0) * meta.Mult * meta.Margin;
                }
                double cap = st.equity * (cfg.MaxLeverage > 0 ? cfg.MaxLeverage : 1.5);
                if (totalMargin > cap)
                {
                    double f = cap / totalMargin;
                    foreach (var k in desired.Keys.ToList())
                    {
                        var d = desired[k];
                        desired[k] = ((int)Math.Floor(d.lots * f), d.dir, d.contract);
                    }
                }
                var allCodes = new HashSet<string>(positions.Keys);
                foreach (var k in desired.Keys) allCodes.Add(k);
                foreach (var code in allCodes)
                {
                    bool has = desired.TryGetValue(code, out var d);
                    TradeTo(date, t, code, has ? d.lots : 0, has ? d.dir : 0, has ? d.contract : null);
                }
            }

            var rebSet = new HashSet<string>(strategy.RebalanceDates);
            double peakEquity = cfg.InitialCapital;
            bool circuitBroken = false;
            for (int t = 0; t < T; t++)
            {
                string date = dates[t];
                LiquidateDelisted(t, date);
                ProcessRolls(t, date);
                if (pending != null && pending.Value.execIdx == t)
                {
                    ExecuteRebalance(t, date, pending.Value.targets);
                    pending = null;
                }
                if (rebSet.Contains(date) && pending == null && !circuitBroken)
                {
                    int execIdx = Math.Min(t + (cfg.ExecutionDelay > 0 ? cfg.ExecutionDelay : 1), T - 1);
                    var tg = strategy.Targets.TryGetValue(date, out var tmap) ? tmap : new Dictionary<string, double>();
                    pending = (execIdx, tg);
                }
                var st2 = Stats(t);
                equityArr[t] = st2.equity;
                snapshots[t] = new Snapshot
                {
                    Date = date, Equity = st2.equity, Cash = cash, FloatingPnL = st2.floating,
                    UsedMargin = st2.margin, Available = st2.avail, GrossNotional = st2.gross,
                    Nav = st2.equity / cfg.InitialCapital, NPositions = positions.Count
                };

                if (st2.equity > peakEquity) { peakEquity = st2.equity; }
                if (!circuitBroken && cfg.DrawdownCutoff > 0)
                {
                    double dd = peakEquity > 0 ? (peakEquity - st2.equity) / peakEquity : 0;
                    if (dd >= cfg.DrawdownCutoff)
                    {
                        foreach (var code in positions.Keys.ToList()) { TradeTo(date, t, code, 0, 0, null); }
                        circuitBroken = true;
                    }
                }
            }

            double totalCost = trades.Sum(x => x.Cost);
            double totalRollCost = rolls.Sum(x => x.Cost);
            return new BacktestResult
            {
                Dates = dates, Equity = equityArr, Snapshots = snapshots.ToList(), Trades = trades, Rolls = rolls,
                Summary = new BacktestSummary
                {
                    InitialCapital = cfg.InitialCapital, FinalEquity = equityArr[T - 1],
                    TotalCost = totalCost, TotalRollCost = totalRollCost, NTrades = trades.Count, NRolls = rolls.Count, CircuitBroken = circuitBroken
                }
            };
        }
    }
}
