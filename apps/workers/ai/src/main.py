"""Python-owned advisory embedding service.

The service returns model evidence only. It has no database, tenant, Storage,
approval, or ERP transaction authority.
"""

from __future__ import annotations

import hmac
import math

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from src.config import settings
from src.models import EmbeddingRequest, EmbeddingResponse
from src.provider import (
    ProviderNotConfigured,
    ProviderUnavailable,
    request_embeddings,
)

app = FastAPI(title="Third Code ERP AI Worker", version="0.1.0")


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    _request: Request, _exc: RequestValidationError
) -> JSONResponse:
    # Do not echo submitted text in validation responses.
    return JSONResponse(
        status_code=422,
        content={"error": "Invalid embedding request"},
    )


def _check_auth(authorization: str | None) -> None:
    if len(settings.shared_secret) < 20:
        raise HTTPException(
            status_code=503,
            detail="AI worker authentication is not configured",
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    presented = authorization[len("Bearer "):]
    if not hmac.compare_digest(presented, settings.shared_secret):
        raise HTTPException(status_code=401, detail="Invalid bearer token")


def _ordered_embeddings(
    provider_payload: dict[str, object], expected_count: int
) -> list[list[float]]:
    raw_data = provider_payload.get("data")
    if not isinstance(raw_data, list) or len(raw_data) != expected_count:
        raise ProviderUnavailable

    ordered: list[list[float] | None] = [None] * expected_count
    for item in raw_data:
        if not isinstance(item, dict):
            raise ProviderUnavailable
        index = item.get("index")
        vector = item.get("embedding")
        if not isinstance(index, int) or index < 0 or index >= expected_count:
            raise ProviderUnavailable
        if not isinstance(vector, list) or len(vector) != settings.embedding_dimensions:
            raise ProviderUnavailable
        if not all(
            isinstance(value, (float, int))
            and math.isfinite(float(value))
            for value in vector
        ):
            raise ProviderUnavailable
        if ordered[index] is not None:
            raise ProviderUnavailable
        ordered[index] = [float(value) for value in vector]

    if any(vector is None for vector in ordered):
        raise ProviderUnavailable
    return [vector for vector in ordered if vector is not None]


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "third-code-ai-worker"}


@app.post("/v1/embeddings", response_model=EmbeddingResponse)
async def embeddings(
    request: EmbeddingRequest,
    authorization: str | None = Header(default=None),
) -> EmbeddingResponse:
    _check_auth(authorization)
    try:
        provider_payload = await request_embeddings(request.texts)
        vectors = _ordered_embeddings(provider_payload, len(request.texts))
    except ProviderNotConfigured as exc:
        raise HTTPException(
            status_code=503, detail="AI provider is not configured"
        ) from exc
    except ProviderUnavailable as exc:
        raise HTTPException(
            status_code=503, detail="AI provider is unavailable"
        ) from exc

    return EmbeddingResponse(
        model=settings.embedding_model,
        dimensions=settings.embedding_dimensions,
        embeddings=vectors,
    )
