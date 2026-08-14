# MockTrader v1.1.0

🚀 v1.1.0 — 工程质量基线与工程化工具链全面落地（对应 P1-P11 规范审计整改）。

## 📦 发布物

- **mocktrader-web.html** — 离线自包含 Web 原型（`dist/index.html`，双击即用）
- **MockTrader-win-x64.zip** — 原生 C# exe+dll（v1.1.0 重新编译，需 [.NET 8 运行时](https://dotnet.microsoft.com/download/dotnet/8.0)）

## ✨ 新增

- **Lint/Format 工具链**：ESLint 9（flat config）+ Prettier 3 + .editorconfig，质量与格式职责分离
- **Git Hooks**：husky + lint-staged（提交前自动 lint+format）+ commitlint（Conventional Commits 强制）
- **CI 流水线**：GitHub Actions 八步门禁（lint → format → commitlint → 21 项单测 → build → smoke → **E2E**）
- **Playwright E2E 冒烟**：真实浏览器驱动 Web 原型，断言 45 品种渲染、结论卡片、6 项 KPI、零页面错误
- **API 文档**：TypeDoc 一键生成核心 API 文档（`npm run docs:api`）
- **开源治理**：CONTRIBUTING.md、CODE_OF_CONDUCT.md、Issue 模板（bug/feature）、PR 模板

## 🔧 改进

- **C# 移植版重构**：72 处 public 可变字段 → 自动属性；`Synthetic.cs` 噪声系数等 11 个魔法数字 → 命名常量；
  编译通过 + **数值一致性逐位不变**（期末权益 9,164,404 / 450 笔 / 245 展期 / 年化 -2.78% / 结论「跑输」）
- **消除 var**：`src/web/` 31 处 var → let/const，并修复 `worker` 未声明即使用的隐式全局缺陷
- 全量代码 Prettier 规范化 + 清理未使用导入；lint-staged 排除构建产物

## ✅ 验证

- 21/21 单元测试（S1-S5 验收）· ESLint 0 errors · Prettier 全绿 · smoke 逐位一致
- **CI 全绿**（含 headless Chromium E2E 实测）
- C# 版与 JS 核心同种子逐位一致

## ⚠️ 免责声明

数据为确定性种子合成的模拟行情，**不代表真实收益**，仅用于验证算法正确性。
