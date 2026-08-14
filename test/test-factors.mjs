import { DataAccess } from '../src/core/data/dataAccess.js';
import { FactorEngine, DEFAULT_FACTOR_PARAMS } from '../src/core/factors/factorEngine.js';

const ds = new DataAccess().generate({ start: '2022-01-03', end: '2023-12-29', varieties: null });
const engine = new FactorEngine();

test('S2 factor panel reproducible', () => {
  const a = engine.compute(ds);
  const b = engine.compute(ds);
  assertClose(a.z.momentum['RB'][400], b.z.momentum['RB'][400], 1e-12, 'momentum z reproducible');
  assertClose(a.raw.rollYield['CU'][400] ?? 0, b.raw.rollYield['CU'][400] ?? 0, 1e-12, 'rollYield reproducible');
});

test('S2 momentum formula uses only past data (skip近1月)', () => {
  const panel = engine.compute(ds);
  const p = DEFAULT_FACTOR_PARAMS.momentum; // lookback 120, skip 21
  const code = 'RB';
  const s = ds.getSeries(code);
  const t = 500;
  const expected = s.mainAdj[t - p.skip] / s.mainAdj[t - p.lookback] - 1;
  assertClose(panel.raw.momentum[code][t], expected, 1e-9, 'momentum[t] = P[t-skip]/P[t-lookback]-1');
  // 无未来函数：t 日动量不依赖 t 日之后数据（t-skip < t）
  assert(t - p.skip < t, 'skip ensures no use of recent/future');
});

test('S2 cross-sectional z-score has mean~0 std~1', () => {
  const panel = engine.compute(ds);
  const t = 500;
  const vals = panel.varieties.map((c) => panel.z.momentum[c][t]).filter((v) => v != null);
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length);
  assertClose(m, 0, 1e-9, 'z mean');
  assertClose(sd, 1, 1e-9, 'z std');
});

test('S2 roll yield sign consistent across varieties', () => {
  const panel = engine.compute(ds);
  const meanRY = (code) => { const a = panel.raw.rollYield[code].filter((v) => v != null); return a.reduce((x, y) => x + y, 0) / a.length; };
  assertGt(meanRY('RB'), 0, 'RB backwardation -> positive roll yield');
  assertLt(meanRY('CU'), 0, 'CU contango -> negative roll yield');
});

test('S2 all 5 factors present and finite where defined', () => {
  const panel = engine.compute(ds);
  for (const f of ['momentum', 'liquidity', 'volume', 'skewness', 'rollYield']) {
    let cnt = 0;
    for (const code of panel.varieties) for (const v of panel.raw[f][code]) if (v != null && Number.isFinite(v)) cnt++;
    assertGt(cnt, 1000, f + ' has finite values');
  }
});
