"""ABI OPS evidence-only CAD parser service.

The service reads one short-lived exact-object URL, extracts bounded evidence,
and returns it. Official tenant/database writes belong to NestJS/Next.js.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import math
import sys
import time

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import ValidationError

from src.config import settings
from src.models import (
    EvidenceItem,
    ParseRequest,
    ParseResult,
    PrivateEvidenceItem,
    PrivateEvidenceRequest,
    PrivateEvidenceResult,
    ScopeItem,
)
from src.parsers.dwg_converter import (
    DwgConversionError,
    convert_dwg_to_dxf,
    is_available as dwg_available,
)
from src.parsers.ezdxf_extractor import Extractor
from src.storage import download_signed_url, download_source

logging.basicConfig(stream=sys.stdout, level=logging.INFO)
logger = logging.getLogger("cad-parser")

app = FastAPI(title="ABI OPS CAD Parser", version="0.3.0")

PRIVATE_EVIDENCE_MAX_BODY_BYTES = 64 * 1024


def _check_auth(authorization: str | None) -> None:
    """Require private endpoint authentication, including in production."""

    expected = settings.parser_shared_secret
    if not expected:
        if settings.allow_unauthenticated_local:
            return
        raise HTTPException(status_code=503, detail="Parser authentication is not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    presented = authorization[len("Bearer ") :]
    try:
        matches = hmac.compare_digest(
            presented.encode("ascii"), expected.encode("ascii")
        )
    except UnicodeEncodeError:
        matches = False
    if not matches:
        raise HTTPException(status_code=401, detail="Invalid bearer token")


def _check_evidence_signature(
    raw_body: bytes,
    job_id: str,
    request_timestamp: str | None,
    request_id: str | None,
    signature: str | None,
) -> None:
    """Verify an exact-body, short-lived Core-to-worker HMAC signature."""

    expected_secret = settings.parser_shared_secret
    if not expected_secret or len(expected_secret) < 20:
        raise HTTPException(
            status_code=503, detail="Private evidence bridge is not configured"
        )
    if not request_timestamp or not request_id or not signature:
        raise HTTPException(status_code=401, detail="Missing evidence signature")
    if request_id != job_id:
        raise HTTPException(status_code=401, detail="Mismatched evidence request")
    if not request_timestamp.isascii() or not request_timestamp.isdigit():
        raise HTTPException(status_code=401, detail="Invalid evidence timestamp")

    timestamp = int(request_timestamp)
    if abs(int(time.time()) - timestamp) > 300:
        raise HTTPException(status_code=401, detail="Expired evidence signature")

    try:
        provided_signature = signature.encode("ascii")
    except UnicodeEncodeError as exc:
        raise HTTPException(
            status_code=401, detail="Invalid evidence signature"
        ) from exc

    signed = f"{request_timestamp}.{request_id}.".encode("utf-8") + raw_body
    expected_signature = hmac.new(
        expected_secret.encode("utf-8"), signed, hashlib.sha256
    ).hexdigest().encode("ascii")
    if not hmac.compare_digest(provided_signature, expected_signature):
        raise HTTPException(status_code=401, detail="Invalid evidence signature")


def _normalized_evidence_payload(item: ScopeItem, index: int) -> dict[str, object]:
    """Normalize extractor output and derive stable, content-based identity."""

    raw = item.model_dump()
    code = raw.get("code")
    code = code.strip() if isinstance(code, str) else None
    description = str(raw.get("description", "")).strip()
    unit = str(raw.get("unit", "")).strip()
    notes = raw.get("notes")
    notes = notes.strip() if isinstance(notes, str) and notes.strip() else None
    raw_quantity = raw.get("quantity", 0)
    if (
        isinstance(raw_quantity, bool)
        or not isinstance(raw_quantity, (int, float))
        or not math.isfinite(raw_quantity)
        or not float(raw_quantity).is_integer()
    ):
        raise ValueError(
            "Fractional CAD quantities require decimal BOM precision before they can be emitted"
        )
    quantity = int(raw_quantity)
    raw_unit_cost = raw.get("unit_cost_cents", 0)
    if (
        isinstance(raw_unit_cost, bool)
        or not isinstance(raw_unit_cost, (int, float))
        or not math.isfinite(raw_unit_cost)
        or not float(raw_unit_cost).is_integer()
    ):
        raise ValueError("CAD unit costs must be finite integer centavos")
    unit_cost = int(raw_unit_cost)

    canonical = json.dumps(
        {
            "code": code,
            "description": description,
            "unit": unit,
            "quantity": quantity,
            "recommended_unit_cost_cents": unit_cost,
            "notes": notes,
            "occurrence": index,
        },
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    item_key = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return {
        "item_key": item_key,
        "code": code,
        "description": description,
        "unit": unit,
        "quantity": quantity,
        "recommended_unit_cost_cents": unit_cost,
        "notes": notes,
    }


def _evidence_item(item: ScopeItem, index: int) -> EvidenceItem:
    """Map normalized evidence into the legacy bearer-route contract."""

    return EvidenceItem(**_normalized_evidence_payload(item, index))


def _private_evidence_item(item: ScopeItem, index: int) -> PrivateEvidenceItem:
    """Map normalized evidence into the signed Core-to-worker contract."""

    return PrivateEvidenceItem(**_normalized_evidence_payload(item, index))


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "dwg_support": dwg_available(),
        "evidence_only": True,
    }


@app.post("/parse", response_model=ParseResult)
async def parse(
    req: ParseRequest,
    authorization: str | None = Header(default=None),
) -> ParseResult:
    _check_auth(authorization)

    logger.info(
        "Parsing CAD evidence: job_id=%s attempt=%s source_format=%s",
        req.job_id,
        req.attempt,
        req.source_format,
    )

    try:
        raw_bytes, actual_sha256 = await download_source(
            str(req.source_url), max_bytes=req.max_bytes
        )
    except Exception as exc:
        logger.error("Source download failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Source download failed") from exc

    if not hmac.compare_digest(actual_sha256, req.source_sha256):
        raise HTTPException(status_code=422, detail="Source hash mismatch")

    dxf_bytes = raw_bytes
    if req.source_format == "dwg":
        try:
            dxf_bytes = convert_dwg_to_dxf(raw_bytes)
        except DwgConversionError as exc:
            logger.error("DWG conversion failed: %s", type(exc).__name__)
            raise HTTPException(status_code=415, detail="DWG conversion failed") from exc

    try:
        extractor = Extractor()
        extracted = extractor.extract(dxf_bytes)
        if len(extracted) > req.max_items:
            raise HTTPException(
                status_code=422, detail="Extraction exceeds configured item limit"
            )
        items = [_evidence_item(item, index) for index, item in enumerate(extracted)]
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("CAD extraction failed: %s", type(exc).__name__)
        raise HTTPException(status_code=422, detail="CAD extraction failed") from exc

    warnings = [str(warning)[:500] for warning in extractor.warnings[:100]]
    return ParseResult(
        job_id=req.job_id,
        attempt=req.attempt,
        source_sha256=actual_sha256,
        producer={"name": "abi-ops-cad-extractor", "version": "0.3.0"},
        source_format=req.source_format,
        items=items,
        warnings=warnings,
    )


@app.post("/parse-evidence", response_model=PrivateEvidenceResult)
async def parse_evidence(
    request: Request,
    request_timestamp: str | None = Header(
        default=None, alias="X-Third-Code-Request-Timestamp"
    ),
    request_id: str | None = Header(
        default=None, alias="X-Third-Code-Request-Id"
    ),
    signature: str | None = Header(
        default=None, alias="X-Third-Code-Request-Signature"
    ),
) -> PrivateEvidenceResult:
    """Return bounded evidence only after Core authenticates the exact body."""

    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            declared_body_size = int(content_length)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid content length") from exc
        if declared_body_size < 0 or declared_body_size > PRIVATE_EVIDENCE_MAX_BODY_BYTES:
            raise HTTPException(status_code=413, detail="Evidence request is too large")

    raw_body = await request.body()
    if len(raw_body) > PRIVATE_EVIDENCE_MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="Evidence request is too large")

    try:
        req = PrivateEvidenceRequest.model_validate_json(raw_body, strict=True)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="Invalid evidence request") from exc

    _check_evidence_signature(
        raw_body,
        str(req.job_id),
        request_timestamp,
        request_id,
        signature,
    )

    logger.info(
        "Parsing signed CAD evidence: job_id=%s attempt=%s source_format=%s",
        req.job_id,
        req.attempt,
        req.source_format,
    )

    try:
        raw_bytes = await download_signed_url(
            str(req.source_url), req.limits.max_bytes
        )
    except Exception as exc:
        logger.error(
            "Signed source download failed: job_id=%s attempt=%s error=%s",
            req.job_id,
            req.attempt,
            type(exc).__name__,
        )
        raise HTTPException(status_code=502, detail="Source download failed") from exc

    source_sha256 = hashlib.sha256(raw_bytes).hexdigest()
    dxf_bytes = raw_bytes
    if req.source_format == "dwg":
        try:
            dxf_bytes = convert_dwg_to_dxf(raw_bytes)
        except DwgConversionError as exc:
            logger.error(
                "DWG conversion failed: job_id=%s attempt=%s error=%s",
                req.job_id,
                req.attempt,
                type(exc).__name__,
            )
            raise HTTPException(status_code=415, detail="DWG conversion failed") from exc

    try:
        extractor = Extractor()
        extracted = extractor.extract(dxf_bytes)
        if len(extracted) > req.limits.max_items:
            raise HTTPException(
                status_code=422, detail="Extraction exceeds configured item limit"
            )
        items = [
            _private_evidence_item(item, index)
            for index, item in enumerate(extracted)
        ]
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "CAD evidence extraction failed: job_id=%s attempt=%s error=%s",
            req.job_id,
            req.attempt,
            type(exc).__name__,
        )
        raise HTTPException(status_code=422, detail="CAD extraction failed") from exc

    warnings = [str(warning)[:500] for warning in extractor.warnings[:100]]
    return PrivateEvidenceResult(
        job_id=req.job_id,
        attempt=req.attempt,
        source_sha256=source_sha256,
        producer={"name": "third-code-cad-extractor", "version": "0.3.0"},
        source_format=req.source_format,
        items=items,
        warnings=warnings,
    )
