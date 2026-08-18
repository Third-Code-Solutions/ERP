"""Download one exact-object, short-lived source URL."""

from __future__ import annotations

import hashlib

import httpx


async def download_source(
    source_url: str,
    *,
    max_bytes: int,
) -> tuple[bytes, str]:
    """Read bounded source bytes and return them with their SHA-256 hash.

    URL is supplied by NestJS as a short-lived signed object URL. Worker has
    no Storage or database credential and never persists or logs URL.
    """

    digest = hashlib.sha256()
    chunks: list[bytes] = []
    size = 0

    async with httpx.AsyncClient(timeout=60.0, follow_redirects=False) as client:
        async with client.stream("GET", source_url) as response:
            response.raise_for_status()
            content_length = response.headers.get("content-length")
            if content_length and int(content_length) > max_bytes:
                raise ValueError("source exceeds configured byte limit")

            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > max_bytes:
                    raise ValueError("source exceeds configured byte limit")
                digest.update(chunk)
                chunks.append(chunk)

    return b"".join(chunks), digest.hexdigest()


async def download_signed_url(source_url: str, max_bytes: int) -> bytes:
    """Read a signed source URL without retaining the URL or its hash state.

    The private evidence endpoint owns the source-hash contract. Keeping this
    wrapper preserves a deliberately narrow, credential-free download surface
    for that endpoint while sharing the bounded, redirect-free transport.
    """

    source_bytes, _source_sha256 = await download_source(
        source_url, max_bytes=max_bytes
    )
    return source_bytes
