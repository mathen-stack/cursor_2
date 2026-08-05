# Packaging — LinkedIn_JD_Collector.exe

## Goal

Ship a Windows desktop app that:

- requires **no Python installation** on the operator machine
- bundles dependencies (PyQt6, automation, httpx, etc.)
- includes an application **icon**
- optionally provides an **installer**

## Outputs

| Artifact | Path |
|---|---|
| App folder + EXE | `linkedin_jd_collector/dist/LinkedIn_JD_Collector/LinkedIn_JD_Collector.exe` |
| Single-file EXE (optional) | `linkedin_jd_collector/dist/LinkedIn_JD_Collector.exe` |
| Installer (optional) | `linkedin_jd_collector/dist/installer/LinkedIn_JD_Collector_Setup.exe` |

## Build on Windows (required for real EXE)

PyInstaller must run on Windows to produce a Windows EXE.

```powershell
cd linkedin_jd_collector
powershell -ExecutionPolicy Bypass -File scripts\build_windows.ps1
```

With installer (requires [Inno Setup 6](https://jrsoftware.org/isinfo.php)):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_windows.ps1 -Installer
```

One-file variant:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build_windows.ps1 -OneFile
```

Or directly:

```powershell
python build\build_exe.py
python build\build_exe.py --installer
```

## Fresh Windows machine test checklist

1. Copy `LinkedIn_JD_Collector_Setup.exe` **or** the whole `LinkedIn_JD_Collector\` folder to a PC **without Python**.
2. Install via setup (or run `LinkedIn_JD_Collector.exe` from the folder).
3. Confirm the app icon appears on the EXE / Start Menu shortcut.
4. Launch the app — UI title **LinkedIn JD Collector Agent**.
5. Enter OpenRouter API key + vision model in Settings.
6. Open LinkedIn job results in a browser, then click **Start Agent**.
7. Confirm logs update and files appear under `Documents\LinkedIn_JD\`.
8. Use **Open Folder**, **Pause**, **Stop**.

## CI

GitHub Actions workflow `.github/workflows/windows-build.yml` builds the EXE on `windows-latest` (a clean Windows VM) and uploads artifacts for download/testing.

## Notes

- Prefer **onedir** for reliability with PyQt6; use **onefile** only if you need a single portable binary.
- Windows Defender may scan new unsigned EXEs on first launch; signing is out of scope for v1.
- Build host should be 64-bit Windows with Python 3.11+.
