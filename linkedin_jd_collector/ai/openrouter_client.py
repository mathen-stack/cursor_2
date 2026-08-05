"""
OpenRouter API HTTP client for multimodal vision requests.

Loads API credentials from .env, sends screenshot+text prompts, and returns
raw model output with retries, error handling, and logging.
"""

from __future__ import annotations

import base64
import logging
import mimetypes
import os
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-4o"
DEFAULT_TIMEOUT_S = 60.0
DEFAULT_MAX_RETRIES = 3
DEFAULT_BACKOFF_S = 1.5
RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}

# Resolve package-local .env (linkedin_jd_collector/.env)
_PACKAGE_ROOT = Path(__file__).resolve().parents[1]
_ENV_PATH = _PACKAGE_ROOT / ".env"


class OpenRouterError(Exception):
    """Base error for OpenRouter client failures."""


class OpenRouterAuthError(OpenRouterError):
    """Raised when the API key is missing or rejected."""


class OpenRouterRateLimitError(OpenRouterError):
    """Raised when OpenRouter rate-limits the request after retries."""


class OpenRouterResponseError(OpenRouterError):
    """Raised when the API response is malformed or empty."""


def _load_env() -> None:
    """Load environment variables from the package .env if present."""
    if _ENV_PATH.exists():
        load_dotenv(dotenv_path=_ENV_PATH, override=False)
        logger.debug("Loaded env from %s", _ENV_PATH)
    else:
        # Still allow process environment / CWD .env
        load_dotenv(override=False)
        logger.debug("Package .env not found at %s; using process env", _ENV_PATH)


def _guess_mime(image_bytes: bytes, filename_hint: str | None = None) -> str:
    if filename_hint:
        mime, _ = mimetypes.guess_type(filename_hint)
        if mime:
            return mime
    # PNG signature
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    # JPEG signature
    if image_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    # WebP: RIFF....WEBP
    if len(image_bytes) >= 12 and image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    return "image/png"


def encode_image_to_data_url(
    image: bytes | str | Path,
    *,
    mime_type: str | None = None,
) -> str:
    """
    Convert image bytes or a filesystem path into a data URL for OpenRouter.
    """
    filename_hint = None
    if isinstance(image, (str, Path)):
        path = Path(image)
        if not path.is_file():
            raise FileNotFoundError(f"Screenshot not found: {path}")
        image_bytes = path.read_bytes()
        filename_hint = path.name
    else:
        image_bytes = image

    if not image_bytes:
        raise ValueError("Screenshot image is empty")

    mime = mime_type or _guess_mime(image_bytes, filename_hint)
    b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime};base64,{b64}"


class OpenRouterClient:
    """Thin OpenRouter chat-completions client with retry/backoff."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        *,
        base_url: str = OPENROUTER_API_URL,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        max_retries: int = DEFAULT_MAX_RETRIES,
        backoff_s: float = DEFAULT_BACKOFF_S,
        site_url: str | None = None,
        app_name: str = "LinkedIn JD Collector Agent",
        client: httpx.Client | None = None,
    ) -> None:
        _load_env()

        self.api_key = (api_key or os.getenv("OPENROUTER_API_KEY") or "").strip()
        self.model = (
            model
            or os.getenv("OPENROUTER_MODEL")
            or DEFAULT_MODEL
        ).strip()
        self.base_url = base_url
        self.timeout_s = timeout_s
        self.max_retries = max(1, max_retries)
        self.backoff_s = backoff_s
        self.site_url = site_url or os.getenv("OPENROUTER_SITE_URL")
        self.app_name = app_name
        self._owns_client = client is None
        self._client = client or httpx.Client(timeout=timeout_s)

        if not self.api_key or self.api_key.startswith("your_openrouter_api_key"):
            raise OpenRouterAuthError(
                "OPENROUTER_API_KEY is missing or still a placeholder. "
                "Set it in linkedin_jd_collector/.env"
            )
        if not self.model or self.model.startswith("your_multimodal_vision_model"):
            # Fall back to a known multimodal default if placeholder left in .env
            logger.warning(
                "OPENROUTER_MODEL is missing/placeholder; using default %s",
                DEFAULT_MODEL,
            )
            self.model = DEFAULT_MODEL

        logger.info("OpenRouterClient ready model=%s", self.model)

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> OpenRouterClient:
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def _headers(self) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-Title": self.app_name,
        }
        if self.site_url:
            headers["HTTP-Referer"] = self.site_url
        return headers

    def complete(
        self,
        messages: list[dict[str, Any]],
        *,
        model: str | None = None,
        temperature: float = 0.1,
        max_tokens: int = 1024,
        extra_body: dict[str, Any] | None = None,
    ) -> str:
        """
        Call OpenRouter chat completions and return the assistant text content.
        """
        payload: dict[str, Any] = {
            "model": model or self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if extra_body:
            payload.update(extra_body)

        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                logger.info(
                    "OpenRouter request attempt=%s/%s model=%s",
                    attempt,
                    self.max_retries,
                    payload["model"],
                )
                response = self._client.post(
                    self.base_url,
                    headers=self._headers(),
                    json=payload,
                )
                if response.status_code in (401, 403):
                    raise OpenRouterAuthError(
                        f"OpenRouter auth failed ({response.status_code}): {response.text[:500]}"
                    )
                if response.status_code in RETRYABLE_STATUS:
                    last_error = OpenRouterError(
                        f"Retryable status {response.status_code}: {response.text[:500]}"
                    )
                    logger.warning("%s", last_error)
                    self._sleep(attempt)
                    continue

                if response.status_code >= 400:
                    raise OpenRouterError(
                        f"OpenRouter HTTP {response.status_code}: {response.text[:800]}"
                    )

                data = response.json()
                content = self._extract_content(data)
                logger.info("OpenRouter response ok chars=%s", len(content))
                return content

            except OpenRouterAuthError:
                raise
            except (httpx.TimeoutException, httpx.NetworkError, httpx.TransportError) as exc:
                last_error = OpenRouterError(f"Network error: {exc}")
                logger.warning(
                    "OpenRouter network error attempt=%s/%s: %s",
                    attempt,
                    self.max_retries,
                    exc,
                )
                self._sleep(attempt)
            except OpenRouterError:
                raise
            except Exception as exc:  # noqa: BLE001 - normalize unexpected failures
                last_error = OpenRouterError(f"Unexpected client error: {exc}")
                logger.exception("Unexpected OpenRouter client error")
                self._sleep(attempt)

        if isinstance(last_error, OpenRouterError) and "429" in str(last_error):
            raise OpenRouterRateLimitError(str(last_error)) from last_error
        raise OpenRouterError(
            f"OpenRouter request failed after {self.max_retries} attempts: {last_error}"
        )

    def complete_with_image(
        self,
        *,
        system_prompt: str,
        user_text: str,
        image: bytes | str | Path,
        mime_type: str | None = None,
        model: str | None = None,
        temperature: float = 0.1,
        max_tokens: int = 1024,
        force_json_response_format: bool = True,
    ) -> str:
        """Send a system prompt + user text + screenshot image to OpenRouter."""
        data_url = encode_image_to_data_url(image, mime_type=mime_type)
        messages = [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ]

        extra_body = (
            {"response_format": {"type": "json_object"}}
            if force_json_response_format
            else None
        )
        try:
            return self.complete(
                messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                extra_body=extra_body,
            )
        except OpenRouterError as exc:
            # Some models reject response_format; retry without it.
            if force_json_response_format and "response_format" in str(exc).lower():
                logger.warning(
                    "Model rejected response_format=json_object; retrying without it"
                )
                return self.complete(
                    messages,
                    model=model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    extra_body=None,
                )
            raise

    def _sleep(self, attempt: int) -> None:
        delay = self.backoff_s * (2 ** (attempt - 1))
        logger.debug("Backing off for %.2fs before retry", delay)
        time.sleep(delay)

    @staticmethod
    def _extract_content(data: dict[str, Any]) -> str:
        try:
            choices = data["choices"]
            message = choices[0]["message"]
            content = message.get("content")
        except (KeyError, IndexError, TypeError) as exc:
            raise OpenRouterResponseError(
                f"Unexpected OpenRouter response shape: {data!r}"
            ) from exc

        if content is None:
            raise OpenRouterResponseError("OpenRouter returned empty message content")

        if isinstance(content, list):
            # Some providers return content parts
            texts = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    texts.append(str(part.get("text", "")))
                elif isinstance(part, str):
                    texts.append(part)
            content = "\n".join(texts).strip()

        if not isinstance(content, str) or not content.strip():
            raise OpenRouterResponseError("OpenRouter returned non-text/empty content")

        return content.strip()
