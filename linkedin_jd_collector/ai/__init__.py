"""AI Vision Agent package: OpenRouter client, prompts, vision planning."""

from .openrouter_client import (
    DEFAULT_MODEL,
    LEGACY_PAID_DEFAULTS,
    OpenRouterAuthError,
    OpenRouterClient,
    OpenRouterCreditsError,
    OpenRouterError,
    OpenRouterRateLimitError,
    OpenRouterResponseError,
    format_openrouter_user_error,
)
from .vision_agent import (
    VisionAction,
    VisionAgent,
    VisionAgentError,
    VisionJSONError,
    validate_action_payload,
)

__all__ = [
    "DEFAULT_MODEL",
    "LEGACY_PAID_DEFAULTS",
    "OpenRouterAuthError",
    "OpenRouterClient",
    "OpenRouterCreditsError",
    "OpenRouterError",
    "OpenRouterRateLimitError",
    "OpenRouterResponseError",
    "VisionAction",
    "VisionAgent",
    "VisionAgentError",
    "VisionJSONError",
    "format_openrouter_user_error",
    "validate_action_payload",
]
