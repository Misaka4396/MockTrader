# MockTrader v1.3.0

🚀 v1.3.0 — **Phase 1-3：研究可信度 + 研究深度 + 实盘准备**（对标主流量化框架，见 docs/11 路线图）。

## 📦 发布物

- **mocktrader-web.html** — 离线自包含 Web 原型（`dist/index.html`）
- **MockTrader-win-x64.zip** — 原生 C# exe+dll（v1.3.0 重新编译，含冲击成本 + 回撤熔断镜像，需 [.NET 8 运行时](https://dotnet.microsoft.com/download/dotnet/8.0)）

## ✨ 新增（v1.3.0）

### Phase 1 · 研究可信度
- **样本外分割 + Walk-forward**（`tools/walkforward.mjs`）：70/30 分割 + IS 选参/OOS 冻结 + 参数稳健性网格
- **数据版本指纹**：`DataAccess.dataFingerprint()`，回测审计头（同数据同指纹）
- **多源交叉校验**：`py/verify_sources.py`（TQSDK vs AkShare 差异率校验）
- **冲击成本模型**（平方根，可选，默认关闭保持逐位一致）+ `tools/impact_check.mjs`
- **前视审计**：`tools/lookahead_audit.mjs`（扰动注入验证因子无信号前视）

### Phase 2 · 研究深度
- **alphalens 式因子流水线**：`src/core/research/factorAnalysis.js`（分层收益 / IC 序列与衰减 / 换手率 / 相关性矩阵 / Gram-Schmidt 正交化）+ `tools/factor_report.mjs`
- **风控**：`src/core/risk/risk.js`（历史 VaR / CVaR / 最大回撤 / 单日冲击压力测试）+ `tools/risk_report.mjs`
- **组合优化**：`src/core/portfolio/optimizer.js`（逆波动率 / 等风险贡献 ERC / 板块暴露上限）+ `tools/portfolio_demo.mjs`
- **因子注册表** `FACTOR_REGISTRY`（元数据配置化）+ **回撤熔断** `drawdownCutoff`（JS + C# 双实现镜像）

### Phase 3 · 实盘准备（部分）
- **前向纸面验证账本**：`src/core/research/paperLedger.js` + `tools/paper_trading.mjs`（记录→结算→命中率统计）
- **告警**：`py/alert.py`（钉钉 / 企业微信 webhook）
- **调度监控**：`py/monitor.py`（心跳 + 行情/新闻数据新鲜度，超 30min 未更新告警）
- **CTP 模拟盘骨架**：`py/ctp_paper.py`（vnpy/ctpbee 接入点）

## ✅ 验证

- **37/37 单元测试通过**（新增 9 项：因子分析×5、VaR/压力、组合、纸面账本、回撤熔断）
- Walk-forward（合成数据，框架校验）：**4/5 窗口 OOS Sharpe 为正**；前视审计 **PASS**
- 因子报告：rollYield 分层价差 +0.24%、IC 随 horizon 增强（0.6%→3.7%）、5 因子两两相关 ≈ 0、正交化后 |corr| < 0.01
- 风控：95% VaR 0.64% / 99% VaR 0.96% / CVaR 0.82% / 最大回撤 13.14%；熔断阈值 1% 触发 circuitBroken
- 冲击成本（系数 0.1）：总成本 36,908 → 117,080（增量 80,173）
- 纸面验证：3,942 笔预测、命中率 48.8%（合成随机游走数据 ≈ 抛硬币，符合预期；框架有效）
- 回归基线不变：45 品种 / 782 日 / 450 笔 / 期末权益 9,164,404 / 年化 -2.78%（新功能默认关闭保持逐位一致）
- CI 全绿（lint → format → commitlint → 37 测试 → build → smoke → E2E）

## ⚠️ 诚实声明

1. 以上 Walk-forward/因子/风控数字均为**合成数据框架校验**，证明度量工具正确，不代表真实市场有 alpha。
2. 冲击成本、回撤熔断默认关闭，保持与 v1.2.0 逐位一致；启用需自行验证参数。
3. CTP 为骨架（需 vnpy + 模拟盘账号）；前向账本需接真实信号后前向累计。
4. 真实数据路径仍受「新闻时间与回测区间不重叠」限制，历史 alpha 需付费新闻归档或前向验证。

## 📚 文档

- [路线图 docs/11](docs/11_roadmap.md) · [Phase 2 落地 docs/12](docs/12_phase2_research.md) · [Phase 3 落地 docs/13](docs/13_phase3_live.md)
- [更新建议 docs/11_upgrade_recommendations.md](docs/11_upgrade_recommendations.md)
