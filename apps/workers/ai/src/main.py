"""Python-owned advisory embedding service.

The service returns model evidence only. It has no database, tenant, Storage,
approval, or ERP transaction authority.
"""

from __future__ import annotations

import hmac
import math
import re

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from src.config import settings
from src.models import (
    EmbeddingRequest,
    EmbeddingResponse,
    GroundedAnswerRequest,
    GroundedAnswerResponse,
    GroundedEvidence,
)
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
        content={"error": "Invalid AI worker request"},
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


def _grounded_tokens(value: str) -> set[str]:
    return {
        token.lower()
        for token in re.findall(r"[a-zA-Z0-9]+", value)
        if len(token) >= 3
    }


def _matching_evidence(
    question: str, evidence: list[GroundedEvidence]
) -> tuple[list[GroundedEvidence], bool]:
    question_tokens = _grounded_tokens(question)
    matched = [
        item
        for item in evidence
        if question_tokens
        & _grounded_tokens(f"{item.node_type} {item.title or ''} {item.summary or ''}")
    ]
    return ((matched if matched else evidence)[:8], bool(matched))


@app.post("/v1/cortex/grounded-answer", response_model=GroundedAnswerResponse)
async def grounded_answer(
    request: GroundedAnswerRequest,
    authorization: str | None = Header(default=None),
) -> GroundedAnswerResponse:
    """Return deterministic evidence analysis only; never an ERP decision."""
    _check_auth(authorization)
    selected, matched = _matching_evidence(request.question, request.evidence)
    if not selected:
        return GroundedAnswerResponse(
            content=(
                "I don't have any permission-scoped records in the knowledge "
                "graph to answer that yet."
            ),
            citation_node_ids=[],
        )

    lines = []
    for item in selected:
        title = item.title or "(untitled)"
        summary = f" — {item.summary}" if item.summary else ""
        lines.append(f"• [{item.node_type}] {title}{summary}")
    intro = (
        "Here's what I found in your knowledge graph:"
        if matched
        else "Here are the most recently updated records in your knowledge graph:"
    )
    count = len(selected)
    content = (
        f"{intro}\n\n"
        + "\n".join(lines)
        + f"\n\nCited {count} record{'s' if count != 1 else ''} — "
        "open any from the graph to dig in."
    )
    return GroundedAnswerResponse(
        content=content,
        citation_node_ids=[item.node_id for item in selected],
    )
