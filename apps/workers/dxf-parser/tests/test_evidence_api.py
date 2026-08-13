"""Evidence API boundary tests.

These tests deliberately mock source retrieval and extraction. No database or
Supabase credential is needed because worker has no official write authority.
"""

import hashlib

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from src.config import settings
from src.main import _check_auth, app
from src.models import ScopeItem


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def request_body(
    source_sha256: str, *, source_format: str = "dwg"
) -> dict[str, object]:
    return {
        "job_id": "11111111-1111-4111-8111-111111111111",
        "attempt": 1,
        "source_url": "https://storage.example/signed-object?token=one-time",
        "source_sha256": source_sha256,
        "source_format": source_format,
        "file_name": "drawing.dwg",
    }


def test_health_declares_evidence_only(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["evidence_only"] is True


def test_parse_fails_closed_without_worker_secret(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "parser_shared_secret", "")
    monkeypatch.setattr(settings, "allow_unauthenticated_local", False)

    response = client.post(
        "/parse",
        json=request_body(hashlib.sha256(b"source").hexdigest()),
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "Parser authentication is not configured"}


def test_parse_returns_bounded_evidence_without_database_write(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = b"source"
    source_hash = hashlib.sha256(source).hexdigest()
    monkeypatch.setattr(settings, "parser_shared_secret", "worker-secret")
    monkeypatch.setattr(settings, "allow_unauthenticated_local", False)

    async def fake_download_source(source_url: str, *, max_bytes: int) -> tuple[bytes, str]:
        assert source_url.startswith("https://storage.example/")
        assert max_bytes == 100 * 1024 * 1024
        return source, source_hash

    class FakeExtractor:
        warnings: list[str] = ["minor layer warning"]

        def extract(self, _source: bytes) -> list[ScopeItem]:
            return [
                ScopeItem(
                    code="AHU-01",
                    description="Air Handling Unit",
                    unit="unit",
                    quantity=2,
                    unit_cost_cents=0,
                    notes=None,
                )
            ]

    monkeypatch.setattr("src.main.download_source", fake_download_source)
    monkeypatch.setattr("src.main.Extractor", FakeExtractor)

    response = client.post(
        "/parse",
        headers={"Authorization": "Bearer worker-secret"},
        json=request_body(source_hash, source_format="dxf"),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_sha256"] == source_hash
    assert payload["source_format"] == "dxf"
    assert payload["items"][0]["quantity"] == 2
    assert len(payload["items"][0]["item_key"]) == 64
    assert "tenant_id" not in payload
    assert "project_id" not in payload
    assert "storage_path" not in payload
    assert "count" not in payload


def test_parse_rejects_non_ascii_bearer_token_without_server_error(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "parser_shared_secret", "worker-secret")
    monkeypatch.setattr(settings, "allow_unauthenticated_local", False)

    with pytest.raises(HTTPException) as exc_info:
        _check_auth("Bearer \ufeffworker-secret")

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid bearer token"


def test_parse_rejects_source_hash_mismatch(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = b"source"
    monkeypatch.setattr(settings, "parser_shared_secret", "worker-secret")

    async def fake_download_source(_source_url: str, *, max_bytes: int) -> tuple[bytes, str]:
        return source, hashlib.sha256(source).hexdigest()

    monkeypatch.setattr("src.main.download_source", fake_download_source)

    response = client.post(
        "/parse",
        headers={"Authorization": "Bearer worker-secret"},
        json=request_body("0" * 64),
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "Source hash mismatch"}
