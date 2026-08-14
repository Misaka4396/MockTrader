// generate_report.mjs — 运行完整模拟盘并把报告保存到 reports/
import { runPipeline } from '../src/core/index.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const r = runPipeline({});
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(root, 'reports');
mkdirSync(outDir, { recursive: true });
const mdPath = join(outDir, `report_${ts}.md`);
const jsonPath = join(outDir, `report_${ts}.json`);
writeFileSync(mdPath, r.report.markdown, 'utf8');
writeFileSync(jsonPath, JSON.stringify(r.report.json, null, 2), 'utf8');
console.log('报告已保存:');
console.log(`  ${mdPath}`);
console.log(`  ${jsonPath}`);
