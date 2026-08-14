# MockTrader

**English** | [简体中文](README.zh.md)

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/Misaka4396/MockTrader/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933.svg)](package.json)
[![.NET](https://img.shields.io/badge/.NET-8.0-512BD4.svg)](cs/)
[![Test](https://img.shields.io/badge/test-21%20passed-brightgreen.svg)](test/)
[![CI](https://github.com/Misaka4396/MockTrader/actions/workflows/ci.yml/badge.svg)](https://github.com/Misaka4396/MockTrader/actions/workflows/ci.yml)

MockTrader is an open-source **commodity-futures long-short factor backtesting system** for the Chinese market — multi-contract **roll yields** + a **long-short portfolio** (Option B), benchmarked against Nasdaq long-term returns (single-value baseline).

It ships **three artifacts**: a portable **JS core**, a **self-contained Web prototype** (develop / verify / visualize), and a **native C# exe+dll** build (S8). Each C# dll's responsibility maps 1:1 to a JS module, and both implementations produce **bit-for-bit identical results** under the same deterministic seed (45 varieties · 782 days · 450 trades · final equity 9,164,404 · verdict "underperform").

> ⚠️ Data is deterministically seeded **synthetic market data for algorithm validation only — not real returns**.

## Features

| Layer | Description |
|-------|-------------|
| **S1 Data** | 45 varieties (ferrous / nonferrous / energy-chemical / agriculture / precious metals, incl. 3 delisted) with full metadata; deterministic multi-contract daily bars; main/sub continuous series; back-adjusted rolls via price-ratio method (**zero roll-jump**); 1.15 hysteresis against main-contract flapping |
| **S2 Factors** | 5-factor panel: 12-1 momentum / -Amihud liquidity / volume ratio / price skewness / roll yield; pure functions with **no look-ahead**; MAD winsorize + cross-sectional z-score |
| **S3 Strategy** | factor composite (equal / rolling-IC / custom weights), long 5 short 5, dollar-neutral, monthly/weekly rebalance with buffer band to cut turnover |
| **S4 Backtest** | daily mark-to-market, margin + 1.5x leverage cap, t+1 close execution (no look-ahead), two-sided commission + slippage, auto roll-over, delisting liquidation, blow-up protection |
| **S5 Performance** | annualized return / Sharpe / max drawdown / Calmar / volatility / win rate; configurable Nasdaq benchmark (15% default), verdict within ±2pp |
| **S6/S7 Web** | self-contained single-file HTML (offline double-click), Web Worker execution (UI never blocks), Canvas chart with zoom / pan / hover / drawdown shading |
| **S8 C# native** | `DataAccess.dll` + `StrategyCore.dll` + `MockTrader.exe` (WPF) three-layer exe+dll split, **bit-identical** to the JS core, fully buildable offline |

## Run

### Web prototype (no dependencies)

```sh
npm test                  # 21 unit tests (S1-S5 acceptance)
npm run lint              # ESLint quality check
npm run format            # Prettier formatting
node tools/persist.mjs    # persist local data files to data/
npm run build:web         # bundle dist/index.html
# double-click dist/index.html to run (offline self-contained)
node tools/smoke.mjs      # verify bundle == source + worker + HTML
```

### Native exe+dll (S8, requires .NET 8 runtime)

```sh
powershell -ExecutionPolicy Bypass -File cs\build.ps1   # output in release/
release\MockTrader.exe
```

| File | Size | Role |
|------|------|------|
| MockTrader.exe | ~140 KB | thin entry + WPF GUI (apphost floor) |
| StrategyCore.dll | ~29 KB | S2-S5 factors / strategy / backtest / performance |
| DataAccess.dll | ~25 KB | S1 data layer |

> Download the prebuilt artifacts from the [Releases](https://github.com/Misaka4396/MockTrader/releases) page.

## Verification

- **21/21 unit tests pass** (zero-dependency runner, S1-S5 acceptance).
- Default run (2022-01-03 ~ 2024-12-31): **45 varieties · 782 trading days · 450 trades · 245 rolls · final equity 9,164,404 · annualized -2.78% · verdict "underperform"** vs the 15% benchmark (excess -17.78pp).
- C# port is **bit-for-bit identical** to the JS core (same deterministic seed) — verified via `tools/smoke.mjs`.

## Project structure

```text
src/core/          portable core (S1-S5, pure ESM, Node-testable, browser-bundlable)
  index.js         public API barrel + runPipeline one-shot pipeline
  data/            S1: metadata / synthetic / roll / dataAccess
  factors/         S2: factorEngine
  strategy/        S3: strategyEngine
  backtest/        S4: backtestEngine
  performance/     S5: performanceEngine
src/web/           thin GUI (S6/S7): app.js / chart.js / worker.js / styles.css / template.html
cs/                S8 native C#: DataAccess / StrategyCore / MockTrader (WPF)
test/              21 unit tests (zero-dependency runner) + smoke scripts
tools/             build-web.mjs (bundler) / smoke.mjs / persist.mjs
docs/              design docs 01-08 (architecture / data schema / factors / strategy / accounting / metrics / benchmark-risk / exe-dll)
data/              persisted local data (manifest / metadata / continuous)
dist/              distributables: index.html (offline self-contained) + mocktrader.js (UMD)
release/           native exe+dll artifacts (distributed via Releases, not committed)
```

## Documentation

- [Architecture](docs/01_architecture.md) · [Data schema](docs/02_data_schema.md) · [Factor docs](docs/03_factor_docs.md) · [Strategy config](docs/04_strategy_config.md)
- [Backtest accounting](docs/05_backtest_accounting.md) · [Performance metrics](docs/06_performance_metrics.md) · [Benchmark & risk](docs/07_benchmark_and_risk.md) · [exe+dll notes](docs/08_exe_dll_notes.md)

## Contributing

Feel free to submit issues or pull requests. See [CHANGELOG.md](CHANGELOG.md) for release history.

## License

[MIT](LICENSE) © Misaka4396
