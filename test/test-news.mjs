// test-news.mjs — 新闻情绪因子与趋势预测（方案 A 新增）
import { NewsSentimentEngine, sentimentFactor } from '../src/core/factors/newsSentiment.js';
import { TrendPredictor } from '../src/core/trend/trendPredictor.js';

const H = 3600000;
const NOW = Date.parse('2026-08-14T12:00:00+08:00');

test('newsSentiment: 看多新闻 -> 正因子', () => {
  const items = [
    { ts: NOW - 1 * H, tags: ['RB'], sentiment: 0.8, label: 'bullish' },
    { ts: NOW - 2 * H, tags: ['RB'], sentiment: 0.6, label: 'bullish' },
  ];
  const r = sentimentFactor(items, 'RB', NOW, { lookbackHours: 4 });
  assertGt(r.factor, 0, 'bullish factor positive');
  assertClose(r.coverage, 2, 1e-9, 'coverage=2');
  assertClose(r.agreement, 1, 1e-9, 'agreement=1 (全看多)');
});

test('newsSentiment: 看空 -> 负因子', () => {
  const items = [{ ts: NOW - 1 * H, tags: ['AU'], sentiment: -0.7, label: 'bearish' }];
  const r = sentimentFactor(items, 'AU', NOW, { lookbackHours: 4 });
  assertLt(r.factor, 0, 'bearish factor negative');
});

test('newsSentiment: 无未来函数（未来新闻被排除）', () => {
  const items = [{ ts: NOW + 1 * H, tags: ['RB'], sentiment: 0.9, label: 'bullish' }];
  const r = sentimentFactor(items, 'RB', NOW, { lookbackHours: 4 });
  assert(r == null, 'future news -> null');
});

test('newsSentiment: 按品种 tag 过滤', () => {
  const items = [{ ts: NOW - 1 * H, tags: ['CU'], sentiment: 0.9, label: 'bullish' }];
  const r = sentimentFactor(items, 'RB', NOW, { lookbackHours: 4 });
  assert(r == null, '无 RB 新闻 -> null');
});

test('newsSentiment: 指数衰减让近期新闻主导', () => {
  const items = [
    { ts: NOW - 0.1 * H, tags: ['RB'], sentiment: 1, label: 'bullish' },
    { ts: NOW - 5 * H, tags: ['RB'], sentiment: -1, label: 'bearish' },
  ];
  const r = sentimentFactor(items, 'RB', NOW, { lookbackHours: 24, decayLambda: 2 });
  assertGt(r.factor, 0.5, '近期看多主导（快速衰减）');
});

test('NewsSentimentEngine.compute 与时间戳对齐', () => {
  const items = [
    { ts: '2026-08-14T09:30:00+08:00', tags: ['RB'], sentiment: 0.5, label: 'bullish' },
    { ts: '2026-08-14T10:00:00+08:00', tags: ['RB'], sentiment: -0.5, label: 'bearish' },
  ];
  const ts = ['2026-08-14T10:30:00+08:00', '2026-08-14T11:00:00+08:00'];
  const out = new NewsSentimentEngine().compute(items, ['RB'], ts, { lookbackHours: 4 });
  assert(out.RB.length === 2, '与时间戳等长');
  assert(out.RB[0] != null, 't0 有值');
});

test('TrendPredictor: 融合得分与方向', () => {
  const tp = new TrendPredictor();
  const sig = tp.predict(
    { RB: 0.8, CU: -0.9, AU: 0.1 },
    { RB: 0.6, CU: -0.4, AU: 0 },
    { wDaily: 1, wNews: 0.5, threshold: 0.3 }
  );
  const byCode = Object.fromEntries(sig.map((s) => [s.code, s]));
  assert(byCode.RB.direction === 1, 'RB 做多');
  assert(byCode.CU.direction === -1, 'CU 做空');
  assert(byCode.AU.direction === 0, 'AU 中性');
  assertClose(byCode.RB.score, 1 * 0.8 + 0.5 * 0.6, 1e-9, 'RB 得分 = 1*0.8+0.5*0.6');
});
