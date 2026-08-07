"""Contract tests for the Python advisory embedding worker."""

from __future__ import annotations

import httpx
import pytest

from src.config import settings
from src.main import app


SECRET = "s" * 32


@pytest.fixture(autouse=True)
def reset_settings() -> None:
    settings.shared_secret = SECRET
    settings.provider_api_key = "provider-test-key"
    settings.embedding_dimensions = 3
    settings.max_texts = 4
    settings.max_chars = 40


async def call(
    method: str,
    path: str,
    *,
    json: object | None = None,
    authorization: str | None = f"Bearer {SECRET}",
) -> httpx.Response:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        headers = {"content-type": "application/json"}
        if authorization is not None:
            headers["authorization"] = authorization
        return await client.request(method, path, json=json, headers=headers)


@pytest.mark.asyncio
async def test_health_is_public() -> None:
    response = await call("GET", "/health", authorization=None)
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "third-code-ai-worker"}


@pytest.mark.asyncio
async def test_embedding_requires_bearer_secret() -> None:
    response = await call(
        "POST", "/v1/embeddings", json={"texts": ["Copper pipe"]}, authorization=None
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_missing_provider_fails_closed() -> None:
    settings.provider_api_key = ""
    response = await call("POST", "/v1/embeddings", json={"texts": ["Copper pipe"]})
    assert response.status_code == 503
    assert response.json() == {"detail": "AI provider is not configured"}


@pytest.mark.asyncio
async def test_validation_does_not_echo_input() -> None:
    response = await call(
        "POST",
        "/v1/embeddings",
        json={"texts": ["x" * 41]},
    )
    assert response.status_code == 422
    assert response.json() == {"error": "Invalid AI worker request"}
    assert "x" * 41 not in response.text


@pytest.mark.asyncio
async def test_provider_vectors_are_ordered_and_returned(monkeypatch: pytest.MonkeyPatch) -> None:
    async def provider(_texts: list[str]) -> dict[str, object]:
        return {
            "data": [
                {"index": 1, "embedding": [0.4, 0.5, 0.6]},
                {"index": 0, "embedding": [0.1, 0.2, 0.3]},
            ]
        }

    monkeypatch.setattr("src.main.request_embeddings", provider)
    response = await call(
        "POST",
        "/v1/embeddings",
        json={"texts": ["Copper pipe", "Valve"]},
    )
    assert response.status_code == 200
    assert response.json() == {
        "schema_version": 1,
        "model": "text-embedding-3-small",
        "dimensions": 3,
        "embeddings": [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]],
    }


@pytest.mark.asyncio
async def test_invalid_provider_vector_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    async def provider(_texts: list[str]) -> dict[str, object]:
        return {"data": [{"index": 0, "embedding": [0.1, 0.2]}]}

    monkeypatch.setattr("src.main.request_embeddings", provider)
    response = await call(
        "POST", "/v1/embeddings", json={"texts": ["Copper pipe"]}
    )
    assert response.status_code == 503
    assert response.json() == {"detail": "AI provider is unavailable"}


@pytest.mark.asyncio
async def test_grounded_answer_is_provider_free_and_citation_bounded() -> None:
    settings.provider_api_key = ""
    response = await call(
        "POST",
        "/v1/cortex/grounded-answer",
        json={
            "question": "Which copper pipe changed?",
            "evidence": [
                {
                    "node_id": "11111111-1111-4111-8111-111111111111",
                    "node_type": "bom",
                    "title": "Copper pipe package",
                    "summary": "Updated today",
                },
                {
                    "node_id": "22222222-2222-4222-8222-222222222222",
                    "node_type": "account",
                    "title": "Unrelated supplier",
                    "summary": None,
                },
            ],
        },
    )
    assert response.status_code == 200
    assert response.json() == {
        "schema_version": 1,
        "model": "deterministic-grounded-v1",
        "content": (
            "Here's what I found in your knowledge graph:\n\n"
            "• [bom] Copper pipe package — Updated today\n\n"
            "Cited 1 record — open any from the graph to dig in."
        ),
        "citation_node_ids": ["11111111-1111-4111-8111-111111111111"],
    }


@pytest.mark.asyncio
async def test_grounded_answer_validation_does_not_echo_question() -> None:
    secret_question = "q" * 20_001
    response = await call(
        "POST",
        "/v1/cortex/grounded-answer",
        json={"question": secret_question, "evidence": []},
    )
    assert response.status_code == 422
    assert response.json() == {"error": "Invalid AI worker request"}
    assert secret_question not in response.text
