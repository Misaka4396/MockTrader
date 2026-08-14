# Phase 2 落地：研究深度（docs/12）

在 Phase 1（研究可信度）之上，补齐研究深度：alphalens 式因子流水线、因子相关性/正交化、因子注册表、
组合优化（JS 版风险平价/板块约束）、VaR/压力测试、回撤熔断。

## 新增模块

    src/core/research/factorAnalysis.js  分层收益 / IC 序列与衰减 / 换手 / 相关性矩阵 / 正交化(Gram-Schmidt)
    src/core/risk/risk.js                历史 VaR / CVaR / 最大回撤 / 单日冲击压力测试
    src/core/portfolio/optimizer.js      逆波动率 / 等风险贡献(ERC) / 板块暴露上限
    src/core/types.js                    FACTOR_REGISTRY 因子注册表（元数据配置化）
    src/core/backtest/backtestEngine.js  drawdownCutoff 回撤熔断（可选，默认关闭）

## 工具脚本

    tools/factor_report.mjs   因子研究报告（分层/IC衰减/换手/相关性/正交化）
    tools/risk_report.mjs     风控报告（VaR/CVaR/回撤/压力测试）
    tools/portfolio_demo.mjs  组合加权对比（等权 vs 逆波动率 vs 板块上限）

## 关键结果（合成数据，验证度量框架）

    - rollYield 分层价差 +0.24%、IC 随 horizon 增强（0.6% -> 3.7%），换手 13%
    - volume 换手 68%（高换手，成本敏感），liquidity 换手 2%（稳定）
    - 5 因子两两相关接近 0（合成数据天然低相关）；正交化后非对角 |corr| < 0.01
    - 风控：95% VaR 0.64%、99% VaR 0.96%、CVaR 0.82%、最大回撤 13.14%
    - 回撤熔断：drawdownCutoff=0.01 时触发 circuitBroken=true 并停止交易

## 验证

    - 36/36 单元测试（新增 8 项：分层/IC/换手/相关性/正交化/VaR/组合/熔断）
    - JS 与 C# 双实现保持同步（冲击模型 + 回撤熔断均已镜像）

## Phase 2 剩余项

    - cvxpy 真·组合优化（均值方差/风险平价含协方差）：JS 版为逆波动率/ERC 近似，
      需要精确协方差风险平价可接 Python cvxpy（py/optimize.py），JS 保持轻量。