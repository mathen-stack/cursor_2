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

from storage.file_manager import default_output_dir

logger = logging.getLogger(__name__)

_PACKAGE_ROOT = Path(__file__).resolve().parents[1]
_ENV_PATH = _PACKAGE_ROOT / ".env"
_SETTINGS_PATH = _PACKAGE_ROOT / "ui_settings.json"


@dataclass
class AppSettings:
    openrouter_api_key: str = ""
    vision_model: str = "openai/gpt-4o"
    output_dir: str = ""

    def __post_init__(self) -> None:
        if not self.output_dir:
            self.output_dir = str(default_output_dir())

    def apply_to_environ(self) -> None:
        """Push settings into process env for OpenRouter client / storage."""
        if self.openrouter_api_key:
            os.environ["OPENROUTER_API_KEY"] = self.openrouter_api_key.strip()
        if self.vision_model:
            os.environ["OPENROUTER_MODEL"] = self.vision_model.strip()
        if self.output_dir:
            os.environ["OUTPUT_DIR"] = self.output_dir.strip()


def load_settings(path: Path | None = None) -> AppSettings:
    """Load settings from ui_settings.json and .env (env wins for secrets if present)."""
    if _ENV_PATH.exists():
        load_dotenv(dotenv_path=_ENV_PATH, override=False)
    else:
        load_dotenv(override=False)

    settings = AppSettings(
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY", ""),
        vision_model=os.getenv("OPENROUTER_MODEL", "openai/gpt-4o"),
        output_dir=os.getenv("OUTPUT_DIR") or str(default_output_dir()),
    )

    settings_path = path or _SETTINGS_PATH
    if settings_path.exists():
        try:
            data = json.loads(settings_path.read_text(encoding="utf-8"))
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
        except Exception:  # noqa: BLE001
            logger.exception("Failed to load UI settings from %s", settings_path)

    # Ignore obvious placeholders
    if settings.openrouter_api_key.startswith("your_openrouter_api_key"):
        settings.openrouter_api_key = ""
    if settings.vision_model.startswith("your_multimodal_vision_model"):
        settings.vision_model = "openai/gpt-4o"

    return settings


def save_settings(settings: AppSettings, path: Path | None = None) -> None:
    """Persist settings to ui_settings.json and update package .env key/model lines."""
    settings_path = path or _SETTINGS_PATH
    payload = asdict(settings)
    settings_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    logger.info("Saved UI settings to %s", settings_path)

    # Keep .env in sync for non-UI runs
    _upsert_env(
        {
            "OPENROUTER_API_KEY": settings.openrouter_api_key,
            "OPENROUTER_MODEL": settings.vision_model,
            "OUTPUT_DIR": settings.output_dir,
        }
    )
    settings.apply_to_environ()


def _upsert_env(values: dict[str, str]) -> None:
    existing: dict[str, str] = {}
    order: list[str] = []
    if _ENV_PATH.exists():
        for line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
            if not line.strip() or line.strip().startswith("#") or "=" not in line:
                order.append(line)
                continue
            key, val = line.split("=", 1)
            existing[key.strip()] = val
            order.append(line)

    for key, value in values.items():
        existing[key] = value

    # Rewrite file preserving comments/blank lines where possible
    written_keys: set[str] = set()
    out_lines: list[str] = []
    if _ENV_PATH.exists():
        for line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
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

    _ENV_PATH.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
