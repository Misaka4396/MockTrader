// test-report.mjs — 模拟盘报告生成器测试
import { runPipeline } from '../src/core/index.js';

test('report: 报告含关键章节', () => {
  const r = runPipeline({
    varieties: ['RB', 'CU', 'M', 'AU', 'I', 'AL', 'FG', 'SC'],
    end: '2023-12-29',
  });
  const md = r.report.markdown;
  assert(md.includes('绩效'), '含绩效章节');
  assert(md.includes('基准对比'), '含基准对比章节');
  assert(md.includes('交易与成本'), '含交易成本章节');
  assert(md.includes('风控'), '含风控章节');
  assert(md.includes('因子摘要'), '含因子摘要章节');
  assert(md.includes('结论与免责'), '含结论章节');
  assert(md.includes('跑赢') || md.includes('跑输') || md.includes('接近'), '含判定结论');
});

test('report: json 含完整数据', () => {
  const r = runPipeline({
    varieties: ['RB', 'CU', 'M', 'AU', 'I', 'AL', 'FG', 'SC'],
    end: '2023-12-29',
  });
  const j = r.report.json;
  assert(j.metrics.annualizedReturn != null, '含指标');
  assert(j.comparison.verdict, '含判定');
  assert(j.risk.var95 != null, '含风控');
  assert(j.factorRows.length >= 5, '含 5 因子摘要');
  assert(j.fingerprint && j.fingerprint.length > 0, '含数据指纹');
});
