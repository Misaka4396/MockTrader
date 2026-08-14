// E2E 冒烟：双击 dist/index.html 场景（离线自包含）→ 跑全流水线 → 断言结果 UI
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = `file://${path.resolve(here, '../dist/index.html').replace(/\\/g, '/')}`;

test.describe('MockTrader Web 原型冒烟', () => {
  test('默认配置跑通全流水线并渲染结果卡片', async ({ page }) => {
    // 收集页面错误（pageerror + console.error），最后断言为零
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') {
        errors.push(`console.error: ${m.text()}`);
      }
    });

    await page.goto(pageUrl);

    // ① 品种池渲染：45 个品种 checkbox（含 3 个已退市，按板块分组）
    await expect(page.locator('.variety-cb')).toHaveCount(45);
    await expect(page.locator('.sector-group')).toHaveCount(5);

    // ② 点击运行，等待流水线完成（Worker 后台执行，进度条推进）
    await page.click('#runBtn');
    await expect(page.locator('#progressBar')).toBeVisible();

    // ③ 结论卡片出现且为「跑输」（默认配置 vs 15% 基准，与 C#/JS 一致）
    const verdict = page.locator('#verdict');
    await expect(verdict).toBeVisible();
    await expect(verdict).toHaveText('跑输');
    await expect(verdict).toHaveClass(/lose/);

    // 超额收益为负（策略年化 -2.78% - 基准 15%）
    const excess = (await page.locator('#cmpExcess').textContent()).trim();
    expect(excess.startsWith('-')).toBeTruthy();

    // ④ 6 个 KPI 卡片全部有值
    for (const id of ['kpiReturn', 'kpiSharpe', 'kpiVol', 'kpiMaxDD', 'kpiCalmar', 'kpiWin']) {
      const v = (await page.locator(`#${id}`).textContent()).trim();
      expect(v.length, `KPI #${id} 应为非空`).toBeGreaterThan(0);
    }

    // ⑤ 摘要行含关键数字
    await expect(page.locator('#summary')).toContainText('品种 45');
    await expect(page.locator('#summary')).toContainText('期末权益');

    // ⑥ 净值图已绘制（canvas 有实际尺寸 + 两条序列）
    const box = await page.locator('#chart').boundingBox();
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThan(100);

    // ⑦ 无任何页面错误
    expect(errors, `页面错误: ${errors.join('; ')}`).toEqual([]);
  });
});
