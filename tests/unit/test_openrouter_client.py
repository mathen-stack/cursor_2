"""Unit tests for OpenRouterClient retry/error behavior with mocked HTTP."""

from __future__ import annotations

import json

import httpx
import pytest

from ai.openrouter_client import (
    OpenRouterAuthError,
    OpenRouterClient,
    OpenRouterCreditsError,
    OpenRouterError,
    encode_image_to_data_url,
    format_openrouter_user_error,
)


class _FakeTransport(httpx.BaseTransport):
    def __init__(self, handlers):
        self.handlers = list(handlers)
        self.calls = 0

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        handler = self.handlers.pop(0)
        return handler(request)


def _json_response(status: int, payload: dict) -> httpx.Response:
    return httpx.Response(
        status_code=status,
        headers={"Content-Type": "application/json"},
        content=json.dumps(payload).encode("utf-8"),
    )


def test_encode_png_data_url():
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
    url = encode_image_to_data_url(png)
    assert url.startswith("data:image/png;base64,")


def test_complete_success(monkeypatch):
    transport = _FakeTransport(
        [
            lambda req: _json_response(
                200,
                {
                    "choices": [
                        {"message": {"content": '{"action":"finish"}'}}
                    ]
                },
            )
        ]
    )
    client = httpx.Client(transport=transport)
    or_client = OpenRouterClient(
        api_key="test-key",
        model="test/model",
        client=client,
        max_retries=1,
    )
    text = or_client.complete([{"role": "user", "content": "hi"}])
    assert text == '{"action":"finish"}'
    assert transport.calls == 1
    or_client.close()


def test_complete_retries_then_succeeds():
    transport = _FakeTransport(
        [
            lambda req: httpx.Response(503, text="busy"),
            lambda req: _json_response(
                200,
                {"choices": [{"message": {"content": '{"action":"wait"}'}}]},
            ),
        ]
    )
    client = httpx.Client(transport=transport)
    or_client = OpenRouterClient(
        api_key="test-key",
        model="test/model",
        client=client,
        max_retries=3,
        backoff_s=0.01,
    )
    text = or_client.complete([{"role": "user", "content": "hi"}])
    assert '"wait"' in text
    assert transport.calls == 2
    or_client.close()


def test_auth_error_no_retry():
    transport = _FakeTransport(
        [lambda req: httpx.Response(401, text="unauthorized")]
    )
    client = httpx.Client(transport=transport)
    or_client = OpenRouterClient(
        api_key="bad",
        model="test/model",
        client=client,
        max_retries=3,
        backoff_s=0.01,
    )
    with pytest.raises(OpenRouterAuthError):
        or_client.complete([{"role": "user", "content": "hi"}])
    assert transport.calls == 1
    or_client.close()


def test_credits_error_402_no_retry():
    transport = _FakeTransport(
        [
            lambda req: httpx.Response(
                402,
                text='{"error":{"message":"Insufficient credits","code":402}}',
            )
        ]
    )
    client = httpx.Client(transport=transport)
    or_client = OpenRouterClient(
        api_key="test-key",
        model="openai/gpt-4o",
        client=client,
        max_retries=3,
        backoff_s=0.01,
    )
    with pytest.raises(OpenRouterCreditsError) as excinfo:
        or_client.complete([{"role": "user", "content": "hi"}])
    assert "credits" in str(excinfo.value).lower()
    assert transport.calls == 1
    or_client.close()


def test_format_openrouter_user_error_credits():
    msg = format_openrouter_user_error(
        'OpenRouter HTTP 402: {"error":{"message":"Insufficient credits"}}'
    )
    assert "no credits" in msg.lower()
    assert "openrouter.ai/settings/credits" in msg
    assert "qwen" in msg.lower() or "free" in msg.lower()


def test_missing_api_key_raises(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    with pytest.raises(OpenRouterAuthError):
        OpenRouterClient(api_key="", model="test/model")


def test_complete_with_image_builds_multimodal_payload():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["payload"] = json.loads(request.content.decode("utf-8"))
        return _json_response(
            200,
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "action": "click",
                                    "target": "job_card",
                                    "coordinates": {"x": 300, "y": 450},
                                }
                            )
                        }
                    }
                ]
            },
        )

    transport = _FakeTransport([handler])
    client = httpx.Client(transport=transport)
    or_client = OpenRouterClient(
        api_key="test-key",
        model="test/model",
        client=client,
        max_retries=1,
    )
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
    text = or_client.complete_with_image(
        system_prompt="sys",
        user_text="Analyze this LinkedIn page and decide the next computer action.",
        image=png,
        force_json_response_format=True,
    )
    assert "click" in text
    content = seen["payload"]["messages"][1]["content"]
    assert content[0]["type"] == "text"
    assert content[1]["type"] == "image_url"
    assert content[1]["image_url"]["url"].startswith("data:image/png;base64,")
    assert seen["payload"]["response_format"]["type"] == "json_object"
    or_client.close()
