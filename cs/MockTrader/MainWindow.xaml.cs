using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;
using MockTrader.Core;
using MockTrader.Data;

namespace MockTrader
{
    public partial class MainWindow : Window
    {
        private readonly List<CheckBox> varietyBoxes = new List<CheckBox>();
        private PerformanceResult lastPerf;
        private static readonly Brush Cyan = new SolidColorBrush(Color.FromRgb(14, 116, 144));
        private static readonly Brush Orange = new SolidColorBrush(Color.FromRgb(217, 119, 6));
        private static readonly Brush Good = new SolidColorBrush(Color.FromRgb(5, 150, 105));
        private static readonly Brush Bad = new SolidColorBrush(Color.FromRgb(220, 38, 38));
        private static readonly Brush Amber = new SolidColorBrush(Color.FromRgb(217, 119, 6));
        private static readonly Brush Dim = new SolidColorBrush(Color.FromRgb(75, 85, 99));
        private static readonly Brush Text = new SolidColorBrush(Color.FromRgb(17, 24, 39));

        public MainWindow()
        {
            InitializeComponent();
            BuildVarietyPicker();
            InitCombos();
            ChartCanvas.SizeChanged += (s, e) => { if (lastPerf != null) DrawChart(lastPerf); };
        }

        void InitCombos()
        {
            StrategyCombo.ItemsSource = new[]
            {
                "5 因子合成", "单因子 · 截面动量", "单因子 · 流动性", "单因子 · 成交量", "单因子 · 价格偏度", "单因子 · 展期收益率"
            };
            StrategyCombo.SelectedIndex = 0;
            WeightingCombo.ItemsSource = new[] { "等权", "得分加权" };
            WeightingCombo.SelectedIndex = 0;
            CombineCombo.ItemsSource = new[] { "等权", "IC 加权" };
            CombineCombo.SelectedIndex = 0;
            RebalanceCombo.ItemsSource = new[] { "月度", "周度" };
            RebalanceCombo.SelectedIndex = 0;
        }

        void BuildVarietyPicker()
        {
            string[] sectors = { "黑色", "有色", "能化", "农产品", "贵金属" };
            foreach (var sec in sectors)
            {
                var list = Metadata.All.Where(v => v.Sector == sec).ToList();
                var header = new TextBlock
                {
                    Text = sec + " (" + list.Count + ")",
                    Foreground = Cyan, FontWeight = FontWeights.Bold, FontSize = 12, Margin = new Thickness(0, 6, 0, 2)
                };
                VarietyPanel.Children.Add(header);
                var wrap = new WrapPanel();
                foreach (var v in list)
                {
                    var cb = new CheckBox
                    {
                        Content = v.Code + " " + v.Name,
                        IsChecked = true,
                        Foreground = Text,
                        FontSize = 12,
                        Margin = new Thickness(0, 1, 12, 1),
                        ToolTip = v.Delist != null ? "已退市 " + v.Delist : null
                    };
                    varietyBoxes.Add(cb);
                    wrap.Children.Add(cb);
                }
                VarietyPanel.Children.Add(wrap);
            }
        }

        void SelectAll_Click(object sender, RoutedEventArgs e) { foreach (var cb in varietyBoxes) cb.IsChecked = true; }
        void SelectNone_Click(object sender, RoutedEventArgs e) { foreach (var cb in varietyBoxes) cb.IsChecked = false; }

        List<string> SelectedVarieties()
        {
            int total = varietyBoxes.Count;
            int checkedCount = varietyBoxes.Count(cb => cb.IsChecked == true);
            if (checkedCount == total) return null;
            return varietyBoxes.Where(cb => cb.IsChecked == true).Select(cb => ((string)cb.Content).Split(' ')[0]).ToList();
        }

        double ParseDouble(TextBox tb, double def) => double.TryParse(tb.Text, out var v) ? v : def;
        int ParseInt(TextBox tb, int def) => int.TryParse(tb.Text, out var v) ? v : def;

        PipelineOptions GatherConfig()
        {
            var o = new PipelineOptions { Varieties = SelectedVarieties() };
            int mode = StrategyCombo.SelectedIndex;
            var factors = mode switch
            {
                1 => new List<string> { "momentum" },
                2 => new List<string> { "liquidity" },
                3 => new List<string> { "volume" },
                4 => new List<string> { "skewness" },
                5 => new List<string> { "rollYield" },
                _ => new List<string>(FactorKeys.All)
            };
            o.StrategyConfig.Factors = factors;
            o.StrategyConfig.LongCount = ParseInt(LongBox, 5);
            o.StrategyConfig.ShortCount = ParseInt(ShortBox, 5);
            o.StrategyConfig.Weighting = WeightingCombo.SelectedIndex == 1 ? "score" : "equal";
            o.StrategyConfig.Combine = CombineCombo.SelectedIndex == 1 ? "ic" : "equal";
            bool weekly = RebalanceCombo.SelectedIndex == 1;
            o.StrategyConfig.Rebalance = weekly ? "weekly" : "monthly";
            o.StrategyConfig.RebalanceDays = weekly ? 5 : 21;
            o.StrategyConfig.GrossExposure = ParseDouble(GrossBox, 1.0);
            o.BacktestConfig.InitialCapital = ParseDouble(CapitalBox, 10_000_000);
            o.PerformanceConfig.BenchmarkAnnual = ParseDouble(BenchmarkBox, 0.15);
            return o;
        }

        async void RunButton_Click(object sender, RoutedEventArgs e)
        {
            var o = GatherConfig();
            if ((o.Varieties == null ? Metadata.All.Count : o.Varieties.Count) < Math.Max(o.StrategyConfig.LongCount, o.StrategyConfig.ShortCount) + 1)
            {
                MessageBox.Show("品种数量不足：至少需要 " + (Math.Max(o.StrategyConfig.LongCount, o.StrategyConfig.ShortCount) + 1) + " 个品种。", "提示", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            RunButton.IsEnabled = false;
            ProgressBar.Value = 0;
            StatusText.Text = "准备中…";
            IProgress<(string step, double frac)> progress = new Progress<(string step, double frac)>(p =>
            {
                ProgressBar.Value = p.frac * 100;
                StatusText.Text = p.step + " (" + (int)(p.frac * 100) + "%)";
            });
            o.OnProgress = (s, f) => progress.Report((s, f));
            try
            {
                var result = await Task.Run(() => Pipeline.Run(o));
                ShowResult(result);
                StatusText.Text = "完成";
            }
            catch (Exception ex)
            {
                MessageBox.Show("运行失败：" + Environment.NewLine + ex.Message, "错误", MessageBoxButton.OK, MessageBoxImage.Error);
                StatusText.Text = "失败";
            }
            finally
            {
                RunButton.IsEnabled = true;
            }
        }

        void ShowResult(PipelineResult r)
        {
            var p = r.Performance;
            lastPerf = p;
            VerdictText.Text = p.Cmp.Verdict;
            VerdictText.Foreground = p.Cmp.Verdict == "跑赢" ? Good : p.Cmp.Verdict == "跑输" ? Bad : Amber;
            StrategyAnnualText.Text = p.Cmp.StrategyAnnual.ToString("P2");
            BenchmarkText.Text = p.Cmp.BenchmarkAnnual.ToString("P2");
            ExcessText.Text = (p.Cmp.Excess >= 0 ? "+" : "") + p.Cmp.Excess.ToString("P2");
            ExcessText.Foreground = p.Cmp.Excess >= 0 ? Good : Bad;
            BenchNoteText.Text = "基准为可配置常数（非纳指逐日曲线）。CTA 与纳指低相关，此基准用于「是否值得主动交易」的决策参照。";

            SetKpi(KpiReturn, p.M.AnnualizedReturn, "P2");
            SetKpi(KpiSharpe, p.M.Sharpe, "F3");
            SetKpi(KpiVol, p.M.Volatility, "P2");
            SetKpi(KpiMaxDD, -p.M.MaxDrawdown, "P2");
            SetKpi(KpiCalmar, p.M.Calmar, "F3");
            KpiWin.Text = p.M.WinRate.ToString("P2");
            KpiWin.Foreground = Text;

            SummaryText.Text = "品种 " + r.Ds.Codes.Count + " · 交易日 " + r.Ds.Dates.Count +
                " · 调仓 " + r.Strategy.RebalanceDates.Count + " 次 · 交易 " + r.Backtest.Summary.NTrades +
                " 笔 · 展期 " + r.Backtest.Summary.NRolls + " 次 · 总成本 " + r.Backtest.Summary.TotalCost.ToString("N0") +
                " · 期末权益 " + r.Backtest.Summary.FinalEquity.ToString("N0");

            DrawChart(p);
        }

        void SetKpi(TextBlock tb, double v, string fmt)
        {
            tb.Text = v.ToString(fmt);
            tb.Foreground = v > 0 ? Good : v < 0 ? Bad : Text;
        }

        void DrawChart(PerformanceResult p)
        {
            var c = ChartCanvas;
            c.Children.Clear();
            double w = c.ActualWidth, h = c.ActualHeight;
            if (w < 50 || h < 50) return;
            var nav = p.Nav;
            var benchNav = p.BenchmarkNav;
            int n = nav.Length;
            double lo = double.MaxValue, hi = double.MinValue;
            for (int i = 0; i < n; i++)
            {
                lo = Math.Min(lo, Math.Min(nav[i], benchNav[i]));
                hi = Math.Max(hi, Math.Max(nav[i], benchNav[i]));
            }
            double padL = 46, padR = 14, padT = 16, padB = 26;
            double pw = w - padL - padR, ph = h - padT - padB;
            if (pw <= 0 || ph <= 0) return;
            double X(int i) => padL + (n <= 1 ? 0 : (double)i / (n - 1) * pw);
            double Y(double v) => padT + (1 - (v - lo) / (hi - lo)) * ph;

            // gridlines
            for (int k = 0; k <= 4; k++)
            {
                double val = lo + (hi - lo) * k / 4;
                double yy = Y(val);
                var line = new Line { X1 = padL, X2 = w - padR, Y1 = yy, Y2 = yy, Stroke = new SolidColorBrush(Color.FromArgb(40, 120, 140, 170)), StrokeThickness = 1 };
                c.Children.Add(line);
                AddText(c, val.ToString("F2"), 4, yy - 7, padL - 6, Dim, 10, HorizontalAlignment.Right);
            }

            var eq = new Polyline { Stroke = Cyan, StrokeThickness = 1.7 };
            var bench = new Polyline { Stroke = Orange, StrokeThickness = 1.2, StrokeDashArray = new DoubleCollection { 4, 3 } };
            for (int i = 0; i < n; i++)
            {
                eq.Points.Add(new Point(X(i), Y(nav[i])));
                bench.Points.Add(new Point(X(i), Y(benchNav[i])));
            }
            c.Children.Add(eq);
            c.Children.Add(bench);

            // legend
            AddText(c, "策略净值", padL + 8, 6, null, Cyan, 12, HorizontalAlignment.Left, FontWeights.Bold);
            AddText(c, "基准复利 " + p.Cmp.BenchmarkAnnual.ToString("P0"), padL + 80, 6, null, Orange, 12, HorizontalAlignment.Left);
            // date range
            AddText(c, p.Dates.FirstOrDefault() + "  ~  " + p.Dates.LastOrDefault(), w - padR, h - 3, null, Dim, 10, HorizontalAlignment.Right);
        }

        void AddText(Canvas c, string text, double x, double y, double? right, Brush brush, double size, HorizontalAlignment align, FontWeight? weight = null)
        {
            var tb = new TextBlock { Text = text, Foreground = brush, FontSize = size };
            if (weight.HasValue) tb.FontWeight = weight.Value;
            c.Children.Add(tb);
            tb.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
            double tx = right.HasValue ? right.Value - tb.DesiredSize.Width : x;
            Canvas.SetLeft(tb, tx);
            Canvas.SetTop(tb, y);
        }
    }
}
