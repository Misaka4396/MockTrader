/**
 * reportGenerator.js — 模拟盘报告生成器（新功能）。
 * 每次回测/模拟结束后，自动汇总：绩效、基准对比、交易成本、风控、因子摘要、数据版本，输出 markdown + json。
 */
import { FACTOR_KEYS, FACTOR_NAMES } from '../types.js';
import { historicalVaR, expectedShortfall, maxDrawdown, stressTest } from '../risk/risk.js';
import { quantileReturns, icDecay, topTurnover } from '../research/factorAnalysis.js';

function pct(x, dp = 2) {
  return `${(x * 100).toFixed(dp)}%`;
}

/** 汇总报告所需的附加数据：风控 + 因子摘要 + 数据指纹 */
export function computeReportExtras(result, opts = {}) {
  const { ds, panel, performance } = result;
  const nav = performance.nav;
  const risk = {
    var95: historicalVaR(nav, 0.95),
    var99: historicalVaR(nav, 0.99),
    cvar95: expectedShortfall(nav, 0.95),
    maxDD: maxDrawdown(nav),
    stress: stressTest(nav, -0.1),
  };
  const factors = opts.factors || FACTOR_KEYS.slice();
  const factorRows = factors.map((f) => {
    const qr = quantileReturns(panel, ds, f, 5, 5);
    const ic = icDecay(panel, ds, f, [5]);
    const to = topTurnover(panel, f, 5);
    return {
      key: f,
      name: FACTOR_NAMES[f] || f,
      spread: qr.spread,
      ic5d: ic.length ? ic[0].ic : 0,
      turnover: to,
    };
  });
  const fingerprint = typeof ds.dataFingerprint === 'function' ? ds.dataFingerprint() : 'n/a';
  return { risk, factorRows, fingerprint };
}

/** 生成报告对象（含 markdown 文本与 json 数据） */
export function generateReport(result, opts = {}) {
  const { ds, strategy, backtest, performance } = result;
  const extras = computeReportExtras(result, opts);
  const m = performance.metrics;
  const cmp = performance.comparison;
  const bench = performance.benchmark;
  const s = backtest.summary;
  const cfg = strategy.config || {};
  const factors = (cfg.factors || FACTOR_KEYS).map((f) => FACTOR_NAMES[f] || f).join('+');
  const json = {
    ts: new Date().toISOString(),
    fingerprint: extras.fingerprint,
    nVarieties: ds.codes.length,
    dateRange: [ds.dates[0], ds.dates[ds.dates.length - 1]],
    configLabel: `${factors} · 多${cfg.longCount || 5}空${cfg.shortCount || 5} · ${cfg.weighting || 'equal'} · ${cfg.rebalance || 'monthly'}`,
    metrics: m,
    comparison: cmp,
    benchmark: bench,
    risk: extras.risk,
    factorRows: extras.factorRows,
    summary: s,
  };
  const markdown = buildMarkdown(json);
  return { markdown, json };
}

function buildMarkdown(j) {
  const L = [];
  L.push('# MockTrader 模拟盘报告');
  L.push('');
  L.push(`- 生成时间: ${j.ts}`);
  L.push(
    `- 数据版本: ${j.fingerprint}（${j.nVarieties} 品种 / ${j.dateRange[0]} ~ ${j.dateRange[1]}）`
  );
  L.push(`- 策略: ${j.configLabel}`);
  L.push('');
  L.push('## 一、绩效');
  L.push('');
  L.push('| 指标 | 值 |');
  L.push('|---|---|');
  L.push(`| 年化收益率 | ${pct(j.metrics.annualizedReturn)} |`);
  L.push(`| Sharpe | ${j.metrics.sharpe.toFixed(3)} |`);
  L.push(`| 波动率 | ${pct(j.metrics.volatility)} |`);
  L.push(`| 最大回撤 | ${pct(j.metrics.maxDrawdown)} |`);
  L.push(`| 卡玛比率 | ${j.metrics.calmar.toFixed(3)} |`);
  L.push(`| 胜率 | ${pct(j.metrics.winRate)} |`);
  L.push('');
  L.push('## 二、基准对比（纳指长线年化，默认 15%）');
  L.push('');
  L.push(
    `- 策略年化 ${pct(j.comparison.strategyAnnual)} vs 基准 ${pct(j.comparison.benchmarkAnnual)}`
  );
  L.push(`- 超额收益 ${j.comparison.excess >= 0 ? '+' : ''}${pct(j.comparison.excess)}`);
  L.push(`- 结论: **${j.comparison.verdict}**`);
  L.push('');
  L.push('## 三、交易与成本');
  L.push('');
  L.push(`- 交易 ${j.summary.nTrades} 笔 / 展期 ${j.summary.nRolls} 次`);
  L.push(
    `- 手续费+滑点 ${j.summary.totalCost.toFixed(0)} / 展期成本 ${j.summary.totalRollCost.toFixed(0)}`
  );
  L.push(
    `- 期末权益 ${j.summary.finalEquity.toFixed(0)}（初始 ${j.summary.initialCapital.toFixed(0)}）`
  );
  L.push('');
  L.push('## 四、风控');
  L.push('');
  L.push(
    `- 95% VaR: ${pct(j.risk.var95)} / 99% VaR: ${pct(j.risk.var99)} / 95% CVaR: ${pct(j.risk.cvar95)}`
  );
  L.push(
    `- 压力测试(-10% 冲击): 回撤 ${pct(j.risk.stress.maxDrawdownBefore)} -> ${pct(j.risk.stress.maxDrawdownAfter)}`
  );
  L.push('');
  L.push('## 五、因子摘要');
  L.push('');
  L.push('| 因子 | 多空价差 | IC(5d) | 换手 |');
  L.push('|---|---|---|---|');
  for (const r of j.factorRows) {
    L.push(`| ${r.name} | ${pct(r.spread)} | ${pct(r.ic5d)} | ${pct(r.turnover, 1)} |`);
  }
  L.push('');
  L.push('## 六、结论与免责');
  L.push('');
  L.push(`- 判定: ${j.comparison.verdict}（对 ${pct(j.comparison.benchmarkAnnual)} 基准）`);
  L.push('- 免责: 数据为确定性合成行情，仅用于验证算法正确性，不代表真实收益。');
  return L.join('\n');
}
