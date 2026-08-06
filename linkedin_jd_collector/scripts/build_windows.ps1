# Build LinkedIn_JD_Collector.exe on Windows and optional installer.
# Usage (from linkedin_jd_collector/):
#   powershell -ExecutionPolicy Bypass -File scripts\build_windows.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\build_windows.ps1 -OneFile
#   powershell -ExecutionPolicy Bypass -File scripts\build_windows.ps1 -Installer

param(
    [switch]$OneFile,
    [switch]$Installer
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "==> Creating virtual environment (.venv-build)" -ForegroundColor Cyan
if (-not (Test-Path ".venv-build")) {
    python -m venv .venv-build
}
$py = ".\.venv-build\Scripts\python.exe"

Write-Host "==> Installing dependencies" -ForegroundColor Cyan
& $py -m pip install --upgrade pip
& $py -m pip install -r requirements.txt
& $py -m pip install pyinstaller pynput pywin32

$argsList = @("build\build_exe.py")
if ($OneFile) { $argsList += "--onefile" }
if ($Installer) { $argsList += "--installer" }

Write-Host "==> Building EXE" -ForegroundColor Cyan
& $py @argsList
if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed" }

if ($OneFile) {
    $exe = "dist\LinkedIn_JD_Collector.exe"
} else {
    $exe = "dist\LinkedIn_JD_Collector\LinkedIn_JD_Collector.exe"
}

if (-not (Test-Path $exe)) { throw "EXE not found: $exe" }

Write-Host "==> Build OK: $exe" -ForegroundColor Green
Get-Item $exe | Format-List FullName, Length, LastWriteTime

if ($Installer) {
    $setup = "dist\installer\LinkedIn_JD_Collector_Setup.exe"
    if (Test-Path $setup) {
        Write-Host "==> Installer OK: $setup" -ForegroundColor Green
    } else {
        Write-Host "==> Installer not produced (is Inno Setup installed?)" -ForegroundColor Yellow
    }
}
