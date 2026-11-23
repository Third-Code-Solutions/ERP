"""Private evidence endpoint contract tests."""

import hashlib
import hmac
import json
import os
import time

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")

import httpx
import pytest
import ezdxf

from src.config import settings
from src.main import _normalized_evidence_payload, app
from src.models import ScopeItem


def dxf_bytes() -> bytes:
    document = ezdxf.new("R2010")
    document.modelspace().add_text("OFFICE 1A", dxfattribs={"layer": "ANNOT"})
    import io

    stream = io.StringIO()
    document.write(stream)
    return stream.getvalue().encode("utf-8")


def signed_headers(
    body: bytes, job_id: str, secret: str, timestamp: int | None = None
) -> dict[str, str]:
    timestamp = str(int(time.time()) if timestamp is None else timestamp)
    signature = hmac.new(
        secret.encode(),
        f"{timestamp}.{job_id}.".encode() + body,
        hashlib.sha256,
    ).hexdigest()
    return {
        "X-Third-Code-Request-Timestamp": timestamp,
        "X-Third-Code-Request-Id": job_id,
        "X-Third-Code-Request-Signature": signature,
    }


@pytest.mark.asyncio
async def test_private_endpoint_requires_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    settings.parser_shared_secret = "s" * 20
    body = json.dumps(
        {
            "job_id": "11111111-1111-4111-8111-111111111111",
            "attempt": 1,
            "source_url": "https://storage.example.test/object/plan.dxf",
            "source_format": "dxf",
            "file_name": "plan.dxf",
            "limits": {"max_bytes": 100 * 1024 * 1024, "max_items": 5_000},
        }
    ).encode()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/parse-evidence",
            content=body,
            headers={"content-type": "application/json"},
        )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_private_endpoint_returns_hash_linked_evidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "s" * 20
    settings.parser_shared_secret = secret

    async def download(_source_url: str, _max_bytes: int) -> bytes:
        return source_bytes

    monkeypatch.setattr("src.main.download_signed_url", download)
    source_bytes = dxf_bytes()
    payload = {
        "job_id": "22222222-2222-4222-8222-222222222222",
        "attempt": 1,
        "source_url": "https://storage.example.test/object/plan.dxf",
        "source_format": "dxf",
        "file_name": "plan.dxf",
        "limits": {"max_bytes": 100 * 1024 * 1024, "max_items": 5_000},
    }
    body = json.dumps(payload).encode()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/parse-evidence",
            content=body,
            headers={
                "content-type": "application/json",
                **signed_headers(body, payload["job_id"], secret),
            },
        )

    assert response.status_code == 200
    result = response.json()
    assert result["schema_version"] == 1
    assert result["job_id"] == payload["job_id"]
    assert result["source_sha256"] == hashlib.sha256(source_bytes).hexdigest()
    assert result["producer"]["name"] == "third-code-cad-extractor"
    assert result["items"][0]["item_key"]
    assert "tenant_id" not in result
    assert "source_url" not in result


@pytest.mark.asyncio
async def test_private_endpoint_rejects_a_tampered_signed_body() -> None:
    secret = "s" * 20
    settings.parser_shared_secret = secret
    payload = {
        "job_id": "33333333-3333-4333-8333-333333333333",
        "attempt": 1,
        "source_url": "https://storage.example.test/object/plan.dxf",
        "source_format": "dxf",
        "file_name": "plan.dxf",
        "limits": {"max_bytes": 100 * 1024 * 1024, "max_items": 5_000},
    }
    signed_body = json.dumps(payload).encode()
    tampered_body = signed_body + b" "
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/parse-evidence",
            content=tampered_body,
            headers={
                "content-type": "application/json",
                **signed_headers(signed_body, payload["job_id"], secret),
            },
        )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_private_endpoint_rejects_an_expired_signature() -> None:
    secret = "s" * 20
    settings.parser_shared_secret = secret
    payload = {
        "job_id": "55555555-5555-4555-8555-555555555555",
        "attempt": 1,
        "source_url": "https://storage.example.test/object/plan.dxf",
        "source_format": "dxf",
        "file_name": "plan.dxf",
        "limits": {"max_bytes": 100 * 1024 * 1024, "max_items": 5_000},
    }
    body = json.dumps(payload).encode()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/parse-evidence",
            content=body,
            headers={
                "content-type": "application/json",
                **signed_headers(
                    body,
                    payload["job_id"],
                    secret,
                    timestamp=int(time.time()) - 301,
                ),
            },
        )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_private_endpoint_emits_fractional_evidence_at_four_places(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "s" * 20
    settings.parser_shared_secret = secret

    async def download(_source_url: str, _max_bytes: int) -> bytes:
        return b"fractional-source"

    def extract_fractional(_self: object, _source: bytes) -> list[ScopeItem]:
        return [
            ScopeItem(
                code=None,
                description="Fractional area",
                unit="sqm",
                quantity=12.3456789,
                unit_cost_cents=0,
                notes=None,
            )
        ]

    monkeypatch.setattr("src.main.download_signed_url", download)
    monkeypatch.setattr("src.main.Extractor.extract", extract_fractional)
    payload = {
        "job_id": "44444444-4444-4444-8444-444444444444",
        "attempt": 1,
        "source_url": "https://storage.example.test/object/plan.dxf",
        "source_format": "dxf",
        "file_name": "plan.dxf",
        "limits": {"max_bytes": 100 * 1024 * 1024, "max_items": 5_000},
    }
    body = json.dumps(payload).encode()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/parse-evidence",
            content=body,
            headers={
                "content-type": "application/json",
                **signed_headers(body, payload["job_id"], secret),
            },
        )

    assert response.status_code == 200
    assert response.json()["items"][0]["quantity"] == 12.3457


def scope_item(quantity: float) -> ScopeItem:
    return ScopeItem(
        code=None,
        description="Floor area",
        unit="sqm",
        quantity=quantity,
        unit_cost_cents=0,
        notes=None,
    )


def test_evidence_quantity_rounds_half_up_to_four_places() -> None:
    assert _normalized_evidence_payload(scope_item(12.3456789), 0)["quantity"] == 12.3457
    # 2.00005 is stored as 2.0000499..., so round() gives 2.0; the drawing's
    # decimal value rounds half-up.
    assert _normalized_evidence_payload(scope_item(2.00005), 0)["quantity"] == 2.0001
    whole = _normalized_evidence_payload(scope_item(3), 0)["quantity"]
    assert whole == 3 and isinstance(whole, int)


def test_fractional_polygon_area_becomes_four_place_evidence() -> None:
    import io

    from src.parsers.ezdxf_extractor import Extractor

    document = ezdxf.new("R2010")
    document.modelspace().add_lwpolyline(
        [(0, 0), (12.3456789, 0), (12.3456789, 1), (0, 1)],
        close=True,
        dxfattribs={"layer": "ARCH-ROOM"},
    )
    stream = io.StringIO()
    document.write(stream)
    extracted = Extractor().extract(stream.getvalue().encode("utf-8"))
    areas = [item for item in extracted if item.unit == "sqm"]

    assert len(areas) == 1
    assert _normalized_evidence_payload(areas[0], 0)["quantity"] == 12.3457


def test_evidence_item_key_depends_only_on_the_rounded_quantity() -> None:
    first = _normalized_evidence_payload(scope_item(12.3456789), 0)
    same = _normalized_evidence_payload(scope_item(12.34571), 0)
    other = _normalized_evidence_payload(scope_item(12.3458), 0)

    assert first["item_key"] == same["item_key"]
    assert first["item_key"] != other["item_key"]
    assert _normalized_evidence_payload(scope_item(12.3456789), 0) == first


@pytest.mark.parametrize("quantity", [float("nan"), float("inf"), -1.0])
def test_evidence_quantity_rejects_non_finite_and_negative(quantity: float) -> None:
    with pytest.raises(ValueError):
        _normalized_evidence_payload(scope_item(quantity), 0)
