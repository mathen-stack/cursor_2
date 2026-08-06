"""Basic checks for the packaging entrypoint (no Windows EXE build here)."""

from __future__ import annotations

import runpy
from pathlib import Path


def test_build_script_help_exits_zero(capsys):
    script = Path("linkedin_jd_collector/build/build_exe.py")
    assert script.exists()
    try:
        runpy.run_path(str(script), run_name="not_main")
    except SystemExit:
        pass
    # Import-as-main with --help
    import subprocess
    import sys

    result = subprocess.run(
        [sys.executable, str(script), "--help"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0
    assert "LinkedIn_JD_Collector" in result.stdout


def test_packaging_assets_exist():
    root = Path("linkedin_jd_collector")
    assert (root / "resources" / "app.ico").exists()
    assert (root / "build" / "LinkedIn_JD_Collector.spec").exists()
    assert (root / "build" / "installer.iss").exists()
    assert (root / "scripts" / "build_windows.ps1").exists()
