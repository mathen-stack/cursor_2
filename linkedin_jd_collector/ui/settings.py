"""
Settings model and persistence for the LinkedIn JD Collector Agent UI.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict, dataclass
from pathlib import Path

from dotenv import load_dotenv

from ai.openrouter_client import (
    DEFAULT_MODEL,
    LEGACY_PAID_DEFAULTS,
    RETIRED_FREE_MODELS,
)
from storage.file_manager import default_output_dir
from ui.paths import env_path, is_frozen, settings_path

logger = logging.getLogger(__name__)

# Resolved at call time so tests can monkeypatch ui.paths helpers.
_PACKAGE_ROOT = Path(__file__).resolve().parents[1]


@dataclass
class AppSettings:
    openrouter_api_key: str = ""
    vision_model: str = DEFAULT_MODEL
    output_dir: str = ""
    # human = watchable; fast = quicker automation
    automation_pace: str = "human"

    def __post_init__(self) -> None:
        if not self.output_dir:
            self.output_dir = str(default_output_dir())
        pace = (self.automation_pace or "human").strip().lower()
        self.automation_pace = "fast" if pace in {"fast", "quick", "speed"} else "human"

    def apply_to_environ(self) -> None:
        """Push settings into process env for OpenRouter client / storage."""
        if self.openrouter_api_key:
            os.environ["OPENROUTER_API_KEY"] = self.openrouter_api_key.strip()
        if self.vision_model:
            os.environ["OPENROUTER_MODEL"] = self.vision_model.strip()
        if self.output_dir:
            os.environ["OUTPUT_DIR"] = self.output_dir.strip()
        os.environ["AUTOMATION_PACE"] = self.automation_pace.strip() or "human"


def _settings_file(path: Path | None = None) -> Path:
    return path or settings_path()


def _env_file() -> Path:
    return env_path()


def load_settings(path: Path | None = None) -> AppSettings:
    """Load settings from user ui_settings.json and .env (env wins for secrets if present)."""
    env_file = _env_file()
    if env_file.exists():
        load_dotenv(dotenv_path=env_file, override=False)
    # Also allow a package-local .env during source development
    package_env = _PACKAGE_ROOT / ".env"
    if not is_frozen() and package_env.exists() and package_env != env_file:
        load_dotenv(dotenv_path=package_env, override=False)
    else:
        load_dotenv(override=False)

    settings = AppSettings(
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY", ""),
        vision_model=os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL),
        output_dir=os.getenv("OUTPUT_DIR") or str(default_output_dir()),
        automation_pace=os.getenv("AUTOMATION_PACE", "human"),
    )

    settings_file = _settings_file(path)
    if settings_file.exists():
        try:
            data = json.loads(settings_file.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                if data.get("openrouter_api_key") and not settings.openrouter_api_key:
                    settings.openrouter_api_key = str(data["openrouter_api_key"])
                if data.get("vision_model"):
                    # Prefer saved UI model over placeholder env
                    env_model = os.getenv("OPENROUTER_MODEL", "")
                    if not env_model or env_model.startswith("your_"):
                        settings.vision_model = str(data["vision_model"])
                    else:
                        settings.vision_model = env_model
                if data.get("output_dir"):
                    settings.output_dir = str(data["output_dir"])
                if data.get("automation_pace") and not os.getenv("AUTOMATION_PACE"):
                    settings.automation_pace = str(data["automation_pace"])
        except Exception:  # noqa: BLE001
            logger.exception("Failed to load UI settings from %s", settings_file)

    # Ignore obvious placeholders
    if settings.openrouter_api_key.startswith("your_openrouter_api_key"):
        settings.openrouter_api_key = ""
    if settings.vision_model.startswith("your_multimodal_vision_model"):
        settings.vision_model = DEFAULT_MODEL
    # Migrate retired free slugs (e.g. qwen …:free → current free VL default)
    if settings.vision_model.strip() in RETIRED_FREE_MODELS:
        logger.info(
            "Migrating retired OpenRouter model %s → %s",
            settings.vision_model,
            DEFAULT_MODEL,
        )
        settings.vision_model = DEFAULT_MODEL
    # Former shipped default requires paid credits; users without balance hit 402.
    if settings.vision_model.strip() in LEGACY_PAID_DEFAULTS:
        logger.info(
            "Migrating legacy paid OpenRouter model %s → %s",
            settings.vision_model,
            DEFAULT_MODEL,
        )
        settings.vision_model = DEFAULT_MODEL

    return settings


def save_settings(settings: AppSettings, path: Path | None = None) -> None:
    """Persist settings to a user-writable ui_settings.json (+ optional .env sync)."""
    settings_file = _settings_file(path)
    settings_file.parent.mkdir(parents=True, exist_ok=True)
    payload = asdict(settings)
    settings_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    logger.info("Saved UI settings to %s", settings_file)

    # Keep .env in sync for non-UI / OpenRouter client loads
    try:
        _upsert_env(
            {
                "OPENROUTER_API_KEY": settings.openrouter_api_key,
                "OPENROUTER_MODEL": settings.vision_model,
                "OUTPUT_DIR": settings.output_dir,
                "AUTOMATION_PACE": settings.automation_pace,
            }
        )
    except OSError as exc:
        # Never crash the UI if .env cannot be written (install dir / AV / permissions).
        logger.warning("Could not sync .env (%s); settings JSON was saved", exc)

    settings.apply_to_environ()


def _upsert_env(values: dict[str, str]) -> None:
    env_file = _env_file()
    env_file.parent.mkdir(parents=True, exist_ok=True)
    existing: dict[str, str] = {}
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if not line.strip() or line.strip().startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            existing[key.strip()] = val

    for key, value in values.items():
        existing[key] = value

    # Rewrite file preserving comments/blank lines where possible
    written_keys: set[str] = set()
    out_lines: list[str] = []
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if not line.strip() or line.strip().startswith("#") or "=" not in line:
                out_lines.append(line)
                continue
            key = line.split("=", 1)[0].strip()
            if key in existing:
                out_lines.append(f"{key}={existing[key]}")
                written_keys.add(key)
            else:
                out_lines.append(line)
    for key, value in existing.items():
        if key not in written_keys:
            out_lines.append(f"{key}={value}")

    env_file.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
