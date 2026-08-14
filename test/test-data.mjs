import { DataAccess, parseContractCode } from '../src/core/data/dataAccess.js';
import { buildMainSub, backAdjustFactors, buildIndex } from '../src/core/data/roll.js';
import { METADATA_BY_CODE } from '../src/core/data/metadata.js';
import { SIM_OVERRIDES } from '../src/core/data/synthetic.js';

// ---- 展期复权：消除跳空（手工构造，精确验证） ----
test('S1 back-adjust removes roll jump exactly', () => {
  const contracts = {
    A: [
      { date: 'd0', close: 100, openInterest: 20, volume: 10 },
      { date: 'd1', close: 101, openInterest: 10, volume: 10 },
    ],
    B: [
      { date: 'd0', close: 200, openInterest: 15, volume: 20 },
      { date: 'd1', close: 202, openInterest: 25, volume: 20 },
    ],
  };
  const dates = ['d0', 'd1'];
  const { mainByDate } = buildMainSub(dates, contracts);
  assert(mainByDate.d0 === 'A', `main d0 should be A, got ${mainByDate.d0}`);
  assert(mainByDate.d1 === 'B', `main d1 should be B, got ${mainByDate.d1}`);
  const idx = buildIndex(contracts);
  const getClose = (c, d) => idx[c].get(d).close;
  const factors = backAdjustFactors(dates, mainByDate, getClose);
  const raw = [getClose('A', 'd0'), getClose('B', 'd1')];
  const adj = [getClose('A', 'd0') * factors[0], getClose('B', 'd1') * factors[1]];
  // 原始序列跳空 (202/100 - 1 = 102%)
  assertClose(raw[1] / raw[0] - 1, 1.02, 1e-9, 'raw jump');
  // 后复权序列无跳空：收益等于 B 合约自身日收益 1%
  assertClose(adj[0], 200, 1e-6, 'adj d0');
  assertClose(adj[1], 202, 1e-9, 'adj d1');
  assertClose(adj[1] / adj[0] - 1, 0.01, 1e-6, 'adj return = B daily return');
});

// ---- 可复现性 ----
test('S1 data reproducible (same seed => identical bars)', () => {
  const a = new DataAccess().generate({
    start: '2022-01-03',
    end: '2023-12-29',
    varieties: ['RB', 'CU'],
  });
  const b = new DataAccess().generate({
    start: '2022-01-03',
    end: '2023-12-29',
    varieties: ['RB', 'CU'],
  });
  const sa = a.getSeries('RB');
  const sb = b.getSeries('RB');
  for (let t = 0; t < sa.dates.length; t += 13) {
    assertClose(sa.mainAdj[t] ?? 0, sb.mainAdj[t] ?? 0, 1e-9, `mainAdj@${t}`);
  }
  assertClose(
    a.getBars('CU', 'CU2303')[10].close,
    b.getBars('CU', 'CU2303')[10].close,
    1e-9,
    'bar close'
  );
});

// ---- 主力/次主力/各月合约可查 ----
test('S1 main/sub/monthly contracts queryable', () => {
  const da = new DataAccess().generate({
    start: '2022-01-03',
    end: '2022-12-30',
    varieties: ['RB', 'M'],
  });
  const rb = da.getSeries('RB');
  assert(
    rb.mainRaw.some((x) => x != null),
    'RB main present'
  );
  assert(
    rb.subRaw.some((x) => x != null),
    'RB sub present'
  );
  const codes = da.getContracts('RB');
  assert(codes.length > 20, 'RB has many monthly contracts');
  assert(
    codes.every((c) => c.startsWith('RB')),
    'contract codes prefixed'
  );
  assert(da.getBars('RB', codes[0]).length > 0, 'bars available');
  // 主力切换后换月：rolls 非空且 from != to
  const rolls = da.getRolls('RB');
  assert(rolls.length > 0, 'RB has roll events');
  for (const r of rolls) {
    assert(r.from !== r.to, 'roll changes contract');
  }
});

// ---- 已退市品种保留 ----
test('S1 delisted varieties retained in metadata + partial data', () => {
  assert(METADATA_BY_CODE['RS'], 'RS retained');
  assert(METADATA_BY_CODE['RS'].delist === '2021-06-30', 'RS delist date');
  const da = new DataAccess().generate({
    start: '2022-01-03',
    end: '2023-12-29',
    varieties: ['RS', 'BB', 'WR', 'RB'],
  });
  const rs = da.getSeries('RS');
  assert(
    rs.mainRaw.every((x) => x == null),
    'RS has no data after delist (2021)'
  );
  const bb = da.getSeries('BB');
  const hasData = bb.mainRaw.some((x) => x != null);
  const hasGap = bb.mainRaw.some((x, i) => x != null && bb.mainRaw[i + 1] == null);
  assert(hasData, 'BB has data before delist');
  assert(hasGap, 'BB data ends after delist');
});

// ---- 展期收益率符号与升贴水一致 ----
test('S1 roll yield sign matches carry (backwardation>0, contango<0)', () => {
  const da = new DataAccess().generate({
    start: '2022-01-03',
    end: '2023-12-29',
    varieties: ['RB', 'CU', 'AU', 'M', 'FG'],
  });
  const rollYieldMean = (code) => {
    const s = da.getSeries(code);
    let acc = 0,
      n = 0;
    for (let t = 0; t < s.dates.length; t++) {
      if (s.mainRaw[t] != null && s.subRaw[t] != null && s.subRaw[t] > 0) {
        const mc = s.mainCode[s.dates[t]];
        const sc = s.subCode[s.dates[t]];
        if (!mc || !sc) {
          continue;
        }
        const dm = Date.parse(parseContractCode(code, mc).delivery);
        const ds2 = Date.parse(parseContractCode(code, sc).delivery);
        const dt = Math.abs((ds2 - dm) / 86400000);
        if (dt > 0) {
          acc += ((s.mainRaw[t] - s.subRaw[t]) / s.subRaw[t]) * (365 / dt);
          n++;
        }
      }
    }
    return acc / n;
  };
  // carryMean<0 -> backwardation -> roll yield > 0
  for (const code of ['RB', 'M', 'FG']) {
    const c = SIM_OVERRIDES[code]?.carryMean ?? 0;
    if (c < 0) {
      assertGt(rollYieldMean(code), 0, `${code} roll yield >0 (backwardation)`);
    }
  }
  // carryMean>0 -> contango -> roll yield < 0
  for (const code of ['CU', 'AU']) {
    const c = SIM_OVERRIDES[code]?.carryMean ?? 0;
    if (c > 0) {
      assertLt(rollYieldMean(code), 0, `${code} roll yield <0 (contango)`);
    }
  }
});
