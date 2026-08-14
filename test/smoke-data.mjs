import { DataAccess, parseContractCode } from '../src/core/data/dataAccess.js';

const da = new DataAccess();
da.generate({
  start: '2022-01-03',
  end: '2023-12-29',
  varieties: ['RB', 'CU', 'M', 'AU', 'RS', 'WR', 'BB'],
});

console.log('dates:', da.dates.length, 'codes:', da.codes.join(','));
for (const code of da.codes) {
  const s = da.getSeries(code);
  const nMain = s.mainRaw.filter((x) => x != null).length;
  const nSub = s.subRaw.filter((x) => x != null).length;
  const rolls = s.rolls.length;
  const jump = da.getMaxJump(code);
  const nContracts = da.getContracts(code).length;
  const meta = da.getMeta(code);
  console.log(`${code} ${meta.name} [${meta.sector}]`, {
    contracts: nContracts,
    mainBars: nMain,
    subBars: nSub,
    rolls,
    maxJump: jump.toFixed(6),
    mult: meta.mult,
    margin: meta.margin,
    tickValue: meta.tickValue,
    list: meta.list,
    delist: meta.delist || 'active',
  });
}

// spot check: roll yield sign vs carry for a backwardated variety (RB carryMean<0 -> rollYield>0)
const rb = da.getSeries('RB');
let acc = 0,
  n = 0;
for (let t = 0; t < rb.dates.length; t++) {
  if (
    rb.mainRaw[t] != null &&
    rb.subRaw[t] != null &&
    rb.mainCode[rb.dates[t]] &&
    rb.subCode[rb.dates[t]]
  ) {
    const mc = parseContractCode('RB', rb.mainCode[rb.dates[t]]);
    const sc = parseContractCode('RB', rb.subCode[rb.dates[t]]);
    const dt = Math.abs((Date.parse(sc.delivery) - Date.parse(mc.delivery)) / 86400000);
    if (dt > 0) {
      acc += ((rb.mainRaw[t] - rb.subRaw[t]) / rb.subRaw[t]) * (365 / dt);
      n++;
    }
  }
}
console.log(
  'RB avg annualized rollYield:',
  (acc / n).toFixed(4),
  ' (expect >0 since carryMean<0/backwardation)'
);

// back-adjust no-jump verification on raw vs adj
const cu = da.getSeries('CU');
let maxRaw = 0,
  maxAdj = 0;
for (let t = 1; t < cu.dates.length; t++) {
  if (cu.mainRaw[t] != null && cu.mainRaw[t - 1] != null && cu.mainRaw[t - 1] > 0) {
    maxRaw = Math.max(maxRaw, Math.abs(Math.log(cu.mainRaw[t] / cu.mainRaw[t - 1])));
  }
  if (cu.mainAdj[t] != null && cu.mainAdj[t - 1] != null && cu.mainAdj[t - 1] > 0) {
    maxAdj = Math.max(maxAdj, Math.abs(Math.log(cu.mainAdj[t] / cu.mainAdj[t - 1])));
  }
}
console.log('CU max |log-ret| raw:', maxRaw.toFixed(5), ' adj:', maxAdj.toFixed(5));
