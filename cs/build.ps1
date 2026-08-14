# build.ps1 - S8 build script: thin exe + logic dlls, x64 Release, framework-dependent (smallest).
# usage: powershell -ExecutionPolicy Bypass -File build.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:DOTNET_CLI_HOME = Join-Path $root '.dotnet-home'
$env:NUGET_PACKAGES = Join-Path $root '.nuget-packages'
$env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_NOLOGO = '1'

$dll1 = Join-Path $PSScriptRoot 'DataAccess\DataAccess.csproj'
$dll2 = Join-Path $PSScriptRoot 'StrategyCore\StrategyCore.csproj'
$exe  = Join-Path $PSScriptRoot 'MockTrader\MockTrader.csproj'

Write-Host '[1/3] DataAccess.dll  (S1 data layer)' -ForegroundColor Cyan
& dotnet build $dll1 -c Release --nologo -v minimal
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '[2/3] StrategyCore.dll (S2-S5 factor/strategy/backtest/perf)' -ForegroundColor Cyan
& dotnet build $dll2 -c Release --nologo -v minimal
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '[3/3] MockTrader.exe (thin entry, x64, framework-dependent)' -ForegroundColor Cyan
& dotnet publish $exe -c Release -r win-x64 --self-contained false --nologo -v minimal
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$publish = Join-Path $PSScriptRoot 'MockTrader\bin\Release\net8.0-windows\win-x64\publish'
$release = Join-Path $root 'release'
New-Item -ItemType Directory -Force -Path $release | Out-Null
Copy-Item (Join-Path $publish '*') -Destination $release -Force

Write-Host ''
Write-Host ('publish dir: ' + $release) -ForegroundColor Green
Get-ChildItem $release -Exclude *.pdb | Sort-Object Name | ForEach-Object {
  Write-Host ('  {0,-28} {1,10:N0} bytes' -f $_.Name, $_.Length)
}
Write-Host ''
Write-Host '  exe ~140KB thin entry; logic in StrategyCore.dll / DataAccess.dll.'
Write-Host '  exe+dll shrinks the exe single-file (vs self-contained ~10-30MB); total size unchanged.'
Write-Host '  framework-dependent: target machine needs .NET 8 runtime.'