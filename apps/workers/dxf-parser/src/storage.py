"""Downloads files from Supabase Storage."""

from __future__ import annotations

import httpx

from src.config import settings


async def download_file(storage_path: str) -> bytes:
    url = f"{settings.supabase_url}/storage/v1/object/{settings.storage_bucket}/{storage_path}"
    headers = {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        return response.content
