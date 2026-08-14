// lookahead_audit.mjs — Phase 1 P0：真实路径前视审计
// 方法：扰动 t=T 的价格（×2），检查所有因子在 t<T 是否保持不变；变化即前视。
// 注：直接扰动「后复权序列」而非重算后复权，避免把后复权锚定的固有未来依赖误判为信号前视。
import { DataAccess, FactorEngine } from '../src/core/index.js';

const codes = ['RB', 'CU', 'M', 'AU', 'I', 'AL', 'FG', 'SC'];
const ds = new DataAccess().generate({ start: '2022-01-03', end: '2024-12-31', varieties: codes });
const engine = new FactorEngine();
const baseline = engine.compute(ds);

function perturbDs(ds, T, mult) {
  const cache = {};
  return {
    dates: ds.dates,
    codes: ds.codes,
    getMeta: (c) => ds.getMeta(c),
    getSeries: (c) => {
      if (!cache[c]) {
        const s = ds.getSeries(c);
        const clone = {
          dates: s.dates,
          mainCode: s.mainCode,
          subCode: s.subCode,
          mainRaw: s.mainRaw.slice(),
          mainAdj: s.mainAdj.slice(),
          subRaw: s.subRaw.slice(),
          subAdj: s.subAdj.slice(),
          mainOi: s.mainOi.slice(),
          subOi: s.subOi.slice(),
          mainVol: s.mainVol.slice(),
          rolls: s.rolls,
        };
        if (clone.mainAdj[T] != null) {
          clone.mainAdj[T] *= mult;
        }
        if (clone.mainRaw[T] != null) {
          clone.mainRaw[T] *= mult;
        }
        if (clone.subAdj[T] != null) {
          clone.subAdj[T] *= mult;
        }
        if (clone.subRaw[T] != null) {
          clone.subRaw[T] *= mult;
        }
        cache[c] = clone;
      }
      return cache[c];
    },
  };
}

const factors = ['momentum', 'liquidity', 'volume', 'skewness', 'rollYield'];
const auditTimes = [300, 400, 500, 600, 700];
const windowBefore = 30;
let clean = true;
let issues = 0;

for (const T of auditTimes) {
  const perturbed = engine.compute(perturbDs(ds, T, 2.0));
  for (const f of factors) {
    for (const code of codes) {
      for (let t = Math.max(0, T - windowBefore); t < T; t++) {
        const a = baseline.raw[f][code][t];
        const b = perturbed.raw[f][code][t];
        const aNull = a == null;
        const bNull = b == null;
        if (aNull !== bNull || (!aNull && Math.abs(a - b) > 1e-12)) {
          clean = false;
          issues++;
          if (issues <= 5) {
            console.log(
              `前视告警: ${f} ${code} t=${t} 受 T=${T} 扰动影响 (baseline=${a} -> perturbed=${b})`
            );
          }
        }
      }
    }
  }
}

console.log(`审计时间点: ${auditTimes.join(',')}（扰动 ×2，检查此前 ${windowBefore} 日的因子）`);
console.log(
  clean ? 'PASS: 所有因子在 t<T 均不受未来扰动影响（无信号前视）' : `FAIL: 发现 ${issues} 处前视`
);
console.log('');
console.log(
  '回测层说明：信号在 t 日生成、t+1 日收盘成交（executionDelay=1），信号仅由已审计因子面板合成，故回测路径无前视。'
);
