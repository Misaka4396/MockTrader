/* app.js — 主窗口 UI（S6：薄 GUI，只调核心，不写业务逻辑）+ MVVM 式数据绑定（手动）。 */
(function () {
  'use strict';
  var MT = globalThis.MockTrader;
  var chart = null;
  var WORKER_SOURCE = __WORKER_SOURCE__;

  function $(id) { return document.getElementById(id); }
  function pct(x, dp) { return (x * 100).toFixed(dp == null ? 2 : dp) + '%'; }
  function num(x, dp) { return Number(x).toLocaleString('zh-CN', { minimumFractionDigits: dp == null ? 2 : dp, maximumFractionDigits: dp == null ? 2 : dp }); }

  // ---- 品种多选（按板块分组） ----
  function buildVarietyPicker() {
    var container = $('varietyPicker');
    container.innerHTML = '';
    MT.SECTORS.forEach(function (sector) {
      var metas = MT.BY_SECTOR[sector] || [];
      if (!metas.length) return;
      var group = document.createElement('div');
      group.className = 'sector-group';
      var title = document.createElement('div');
      title.className = 'sector-title';
      title.textContent = sector + ' (' + metas.length + ')';
      title.onclick = (function (sec) { return function () { toggleSector(sec); }; })(sector);
      group.appendChild(title);
      var grid = document.createElement('div');
      grid.className = 'variety-grid';
      metas.forEach(function (m) {
        var lab = document.createElement('label');
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.value = m.code; cb.checked = true; cb.className = 'variety-cb';
        cb.dataset.sector = sector;
        if (m.delist) cb.title = '已退市 ' + m.delist;
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(m.code + ' ' + m.name));
        grid.appendChild(lab);
      });
      group.appendChild(grid);
      container.appendChild(group);
    });
  }

  function toggleSector(sector) {
    var cbs = document.querySelectorAll('.variety-cb[data-sector="' + sector + '"]');
    var allOn = true;
    cbs.forEach(function (cb) { if (!cb.checked) allOn = false; });
    cbs.forEach(function (cb) { cb.checked = !allOn; });
  }

  function selectedVarieties() {
    var cbs = Array.prototype.slice.call(document.querySelectorAll('.variety-cb'));
    var checked = cbs.filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; });
    var total = cbs.length;
    if (checked.length === total) return null; // 全选 -> 全品种池
    return checked;
  }

  // ---- 收集配置 ----
  function gatherConfig() {
    var mode = $('strategy').value;
    var factors = mode === 'all' ? MT.FACTOR_KEYS.slice() : [mode];
    var rebalance = $('rebalance').value;
    return {
      varieties: selectedVarieties(),
      factorParams: {},
      strategyConfig: {
        factors: factors,
        longCount: Number($('longCount').value) || 5,
        shortCount: Number($('shortCount').value) || 5,
        weighting: $('weighting').value,
        combine: $('combine').value,
        rebalance: rebalance,
        rebalanceDays: rebalance === 'weekly' ? 5 : 21,
        grossExposure: Number($('grossExposure').value) || 1.0,
        neutral: true,
        mode: 'longShort',
      },
      backtestConfig: {
        initialCapital: Number($('initialCapital').value) || 10000000,
        commissionRate: Number($('commissionRate').value) || 0.0002,
        slippageTicks: Number($('slippageTicks').value) || 1,
        executionDelay: 1,
        maxLeverage: 1.5,
      },
      perfConfig: {
        benchmarkAnnual: Number($('benchmark').value) || 0.15,
      },
    };
  }

  // ---- 运行 ----
  function run() {
    var btn = $('runBtn');
    btn.disabled = true;
    $('errorBox').style.display = 'none';
    setProgress(0, '准备中…');
    var config = gatherConfig();
    if (worker) { worker.terminate(); }
    worker = new Worker(URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' })));
    worker.onmessage = function (e) {
      var msg = e.data;
      if (msg.type === 'progress') setProgress(msg.frac, msg.step);
      else if (msg.type === 'result') { setProgress(1, '完成'); btn.disabled = false; render(msg.result); }
      else if (msg.type === 'error') { btn.disabled = false; showError(msg.message); }
    };
    worker.onerror = function (e) { btn.disabled = false; showError(e.message || 'Worker error'); };
    worker.postMessage({ config: config });
  }

  function setProgress(frac, step) {
    $('progressBar').style.width = (frac * 100).toFixed(1) + '%';
    $('progressLabel').textContent = step + ' (' + (frac * 100).toFixed(0) + '%)';
  }

  function showError(msg) {
    var box = $('errorBox');
    box.style.display = 'block';
    box.textContent = '运行失败：' + msg;
  }

  // ---- 渲染结果 ----
  function render(result) {
    var perf = result.performance;
    var cmp = perf.comparison;
    var met = perf.metrics;
    var bench = perf.benchmark;

    // 结论卡片
    var verdictEl = $('verdict');
    verdictEl.textContent = cmp.verdict;
    verdictEl.className = 'verdict ' + (cmp.verdict === '跑赢' ? 'beat' : cmp.verdict === '跑输' ? 'lose' : 'close');
    $('cmpStrategy').textContent = pct(cmp.strategyAnnual);
    $('cmpBenchmark').textContent = pct(cmp.benchmarkAnnual);
    $('cmpExcess').textContent = (cmp.excess >= 0 ? '+' : '') + pct(cmp.excess);
    $('cmpExcess').style.color = cmp.excess >= 0 ? 'var(--good)' : 'var(--bad)';
    $('benchNote').textContent = bench.note || '';

    // KPI
    setKpi('kpiReturn', met.annualizedReturn, true);
    setKpi('kpiSharpe', met.sharpe, false);
    setKpi('kpiVol', met.volatility, false);
    setKpi('kpiMaxDD', -met.maxDrawdown, false);
    setKpi('kpiCalmar', met.calmar, false);
    setKpi('kpiWin', met.winRate, false, true);

    // 摘要
    $('summary').textContent =
      '品种 ' + result.summary.nVarieties + ' · 交易日 ' + result.summary.nDates +
      ' · 调仓 ' + result.summary.nRebalances + ' 次 · 交易 ' + result.summary.nTrades +
      ' 笔 · 展期 ' + result.summary.nRolls + ' 次 · 总成本 ' + num(result.summary.totalCost, 0) +
      ' · 期末权益 ' + num(result.summary.finalEquity, 0);

    // 图表
    chart.setData(perf.dates, [
      { name: '策略净值', values: perf.nav, color: '#00f0ff', width: 1.6, dashed: false },
      { name: '基准复利 ' + pct(bench.annual), values: perf.benchmarkNav, color: '#ffb020', width: 1.2, dashed: true },
    ]);
    $('benchToggle').checked = true;
    $('ddToggle').checked = false;
    chart.setVisible('策略净值', true);
  }

  function setKpi(id, value, isPct, isWin) {
    var el = $(id);
    if (isWin) { el.textContent = pct(value); el.className = 'v'; return; }
    el.textContent = isPct ? pct(value) : Number(value).toFixed(2);
    el.className = 'v ' + (value > 0 ? 'pos' : value < 0 ? 'neg' : '');
  }

  // ---- 初始化 ----
  function init() {
    buildVarietyPicker();
    chart = new LineChart($('chart'));

    $('runBtn').onclick = run;
    $('selectAll').onclick = function () { document.querySelectorAll('.variety-cb').forEach(function (cb) { cb.checked = true; }); };
    $('selectNone').onclick = function () { document.querySelectorAll('.variety-cb').forEach(function (cb) { cb.checked = false; }); };

    document.querySelectorAll('.range-btn').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('.range-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        chart.setRange(b.dataset.range);
      };
    });
    $('benchToggle').onchange = function (e) { chart.setVisible(chart.series.find(function (s) { return s.name.indexOf('基准') === 0; }).name, e.target.checked); };
    $('ddToggle').onchange = function (e) { chart.setDrawdown(e.target.checked); };

    // 默认给一条占位说明
    chart.setData([], []);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
