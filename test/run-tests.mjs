// run-tests.mjs — 极简无依赖测试运行器
const tests = [];
globalThis.test = (name, fn) => tests.push({ name, fn });
globalThis.assert = (cond, msg) => {
  if (!cond) {
    throw new Error(msg || 'assertion failed');
  }
};
globalThis.assertClose = (a, b, tol = 1e-9, msg = '') => {
  if (!(Math.abs(a - b) <= tol)) {
    throw new Error(`${msg} expected ${a} ~= ${b} (tol ${tol})`);
  }
};
globalThis.assertGt = (a, b, msg = '') => {
  if (!(a > b)) {
    throw new Error(`${msg} expected ${a} > ${b}`);
  }
};
globalThis.assertLt = (a, b, msg = '') => {
  if (!(a < b)) {
    throw new Error(`${msg} expected ${a} < ${b}`);
  }
};

await import('./test-data.mjs');
await import('./test-factors.mjs');
await import('./test-strategy.mjs');
await import('./test-backtest.mjs');
await import('./test-performance.mjs');
await import('./test-news.mjs');
await import('./test-research.mjs');

let pass = 0;
const fails = [];
for (const t of tests) {
  try {
    await t.fn();
    pass++;
    console.log(`  PASS  ${t.name}`);
  } catch (e) {
    fails.push({ name: t.name, err: e });
    console.log(`  FAIL  ${t.name} -> ${e.message}`);
  }
}
console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
