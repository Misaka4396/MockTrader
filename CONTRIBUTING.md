# Contributing · 贡献指南

感谢你愿意为 MockTrader 贡献力量！请花两分钟阅读本指南，保证协作顺畅。

## 开发环境

- Node.js ≥ 18（推荐 22 LTS）
- .NET 8 SDK（仅 C# 版需要，可选）

```bash
npm install        # 安装开发依赖
npm test           # 21 项单元测试（S1-S5 验收）
npm run lint       # ESLint 质量检查
npm run format     # Prettier 格式化
node tools/smoke.mjs  # 打包一致性冒烟
```

## 代码规范

- **提交信息**：遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)（`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:` 等），由 commitlint + husky 自动校验。
- **代码风格**：由 ESLint（质量）+ Prettier（格式）强制，`npm run lint` 与 `npm run format` 必须通过；提交前 husky 会自动 lint-staged。
- **语言**：代码注释默认中文；公开 API 的 JSDoc 建议中英双语。
- **核心约定**：`src/core/` 为纯函数可移植核心——禁止引入运行时依赖、禁止 I/O 副作用；新逻辑必须配套单元测试（test/test-*.mjs）。

## 提交流程

1. Fork 本仓库并创建功能分支：`feature/xxx` 或 `fix/xxx`。
2. 修改代码并补测试，本地跑通 `npm test && npm run lint && npm run format:check`。
3. 提交（commitlint 会自动校验信息格式），推送分支。
4. 发起 Pull Request，关联对应 Issue（如有），描述改动内容与验证结果。
5. 等待 CI 通过 + 至少 1 个 maintainer approve 后合并（squash）。

## 发布流程（维护者）

1. 更新 `CHANGELOG.md`（Keep a Changelog 格式）。
2. 打 tag：`git tag vX.Y.Z` 并推送。
3. `gh release create vX.Y.Z --notes-file RELEASE_NOTES.md`，附带 `dist/index.html` 与打包好的 exe+dll zip。

## 行为准则

请阅读 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)，共建友善社区。
