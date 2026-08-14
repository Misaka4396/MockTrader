# MockTrader 规范符合性审计报告

> 审计对象：MockTrader v1.0.0（商品期货多空因子回测系统，JS 核心 + Web 原型 + C# 移植版）
> 审计日期：2026-08-14 · 审计标准：P1–P11 工程规范标准（编码规范 / Git 工作流 / Lint-Format / 文档 / Code Review / 开源治理 / 测试策略 / 单元 / 集成 / E2E / CI-CD）
> 审计方法：运行项目检查程序 + 全量静态扫描 + 逐项对照

---

## 一、检查程序运行结果（证据）

| 检查项 | 命令 | 结果 |
|---|---|---|
| 单元测试 | `npm test` | ✅ **21 passed / 0 failed**（S1-S5 全部验收） |
| 冒烟验证 | `node tools/smoke.mjs` | ✅ bundle 与源码逐位一致（年化 0.379531% vs 0.379531%）、worker OK、HTML 自包含 156KB |
| 端到端流水线 | `runPipeline` 默认配置 | ✅ 45 品种 / 782 日 / 450 笔 / 245 展期 / 期末权益 9,164,404 / 年化 -2.78% |
| 提交历史 | `git log --oneline` | ✅ 4 次提交全部 Conventional Commits 格式（`feat:` / `docs:` / `chore:`） |
| 分支结构 | `git branch -a` | ✅ trunk-based（仅 main + origin/main） |
| 语法健康 | 静态扫描 | ✅ 25 个 JS 文件 2,512 行、14 个 C# 文件 1,615 行，无 TODO/FIXME |

## 二、静态扫描发现（原始证据）

| 扫描项 | 数量 | 分布 |
|---|---|---|
| `var` 声明 | 31 处 | 全部在 `src/web/`（app.js 28 + worker.js 3），**核心零使用** |
| `console.*` | 41 处 | 全部在 `test/` 与 `tools/`（测试/工具输出，合理），**生产核心零使用** |
| 行宽 > 120 | 67 处 | 21 个文件；最多：synthetic.js(15)、backtestEngine.js(12)、test-backtest.mjs(5) |
| TODO/FIXME | 0 处 | — |
| C# public 字段（应属属性） | ≥12 处 | Metadata/Roll/Synthetic/BacktestConfig 等 |
| C# 魔法数字 | 多处 | Synthetic.cs 噪声系数（0.0006/0.0008/0.02…）、Roll 滞回 1.15 等 |

## 三、逐项审计结论

> 评级：🟢 符合 / 🟡 部分符合 / 🔴 不符合

### P1 编码规范 — 🟡 部分符合（B-）

| 子项 | 结论 | 证据 |
|---|---|---|
| 命名（变量/函数/类/常量） | 🟢 | JS 全程 camelCase 变量 + PascalCase 类 + UPPER_SNAKE 常量（`DEFAULT_BACKTEST_CONFIG`）；C# 同规 |
| 命名（C# 公共字段） | 🔴 | 12+ 处 `public` 可变字段（`Metadata.cs` 的 `Months/Ref`、`BacktestConfig` 配置）应为属性 |
| 代码风格（引号/分号/缩进） | 🟢 | 单引号 + 分号 + 2 空格缩进全局一致；ESM 仅命名导出、无 `export *` |
| 行宽 | 🟡 | 67 处超 120 字符（无工具约束，靠自觉） |
| 目录结构 | 🟢 | `src/core/{data,factors,strategy,backtest,performance}` 五层职责边界清晰，GUI 零业务逻辑 |
| 语言特性（TS 约束的 JS 适配） | 🟡 | 核心无 `var`（映射 no-var ✅）；web 层 31 处 `var`（ES5 风格，worker 内联字符串兼容理由，仍应消除）；prefer-const 大部分遵守 |
| 错误处理与日志 | 🟡 | worker/GUI 有 try-catch + 进度回调 ✅；但 GUI 数字解析失败**静默回退默认值**（无提示） |
| 安全基线 | 🟢 | 零外部输入（纯本地合成数据）、无敏感信息、零第三方依赖（无供应链面） |

> 对应 lint 落地建议：`no-var`、`prefer-const`、`max-len`(100)、`no-console`(生产)、`@typescript-eslint/no-inferrable-types`（C# 用 IDE 分析器）。

### P2 Git 提交与分支工作流 — 🟡 部分符合（B）

| 子项 | 结论 | 证据 |
|---|---|---|
| 提交信息（Conventional Commits） | 🟢 | 4/4 提交符合 `type: subject`；缺 scope/body/footer（信息量可更足） |
| 分支策略 | 🟢 | trunk-based 直推 main，**个人项目/单维护者场景的最优解**（无需 Git Flow） |
| 分支命名 / PR 流程 | — | 无功能分支需求（个人直推）；协作后需补 PR 模板 |
| commitlint + husky 强制 | 🔴 | 未配置（提交规范纯靠自觉） |

> 落地建议：`commitlint` + `@commitlint/config-conventional` + husky `commit-msg` hook；`feat(scope): subject` 格式。

### P3 Lint/Format 工具链 — 🔴 不符合（D）

| 子项 | 结论 |
|---|---|
| ESLint / Prettier / Stylelint 配置 | 🔴 无 `.eslintrc` / `.prettierrc` / `.editorconfig` |
| husky + lint-staged | 🔴 无 |
| 编辑器集成 / CI lint | 🔴 无 |

> 现状：代码风格靠作者自觉保持（实际相当一致），但**无任何机器强制**。这是本项目最大工程化缺口。

### P4 文档与注释规范 — 🟢 良好（A-）

| 子项 | 结论 | 证据 |
|---|---|---|
| 注释规范 | 🟢 | 核心文件头均有详细中文文档注释（职责/公式/约定）；无废话注释；TODO=0 |
| 内联文档 | 🟢 | JSDoc 风格 `/** */` 全覆盖关键函数（`runPipeline`/`backAdjustFactors`/`generateVariety`…） |
| README 标准结构 | 🟢 | **中英双版**（README.md + README.zh.md）+ 语言切换 + shields 徽章 + 目录 + 特性表 + 快速开始 + 结构 + License，超过模板标准 |
| API 文档生成 | 🟡 | 无 TypeDoc/OpenAPI；核心为纯函数 JS，注释已足可直接挂 JSDoc 生成器 |
| 开源附加 | 🟡 | LICENSE ✅；CONTRIBUTING.md / CODE_OF_CONDUCT 🔴 缺失 |

### P5 Code Review 规范 — 🔴 不符合（D）

| 子项 | 结论 |
|---|---|
| CR 流程 / 审查清单 / 评论分级 | 🔴 无（个人项目无协作场景） |
| 合并策略（approve / CI 门禁） | 🔴 直推 main，无门禁 |

> 说明：单维护者项目该规范适用性有限；若开放协作需补 PR 模板 + 至少 1 approve + CI 绿。

### P6 开源治理与发布 — 🟡 部分符合（C+）

| 子项 | 结论 | 证据 |
|---|---|---|
| LICENSE | 🟢 | MIT © Misaka4396 |
| CONTRIBUTING / CODE_OF_CONDUCT | 🔴 | 均缺失 |
| Issue/PR 模板 | 🔴 | 无 `.github/` 目录 |
| SemVer + CHANGELOG | 🟢 | v1.0.0 + `CHANGELOG.md`（Keep a Changelog 格式，1.0.0 全量条目） |
| 发布 | 🟢 | v1.0.0 Release 已发布（双附件：index.html + win-x64.zip），走 api 域不受墙影响 |
| 自动发布（semantic-release/Changesets） | 🔴 | 未配置（手动发布） |

### P7 测试策略与金字塔 — 🟡 部分符合（C+）

| 子项 | 结论 | 证据 |
|---|---|---|
| 金字塔比例 | 🟡 | 21 项单元测试（100% 单测）；**无集成/E2E 层**（数据为合成、无真实依赖，缺口部分由架构消解） |
| 分层职责 | 🟢 | S1 数据 / S2 因子 / S3 策略 / S4 回测 / S5 绩效 逐层独立测试文件 |
| 工具选型 | 🟡 | 零依赖自研运行器（24 行）——项目"零依赖"设计下合理，但非标准 Jest/Vitest，无过滤/覆盖率 |
| 数据策略 | 🟢 | 确定性种子 + `fakeDs` 手工构造（test-backtest），可复现 |
| 命名组织 | 🟢 | `test/test-{data,factors,strategy,backtest,performance}.mjs` 按层分文件；用例为描述性句子 |

### P8 单元测试规范 — 🟢 优秀（A-）

| 子项 | 结论 | 证据 |
|---|---|---|
| 命名语义 | 🟢 | `'S1 back-adjust removes roll jump exactly'` 等 Given-When-Then 语义化命名 |
| AAA 结构 | 🟢 | Arrange（fakeDs 构造）→ Act → Assert（1e-9/1e-6 精确容差） |
| 断言 | 🟢 | **逐位手算精确断言**（成本 9.1818、maxDD 0.1、跳空 1.02→0.01），非弱断言 |
| Mock 边界 | 🟢 | 仅手工构造数据替身，无过度 mock |
| 边界值/异常路径 | 🟢 | 退市强平、爆仓、杠杆上限、冷启动（warmup）、退市空洞全覆盖 |
| 确定性 | 🟢 | 合成种子全确定，无时间/随机依赖 |

### P9 集成测试规范 — 🟡 部分符合（C）

| 子项 | 结论 | 证据 |
|---|---|---|
| 模块间接口 | 🟢 | smoke-pipeline 端到端串联五引擎 + smoke-data 逐品种数据验证 |
| DB/外部服务 | — | 无真实依赖（纯内存合成），testcontainers 不适用 |
| 数据持久化回读 | 🟢 | `persist.mjs` 落盘 + `importSnapshot` 回读一致性验证 |
| 防 flaky | 🟢 | 全确定性，无异步竞争 |

### P10 E2E 测试规范 — 🔴 不符合（D+）

| 子项 | 结论 |
|---|---|
| 浏览器 E2E（Playwright/Cypress） | 🔴 无 |
| 选择器 / 等待策略 | — 无 |
| 核心路径验证 | 🟡 `tools/smoke.mjs` 用 `new Function('self', workerJs)` 模拟 worker 验证了核心运行路径（非真实浏览器） |

### P11 CI/CD 流水线与质量门禁 — 🔴 不符合（D）

| 子项 | 结论 |
|---|---|
| GitHub Actions 流水线 | 🔴 无 `.github/workflows/` |
| lint/测试/覆盖率门禁 | 🔴 无 |
| 失败通知 | 🔴 无 |
| 发布自动化 | 🔴 手动 `gh release create`（已成功发布 v1.0.0） |

## 四、总评与优先整改清单

**总体符合度 ≈ 62%**。项目在**测试质量（P8 A-）、文档（P4 A-）、架构与提交规范（P1/P2 核心部分）**上明显超出同类项目；缺口集中在**工程化基础设施**：lint 工具链、CI、开源治理模板、E2E。

| 优先级 | 整改项 | 对应规范 | 工作量 |
|---|---|---|---|
| **P0** | 落地 ESLint + Prettier + `.editorconfig` + husky/lint-staged + commitlint | P3/P2 | 半天 |
| **P0** | 建 GitHub Actions：`npm ci → lint → test → smoke`，push/PR 触发 | P11 | 1-2 小时 |
| **P1** | 补 CONTRIBUTING.md + CODE_OF_CONDUCT.md + Issue/PR 模板（.github/） | P6 | 1 小时 |
| **P1** | 消除 web 层 31 处 `var`（改 let/const 或打包期转换，注意 worker 内联兼容） | P1 | 1 小时 |
| **P2** | Prettier 格式化（自动修 67 处超长行） | P3 | 自动 |
| **P2** | C# 公共字段改属性 + 魔法数字收敛到配置常量 | P1 | 2 小时 |
| **P2** | 补 JSDoc → TypeDoc 生成 API 文档（可选） | P4 | 1 小时 |
| **P3** | Playwright 冒烟（打开 dist/index.html 跑一轮流水线断言结论卡片） | P10 | 2 小时 |

> 建议将 P0 两项作为 v1.1.0 里程碑，其余随迭代消化。

## 附录：P1–P11 评分汇总

| 编号 | 规范 | 评级 | 得分 |
|---|---|---|---|
| P1 | 编码规范 | 🟡 B- | 75 |
| P2 | Git 工作流 | 🟡 B | 78 |
| P3 | Lint/Format | 🔴 D | 30 |
| P4 | 文档注释 | 🟢 A- | 90 |
| P5 | Code Review | 🔴 D | 25 |
| P6 | 开源治理 | 🟡 C+ | 60 |
| P7 | 测试策略 | 🟡 C+ | 62 |
| P8 | 单元测试 | 🟢 A- | 90 |
| P9 | 集成测试 | 🟡 C | 55 |
| P10 | E2E | 🔴 D+ | 38 |
| P11 | CI/CD | 🔴 D | 30 |
| **合计** | | | **≈ 62/100** |
