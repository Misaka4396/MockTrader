# MockTrader v1.3.1

📋 v1.3.1 — **模拟盘报告生成（S15）**：一键生成结构化研究报告，Web 与 WPF 双端可用。

## 📦 发布物

- **mocktrader-web.html** — 离线自包含 Web 原型（`dist/index.html`，含报告生成入口）
- **MockTrader-win-x64.zip** — 原生 C# exe+dll（v1.3.1 重新编译，含 `ReportGenerator.cs`，需 [.NET 8 运行时](https://dotnet.microsoft.com/download/dotnet/8.0)）

## ✨ 新增（v1.3.1）

- **模拟盘报告生成器**：`src/core/report/reportGenerator.js`（JS）+ `cs/StrategyCore/ReportGenerator.cs`（C# 镜像）
  - 六章节报告：**绩效 / 基准对比 / 交易与成本 / 风控（VaR·CVaR·压力测试）/ 因子摘要（分层价差·IC·换手）/ 结论与免责**
  - 输出 **Markdown + JSON** 双格式，含**数据版本指纹审计头**（数据/代码可追溯）
- **一键生成**：`node tools/generate_report.mjs` → `reports/report_*.{md,json}`
- **双端入口**：Web（app.js / template.html / worker.js）与 WPF（MainWindow）均可查看/生成报告
- 单元测试 37 → **39 项**（报告章节完整性、JSON 数据完整性）
- `docs/14_economic_analysis.md`：**策略多学派经济学分析**（奥地利学派 / 新古典 / 行为经济学三视角解读策略设计，核心结论：模拟跑输是"正确的零结果"，roll yield 是唯一正 IC 因子）

## ✅ 验证

- **39/39 单元测试通过**；报告生成实测输出六章节完整 Markdown + JSON
- 报告内容与全项目基线一致：45 品种 / 782 日 / 450 笔 / 245 展期 / 期末权益 9,164,404 / 年化 -2.78% / 95% VaR 0.64% / 结论「跑输」
- C# 编译 0 错误；smoke 打包逐位一致；E2E 通过；CI 全绿

## ⚠️ 诚实声明

报告数据基于确定性合成行情，仅用于验证算法正确性与报告框架；不代表真实收益。
