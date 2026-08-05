# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for LinkedIn_JD_Collector.exe

Build on Windows:
    python -m PyInstaller --noconfirm build/LinkedIn_JD_Collector.spec
or:
    python build/build_exe.py
"""

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

ROOT = Path(SPECPATH).resolve().parents[0] if "SPECPATH" in globals() else Path.cwd()
# SPECPATH is provided by PyInstaller as the directory containing this spec
try:
    SPEC_DIR = Path(SPECPATH)
except NameError:
    SPEC_DIR = Path(__file__).resolve().parent
ROOT = SPEC_DIR.parent

ICON = ROOT / "resources" / "app.ico"
ENTRY = ROOT / "main.py"

datas = []
binaries = []
hiddenimports = [
    "PyQt6",
    "PyQt6.QtCore",
    "PyQt6.QtGui",
    "PyQt6.QtWidgets",
    "pyautogui",
    "pyperclip",
    "httpx",
    "dotenv",
    "pydantic",
    "PIL",
    "mss",
    "pynput",
    "pywinauto",
    "certifi",
    "anyio",
    "httpcore",
]

# Bundle PyQt6 / mss fully
for pkg in ("PyQt6", "mss"):
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(pkg)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hidden

# App resources
if ICON.exists():
    datas.append((str(ICON), "resources"))
env_example = ROOT / ".env.example"
if env_example.exists():
    datas.append((str(env_example), "."))

block_cipher = None

a = Analysis(
    [str(ENTRY)],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="LinkedIn_JD_Collector",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # GUI app — no console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(ICON) if ICON.exists() else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="LinkedIn_JD_Collector",
)
