using System;
using System.Collections.Generic;

namespace MockTrader.Data
{
    public sealed class Variety
    {
        public string Code { get; set; }
        public string Name { get; set; }
        public string Sector { get; set; }
        public string Exchange { get; set; }
        public string Unit { get; set; }
        public double Mult { get; set; }
        public double Margin { get; set; }
        public double Tick { get; set; }
        public double TickValue { get; set; }
        public int[] Months { get; set; }      // null = 全部 12 个月
        public string List { get; set; }
        public string Delist { get; set; } // Delist = null 表示仍上市
        public double Ref { get; set; }

        public bool ActiveAt(string date)
        {
            if (List != null && string.CompareOrdinal(date, List) < 0) return false;
            if (Delist != null && string.CompareOrdinal(date, Delist) > 0) return false;
            return true;
        }
    }

    public static class Metadata
    {
        static Variety V(string code, string name, string sector, string exchange, double mult,
            double margin, double tick, string unit, int[] months, string list, string delist, double refP)
        {
            return new Variety
            {
                Code = code, Name = name, Sector = sector, Exchange = exchange,
                Mult = mult, Margin = margin, Tick = tick, TickValue = Math.Round(mult * tick),
                Unit = unit, Months = months, List = list, Delist = delist, Ref = refP
            };
        }

        public static readonly List<Variety> All = new List<Variety>
        {
            // 黑色 (9)
            V("RB","螺纹钢","黑色","SHFE",10,0.12,1,"元/吨",null,"2009-03-27",null,3600),
            V("HC","热轧卷板","黑色","SHFE",10,0.12,1,"元/吨",null,"2014-03-21",null,3700),
            V("I","铁矿石","黑色","DCE",100,0.15,0.5,"元/吨",null,"2013-10-18",null,800),
            V("J","焦炭","黑色","DCE",100,0.20,0.5,"元/吨",null,"2011-04-15",null,2100),
            V("JM","焦煤","黑色","DCE",60,0.20,0.5,"元/吨",null,"2013-03-22",null,1500),
            V("SF","硅铁","黑色","CZCE",5,0.12,2,"元/吨",null,"2014-08-08",null,6800),
            V("SM","锰硅","黑色","CZCE",5,0.12,2,"元/吨",null,"2014-08-08",null,6600),
            V("FG","玻璃","黑色","CZCE",20,0.12,1,"元/吨",null,"2012-12-03",null,1500),
            V("SA","纯碱","黑色","CZCE",20,0.12,1,"元/吨",null,"2019-12-06",null,2200),
            // 有色 (8)
            V("CU","铜","有色","SHFE",5,0.10,10,"元/吨",null,"1993-03-01",null,68000),
            V("AL","铝","有色","SHFE",5,0.10,5,"元/吨",null,"1992-05-28",null,19000),
            V("ZN","锌","有色","SHFE",5,0.10,5,"元/吨",null,"2007-03-26",null,22000),
            V("PB","铅","有色","SHFE",5,0.10,5,"元/吨",null,"2011-03-24",null,15500),
            V("NI","镍","有色","SHFE",1,0.12,10,"元/吨",null,"2015-03-27",null,150000),
            V("SN","锡","有色","SHFE",1,0.12,10,"元/吨",null,"2015-03-27",null,210000),
            V("AO","氧化铝","有色","SHFE",20,0.12,1,"元/吨",null,"2023-06-19",null,3200),
            V("SS","不锈钢","有色","SHFE",5,0.12,5,"元/吨",null,"2019-09-25",null,14000),
            // 能化 (11)
            V("SC","原油","能化","INE",1000,0.12,0.1,"元/桶",null,"2018-03-26",null,550),
            V("FU","燃料油","能化","SHFE",10,0.12,1,"元/吨",null,"2004-08-25",null,3000),
            V("RU","橡胶","能化","SHFE",10,0.12,5,"元/吨",new[]{1,5,9},"1993-06-01",null,13000),
            V("BU","沥青","能化","SHFE",10,0.12,1,"元/吨",null,"2013-10-09",null,3700),
            V("TA","PTA","能化","CZCE",5,0.12,2,"元/吨",new[]{1,5,9},"2006-12-18",null,5600),
            V("EG","乙二醇","能化","DCE",10,0.12,1,"元/吨",null,"2018-12-10",null,4500),
            V("MA","甲醇","能化","CZCE",10,0.12,1,"元/吨",null,"2011-10-28",null,2500),
            V("PP","聚丙烯","能化","DCE",5,0.12,1,"元/吨",null,"2014-02-28",null,7600),
            V("L","塑料","能化","DCE",5,0.12,1,"元/吨",null,"2007-07-31",null,8100),
            V("V","PVC","能化","DCE",5,0.12,1,"元/吨",null,"2009-05-25",null,6000),
            V("EB","苯乙烯","能化","DCE",5,0.12,1,"元/吨",null,"2019-09-26",null,8500),
            // 农产品 (12)
            V("M","豆粕","农产品","DCE",10,0.10,1,"元/吨",new[]{1,5,9},"2000-07-17",null,3800),
            V("Y","豆油","农产品","DCE",10,0.10,2,"元/吨",new[]{1,5,9},"2006-01-09",null,8000),
            V("P","棕榈油","农产品","DCE",10,0.10,2,"元/吨",new[]{1,5,9},"2007-10-29",null,7800),
            V("A","豆一","农产品","DCE",10,0.10,1,"元/吨",new[]{1,5,9},"2002-03-15",null,5200),
            V("C","玉米","农产品","DCE",10,0.10,1,"元/吨",new[]{1,5,9},"2004-09-22",null,2600),
            V("CS","玉米淀粉","农产品","DCE",10,0.10,1,"元/吨",new[]{1,5,9},"2014-12-19",null,3100),
            V("CF","棉花","农产品","CZCE",5,0.10,5,"元/吨",new[]{1,5,9},"2004-06-01",null,16000),
            V("SR","白糖","农产品","CZCE",10,0.10,1,"元/吨",new[]{1,5,9},"2006-01-06",null,5800),
            V("OI","菜籽油","农产品","CZCE",10,0.10,1,"元/吨",new[]{1,5,9},"2007-06-08",null,9000),
            V("RM","菜籽粕","农产品","CZCE",10,0.10,1,"元/吨",new[]{1,5,9},"2012-12-28",null,2800),
            V("AP","苹果","农产品","CZCE",10,0.12,1,"元/吨",new[]{1,5,10},"2017-12-22",null,8500),
            V("JD","鸡蛋","农产品","DCE",10,0.12,1,"元/500千克",null,"2013-11-08",null,4000),
            // 贵金属 (2)
            V("AU","黄金","贵金属","SHFE",1000,0.08,0.02,"元/克",null,"2008-01-09",null,450),
            V("AG","白银","贵金属","SHFE",15,0.09,1,"元/千克",null,"2012-05-10",null,5500),
            // 已退市 (幸存者偏差演示)
            V("WR","线材","黑色","SHFE",10,0.12,1,"元/吨",null,"2009-03-27","2023-06-30",3800),
            V("BB","胶合板","黑色","DCE",500,0.20,0.05,"元/张",null,"2013-12-06","2022-06-30",150),
            V("RS","油菜籽","农产品","CZCE",10,0.12,1,"元/吨",new[]{1,5,9},"2012-12-28","2021-06-30",5000),
        };

        public static readonly Dictionary<string, Variety> ByCode = new Dictionary<string, Variety>();
        static Metadata()
        {
            foreach (var v in All) ByCode[v.Code] = v;
        }

        public static Variety Get(string code) => ByCode.TryGetValue(code, out var v) ? v : null;
    }
}
