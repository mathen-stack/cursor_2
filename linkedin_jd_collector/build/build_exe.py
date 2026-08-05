"""
Build LinkedIn_JD_Collector.exe with PyInstaller.

Run on Windows (recommended):

    python build/build_exe.py
    python build/build_exe.py --onefile
    python build/build_exe.py --installer

Outputs (default onedir):
    dist/LinkedIn_JD_Collector/LinkedIn_JD_Collector.exe

Optional onefile:
    dist/LinkedIn_JD_Collector.exe
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
WORK = ROOT / "build" / "pyinstaller_work"
SPEC = ROOT / "build" / "LinkedIn_JD_Collector.spec"
ICON = ROOT / "resources" / "app.ico"
ENTRY = ROOT / "main.py"
APP_NAME = "LinkedIn_JD_Collector"


def _sep() -> str:
    return ";" if sys.platform.startswith("win") else ":"


def _ensure_icon() -> Path:
    if ICON.exists():
        return ICON
    from PIL import Image, ImageDraw

    ICON.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGBA", (256, 256), (15, 76, 92, 255))
    d = ImageDraw.Draw(img)
    d.rectangle([40, 40, 216, 216], outline=(242, 201, 76, 255), width=12)
    img.save(ICON, format="ICO")
    return ICON


def _build_onefile(clean: bool) -> Path:
    icon = _ensure_icon()
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onefile",
        "--windowed",
        "--name",
        APP_NAME,
        "--icon",
        str(icon),
        "--paths",
        str(ROOT),
        "--distpath",
        str(DIST),
        "--workpath",
        str(WORK),
        "--specpath",
        str(ROOT / "build"),
        "--collect-all",
        "PyQt6",
        "--collect-all",
        "mss",
        "--hidden-import",
        "PyQt6.QtCore",
        "--hidden-import",
        "PyQt6.QtGui",
        "--hidden-import",
        "PyQt6.QtWidgets",
        "--hidden-import",
        "pyautogui",
        "--hidden-import",
        "pyperclip",
        "--hidden-import",
        "dotenv",
        "--hidden-import",
        "httpx",
        "--hidden-import",
        "pydantic",
        "--hidden-import",
        "PIL",
        "--hidden-import",
        "mss",
        "--add-data",
        f"{icon}{_sep()}resources",
        "--add-data",
        f"{ROOT / '.env.example'}{_sep()}.",
    ]
    if clean:
        cmd.append("--clean")
    cmd.append(str(ENTRY))
    print("Running:", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(ROOT))
    exe = DIST / f"{APP_NAME}.exe"
    if not exe.exists():
        # Linux dry-run name
        alt = DIST / APP_NAME
        if alt.exists():
            return alt
        raise FileNotFoundError(f"Expected EXE not found: {exe}")
    return exe


def _build_onedir(clean: bool) -> Path:
    _ensure_icon()
    if not SPEC.exists():
        raise FileNotFoundError(f"Spec missing: {SPEC}")
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--distpath",
        str(DIST),
        "--workpath",
        str(WORK),
    ]
    if clean:
        cmd.append("--clean")
    cmd.append(str(SPEC))
    print("Running:", " ".join(cmd))
    subprocess.check_call(cmd, cwd=str(ROOT))

    exe = DIST / APP_NAME / f"{APP_NAME}.exe"
    if not exe.exists():
        alt = DIST / APP_NAME / APP_NAME
        if alt.exists():
            return alt
        raise FileNotFoundError(f"Expected EXE not found: {exe}")
    return exe


def build(onefile: bool = False, clean: bool = True) -> Path:
    if not ENTRY.exists():
        raise FileNotFoundError(f"Entrypoint missing: {ENTRY}")
    DIST.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)

    exe = _build_onefile(clean=clean) if onefile else _build_onedir(clean=clean)
    print(f"Built: {exe}")
    return exe


def build_installer() -> Path | None:
    """Compile Inno Setup installer when ISCC is available (Windows)."""
    iss = ROOT / "build" / "installer.iss"
    if not iss.exists():
        print("installer.iss missing; skipping installer")
        return None

    iscc = shutil.which("ISCC") or shutil.which("ISCC.exe")
    if not iscc:
        candidate = Path(r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe")
        if candidate.exists():
            iscc = str(candidate)
    if not iscc:
        print(
            "Inno Setup Compiler (ISCC) not found. "
            "Install Inno Setup 6 to build LinkedIn_JD_Collector_Setup.exe"
        )
        return None

    subprocess.check_call([iscc, str(iss)], cwd=str(ROOT))
    setup = DIST / "installer" / "LinkedIn_JD_Collector_Setup.exe"
    if setup.exists():
        print(f"Installer built: {setup}")
        return setup
    print("ISCC finished but setup EXE not found at expected path")
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build LinkedIn_JD_Collector Windows EXE")
    parser.add_argument("--onefile", action="store_true", help="Single-file EXE")
    parser.add_argument(
        "--installer",
        action="store_true",
        help="Also compile Inno Setup installer (Windows + ISCC required)",
    )
    parser.add_argument("--no-clean", action="store_true", help="Skip PyInstaller --clean")
    args = parser.parse_args(argv)

    try:
        build(onefile=args.onefile, clean=not args.no_clean)
        if args.installer:
            build_installer()
    except subprocess.CalledProcessError as exc:
        print(f"Build failed with exit code {exc.returncode}", file=sys.stderr)
        return exc.returncode or 1
    except Exception as exc:  # noqa: BLE001
        print(f"Build failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
