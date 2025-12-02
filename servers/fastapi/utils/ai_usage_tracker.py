"""
AI Usage Tracker - Reports OpenAI token usage to WordPress
"""
import asyncio
import httpx
import logging
from contextvars import ContextVar
from typing import Optional
from urllib.parse import unquote

logger = logging.getLogger(__name__)

# Context variables populated by middleware
CALLBACK_URL_CONTEXT: ContextVar[Optional[str]] = ContextVar("callback_url", default=None)
CALLBACK_SECRET_CONTEXT: ContextVar[Optional[str]] = ContextVar("callback_secret", default=None)
SITE_URL_CONTEXT: ContextVar[Optional[str]] = ContextVar("site_url", default=None)

# OpenAI pricing per 1K tokens (as of 2024 - update as needed)
# https://openai.com/pricing
OPENAI_PRICING = {
    # GPT-4 Turbo
    "gpt-4-turbo": {"input": 0.01, "output": 0.03},
    "gpt-4-turbo-preview": {"input": 0.01, "output": 0.03},
    "gpt-4-1106-preview": {"input": 0.01, "output": 0.03},

    # GPT-4
    "gpt-4": {"input": 0.03, "output": 0.06},
    "gpt-4-32k": {"input": 0.06, "output": 0.12},

    # GPT-4o
    "gpt-4o": {"input": 0.005, "output": 0.015},
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},

    # GPT-3.5 Turbo
    "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
    "gpt-3.5-turbo-16k": {"input": 0.003, "output": 0.004},

    # Default fallback (assume GPT-4o pricing)
    "default": {"input": 0.005, "output": 0.015},
}

# DALL-E pricing per image
DALLE_PRICING = {
    "dall-e-3": {
        "1024x1024": 0.04,
        "1024x1792": 0.08,
        "1792x1024": 0.08,
    },
    "dall-e-2": {
        "1024x1024": 0.02,
        "512x512": 0.018,
        "256x256": 0.016,
    },
}


def calculate_cost(
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    image_count: int = 0,
    image_size: str = "1024x1024"
) -> float:
    """
    Calculate the USD cost for an OpenAI API call.

    Args:
        model: The model name (e.g., "gpt-4o", "dall-e-3")
        input_tokens: Number of input/prompt tokens
        output_tokens: Number of output/completion tokens
        image_count: Number of images generated (for DALL-E)
        image_size: Size of images (for DALL-E)

    Returns:
        Estimated USD cost
    """
    cost = 0.0

    # Text model pricing
    if input_tokens > 0 or output_tokens > 0:
        pricing = OPENAI_PRICING.get(model, OPENAI_PRICING["default"])
        cost += (input_tokens / 1000) * pricing["input"]
        cost += (output_tokens / 1000) * pricing["output"]

    # Image model pricing
    if image_count > 0 and model.startswith("dall-e"):
        dalle_prices = DALLE_PRICING.get(model, DALLE_PRICING.get("dall-e-3", {}))
        price_per_image = dalle_prices.get(image_size, 0.04)
        cost += image_count * price_per_image

    return cost


def get_callback_context():
    return {
        "callback_url": CALLBACK_URL_CONTEXT.get(),
        "callback_secret": CALLBACK_SECRET_CONTEXT.get(),
        "site_url": SITE_URL_CONTEXT.get(),
    }


async def report_usage_to_wordpress(
    callback_url: str,
    secret: Optional[str],
    tokens: int,
    usd_cost: float,
    user_id: int = 0,
    source: str = "presenton"
) -> bool:
    """
    Report AI usage to WordPress callback endpoint.

    Args:
        callback_url: The WordPress REST endpoint URL
        secret: Shared secret for authentication
        tokens: Total tokens used
        usd_cost: Estimated USD cost
        user_id: WordPress user ID (optional)
        source: Usage source identifier

    Returns:
        True if successfully reported, False otherwise
    """
    if not callback_url:
        logger.debug("No callback URL provided, skipping usage report")
        return False

    try:
        # Decode URL if needed
        if callback_url.startswith('%'):
            callback_url = unquote(callback_url)

        payload = {
            "source": source,
            "tokens": tokens,
            "usd_cost": usd_cost,
            "user_id": user_id,
        }

        if secret:
            payload["secret"] = secret

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                callback_url,
                json=payload,
                headers={"Content-Type": "application/json"}
            )

            if response.status_code == 200:
                logger.info(f"Usage reported successfully: {tokens} tokens, ${usd_cost:.6f}")
                return True
            else:
                logger.warning(f"Usage report failed: {response.status_code} - {response.text}")
                return False

    except Exception as e:
        logger.error(f"Error reporting usage to WordPress: {e}")
        return False


def schedule_usage_report(tokens: int, usd_cost: float, source: str = "presenton") -> None:
    callback_settings = get_callback_context()
    callback_url = callback_settings.get("callback_url")
    callback_secret = callback_settings.get("callback_secret")

    if not callback_url:
        logger.debug("Callback URL not provided in context; skipping usage report")
        return

    if tokens == 0 and usd_cost == 0:
        logger.debug("No usage to report; tokens and cost are zero")
        return

    asyncio.create_task(
        report_usage_to_wordpress(
            callback_url=callback_url,
            secret=callback_secret,
            tokens=tokens,
            usd_cost=usd_cost,
            source=source,
        )
    )


def schedule_openai_usage_report(
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    image_count: int = 0,
    image_size: str = "1024x1024",
    source: str = "presenton",
) -> None:
    cost = calculate_cost(
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        image_count=image_count,
        image_size=image_size,
    )
    total_tokens = input_tokens + output_tokens
    schedule_usage_report(tokens=total_tokens, usd_cost=cost, source=source)
