# MockTrader

**English** | [简体中文](README.zh.md)

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](https://github.com/Misaka4396/MockTrader/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933.svg)](package.json)
[![.NET](https://img.shields.io/badge/.NET-8.0-512BD4.svg)](cs/)
[![Test](https://img.shields.io/badge/test-28%20passed-brightgreen.svg)](test/)
[![CI](https://github.com/Misaka4396/MockTrader/actions/workflows/ci.yml/badge.svg)](https://github.com/Misaka4396/MockTrader/actions/workflows/ci.yml)

MockTrader is an open-source **commodity-futures long-short factor backtesting system** for the Chinese market — multi-contract **roll yields** + a **long-short portfolio** (Option B), benchmarked against Nasdaq long-term returns (single-value baseline).

It ships **three artifacts**: a portable **JS core**, a **self-contained Web prototype** (develop / verify / visualize), and a **native C# exe+dll** build (S8). Each C# dll's responsibility maps 1:1 to a JS module, and both implementations produce **bit-for-bit identical results** under the same deterministic seed (45 varieties · 782 days · 450 trades · final equity 9,164,404 · verdict "underperform").

**v1.2.0 (Plan A)**: a Python data-collection layer (TQSDK / AkShare quotes, Sina / Jin10 / CLS news), a **news-sentiment factor** (exponential decay × agreement discount, no look-ahead), a **trend predictor** (daily factors + news sentiment → long/short/neutral), 30-minute in-session scheduling, and signal archiving — with live quotes & news displayed in both Web and WPF UIs.

> ⚠️ The backtest core defaults to deterministically seeded **synthetic data for algorithm validation only**. Real quotes/news are collected by `py/` scripts; news timestamps do not overlap the backtest window, so news alpha must be validated forward (paper-trading) before use.

## Features

| Layer | Description |
|-------|-------------|
| **S1 Data** | 45 varieties (ferrous / nonferrous / energy-chemical / agriculture / precious metals, incl. 3 delisted) with full metadata; multi-contract daily bars; main/sub continuous series; back-adjusted rolls via price-ratio method (**zero roll-jump**); 1.15 hysteresis against main-contract flapping |
| **S2 Factors** | 5-factor panel: 12-1 momentum / -Amihud liquidity / volume ratio / price skewness / roll yield; pure functions with **no look-ahead**; MAD winsorize + cross-sectional z-score |
| **S3 Strategy** | factor composite (equal / rolling-IC / custom weights), long 5 short 5, dollar-neutral, monthly/weekly rebalance with buffer band to cut turnover |
| **S4 Backtest** | daily mark-to-market, margin + 1.5x leverage cap, t+1 close execution (no look-ahead), two-sided commission + slippage, auto roll-over, delisting liquidation, blow-up protection |
| **S5 Performance** | annualized return / Sharpe / max drawdown / Calmar / volatility / win rate; configurable Nasdaq benchmark (15% default), verdict within ±2pp |
| **S6/S7 Web** | self-contained single-file HTML (offline double-click), Web Worker execution (UI never blocks), Canvas chart with zoom / pan / hover / drawdown shading |
| **S8 C# native** | `DataAccess.dll` + `StrategyCore.dll` + `MockTrader.exe` (WPF) three-layer exe+dll split, **bit-identical** to the JS core, fully buildable offline |
| **S9 News sentiment** | news-sentiment factor: exponential time-decay weighting × agreement discount, per-variety tag filtering, **no look-ahead**; same winsorize + z-score pipeline; mirrored in C# (`NewsSentiment.cs`) |
| **S10 Trend prediction** | `trendScore = wDaily·dailyZ + wNews·newsZ` (default 1 : 0.6, threshold 0.3) → long / short / neutral; rolling backtest in synthetic / real / both modes |
| **S11 Python layer** | quote collection (TQSDK full contracts, AkShare fallback), news collection (Sina 7×24 / Jin10 flash API / CLS telegraph), dictionary + optional LLM labeling, APScheduler 30-min in-session scheduling, signal archiving to JSONL |

## Run

### Web prototype (no dependencies)

```sh
npm test                  # 28 unit tests (S1-S5 + news/trend)
npm run lint              # ESLint quality check
npm run format            # Prettier formatting
npm run build:web         # bundle dist/index.html
# double-click dist/index.html to run (offline self-contained)
node tools/smoke.mjs      # verify bundle == source + worker + HTML
```

### Real data pipeline (v1.2.0, on a real machine)

```sh
pip install -r py/requirements.txt
# env: TQ_USER/TQ_PASSWORD (quotes), JIN10_*/CLS_* (news), LLM_* (labeling)
python py/collect_quotes.py    # quotes -> data/market/quotes.json
python py/collect_news.py      # news -> data/news/items.json
python py/sentiment.py         # dictionary + LLM labeling
node tools/predict.mjs         # trend signals -> data/signals/latest.json + history.jsonl
python py/scheduler.py         # long-running: quotes at 8:45, news->predict every 30min in session
node tools/rolling_backtest.mjs [synthetic|real|both]   # news-factor alpha validation
node tools/news_history.mjs    # sentiment history lookup
```

### Native exe+dll (S8, requires .NET 8 runtime)

```sh
powershell -ExecutionPolicy Bypass -File cs\build.ps1   # output in release/
release\MockTrader.exe
```

| File | Size | Role |
|------|------|------|
| MockTrader.exe | ~140 KB | thin entry + WPF GUI (apphost floor) |
| StrategyCore.dll | ~30-45 KB | S2-S5 + S9 news sentiment |
| DataAccess.dll | ~25-32 KB | S1 data layer |

> Download the prebuilt artifacts from the [Releases](https://github.com/Misaka4396/MockTrader/releases) page.

## Verification

- **28/28 unit tests pass** (zero-dependency runner: S1-S5 acceptance + 7 news/trend cases).
- Default run (2022-01-03 ~ 2024-12-31): **45 varieties · 782 trading days · 450 trades · 245 rolls · final equity 9,164,404 · annualized -2.78% · verdict "underperform"** vs the 15% benchmark (excess -17.78pp).
- News-factor rolling backtest (synthetic injected signal, framework check): **IC 59.79% · alpha +6.08pp · 8/9 windows beat baseline**; real mode correctly warns that news timestamps (2026-08+) do not overlap the backtest window (IC 0.00%).
- C# port is **bit-for-bit identical** to the JS core (same deterministic seed) — verified via `tools/smoke.mjs`.

## Project structure

```text
src/core/          portable core (pure ESM, Node-testable, browser-bundlable)
  index.js         public API barrel + runPipeline one-shot pipeline
  data/            S1: metadata / synthetic / roll / dataAccess (+ loadMarketData)
  factors/         S2: factorEngine · S9: newsSentiment
  strategy/        S3: strategyEngine
  backtest/        S4: backtestEngine
  performance/     S5: performanceEngine
  trend/           S10: trendPredictor
src/web/           thin GUI (S6/S7): app.js / chart.js / worker.js / styles.css / template.html
cs/                S8 native C#: DataAccess / StrategyCore (incl. NewsSentiment) / MockTrader (WPF)
py/                S11 Python layer: collect_quotes / collect_news / collect_jin10 / collect_cls / sentiment / scheduler
test/              28 unit tests (zero-dependency runner) + smoke scripts
tools/             build-web.mjs / smoke.mjs / persist.mjs / predict.mjs / rolling_backtest.mjs / news_history.mjs / demo_planA.mjs
docs/              design docs 01-10 (architecture / data schema / factors / strategy / accounting / metrics / benchmark-risk / exe-dll / upgrade proposals / plan A implementation)
data/              persisted data: manifest / metadata / continuous + market / news / signals (real data)
dist/              distributables: index.html (offline self-contained) + mocktrader.js (UMD)
release/           native exe+dll artifacts (distributed via Releases, not committed)
```

## Documentation

- [Architecture](docs/01_architecture.md) · [Data schema](docs/02_data_schema.md) · [Factor docs](docs/03_factor_docs.md) · [Strategy config](docs/04_strategy_config.md)
- [Backtest accounting](docs/05_backtest_accounting.md) · [Performance metrics](docs/06_performance_metrics.md) · [Benchmark & risk](docs/07_benchmark_and_risk.md) · [exe+dll notes](docs/08_exe_dll_notes.md)
- [Upgrade proposals](docs/09_upgrade_proposals.md) · [Plan A implementation](docs/10_planA_implementation.md)

## Contributing

Feel free to submit issues or pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © Misaka4396
