// Playwright E2E 配置：自包含 Web 原型（dist/index.html）冒烟
// - CI 使用标准 chromium（runner 上 npx playwright install --with-deps chromium）
// - 本机免下载可跑 msedge project（channel 使用系统 Edge）
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000, // 45 品种全量流水线 + 渲染
  expect: {
    timeout: 120_000,
  },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'msedge', use: { browserName: 'chromium', channel: 'msedge' } },
  ],
});
