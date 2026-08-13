"""Provider transport. No tenant or ERP record data is accepted here."""

from __future__ import annotations

import httpx

from src.config import settings


class ProviderNotConfigured(RuntimeError):
    """Provider credentials are intentionally absent."""


class ProviderUnavailable(RuntimeError):
    """Provider request failed or returned unusable transport."""


async def request_embeddings(texts: list[str]) -> dict[str, object]:
    if not settings.provider_api_key:
        raise ProviderNotConfigured

    headers = {
        "Authorization": f"Bearer {settings.provider_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.embedding_model,
        "input": texts,
    }

    try:
        async with httpx.AsyncClient(
            timeout=settings.provider_timeout_seconds
        ) as client:
            response = await client.post(
                settings.provider_url,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            value = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ProviderUnavailable from exc

    if not isinstance(value, dict):
        raise ProviderUnavailable
    return value
