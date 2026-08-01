"""Downloads files from Supabase Storage."""

from __future__ import annotations

import httpx

from src.config import settings


async def download_file(storage_path: str) -> bytes:
    if not settings.supabase_service_role_key:
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY is required for the legacy storage path"
        )
    url = f"{settings.supabase_url}/storage/v1/object/{settings.storage_bucket}/{storage_path}"
    headers = {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        return response.content


async def download_signed_url(source_url: str, max_bytes: int) -> bytes:
    """Read one exact object through a short-lived signed URL.

    This path deliberately sends no Supabase credentials. Redirects are
    disabled and the response is bounded before any parser work begins.
    """
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=False) as client:
        async with client.stream("GET", source_url) as response:
            response.raise_for_status()
            content_length = response.headers.get("content-length")
            if content_length:
                try:
                    if int(content_length) > max_bytes:
                        raise ValueError("source object exceeds configured byte limit")
                except ValueError as exc:
                    if str(exc) == "source object exceeds configured byte limit":
                        raise
                    raise ValueError("invalid source content length") from exc

            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError("source object exceeds configured byte limit")
                chunks.append(chunk)
            return b"".join(chunks)
