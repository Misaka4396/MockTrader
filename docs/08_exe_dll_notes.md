# S8 exe+dll layering & packaging (docs/08)

## Artifacts

    MockTrader.exe    thin entry (WPF GUI, ~140KB) - variety multi-select, strategy/params, run, results + chart
    MockTrader.dll    WPF UI code (~25KB)
    StrategyCore.dll  core logic (~29KB): 5 factors / strategy / backtest / performance (S2-S5)
    DataAccess.dll    data layer (~25KB): metadata / synthetic / roll adjust / access (S1)

## Sizes (framework-dependent, x64 Release)

    MockTrader.exe    ~140 KB   .NET apphost (the exe floor)
    MockTrader.dll    ~25 KB    WPF UI (view + code-behind)
    StrategyCore.dll  ~29 KB    factor/backtest/perf
    DataAccess.dll    ~25 KB    data layer
    *.json            ~2 KB     runtime config

    Total ~210 KB (excl. .pdb). Self-contained single-file exe is ~10-30 MB by comparison.

## Meaning of 'exe+dll shrinks the exe'

exe+dll layering shrinks the EXE SINGLE-FILE size: the thin exe keeps only entry + UI orchestration,
business logic lives in dlls, loaded on demand, and the framework is shared (framework-dependent).
Total size is unchanged (logic must still exist, just in another container).

## Compile options

  - TargetFramework net8.0, -r win-x64, -c Release
  - framework-dependent (--self-contained false) = smallest; target needs .NET 8 runtime
  - self-contained (--self-contained true) = copy folder, double-click runs, but larger
  - PublishTrimmed/AOT: not available offline (missing ILLink tasks package); framework-dependent is small enough

## Sandbox adaptations (offline build quirks & fixes)

  1. DOTNET_CLI_HOME / NUGET_PACKAGES redirected into workspace (first-run writes ~/.dotnet, blocked by sandbox)
  2. Partially-installed workload manifests (android/Aspire) -> MSB4276 during restore graph walk;
     exe references prebuilt dlls directly (HintPath) to bypass ProjectReference graph walk
  3. No network + zero NuGet packages -> NuGet.config clears sources; PublishTrimmed disabled (needs ILLink pkg)

## GUI (S6 WPF)

双击 MockTrader.exe 打开主窗口（不再一闪而退）。界面：品种池多选（按板块）、策略下拉（单因子/5因子合成）、
参数面板、运行按钮 + 进度条；结果区含对比结论卡片（策略年化 vs 基准、超额、判定）+ 6 项指标卡片 + 净值折线图
（策略线 + 基准复利虚线，自绘 Canvas 无需外部图表库）。运行在后台线程执行，不阻塞 UI。

（此前双击即关闭是因为旧版为控制台程序，跑完即退出；现改为 WPF 窗口，常驻不退出。）

## Build

    powershell -ExecutionPolicy Bypass -File cs/build.ps1
    # output in release/ ; run release/MockTrader.exe

## Verification

C# port is bit-for-bit identical to the JS core (same deterministic seed): 45 varieties, 782 days,
450 trades, 245 rolls, final equity 9,164,404, annualized -2.78%, verdict 'underperform' vs 15% benchmark.