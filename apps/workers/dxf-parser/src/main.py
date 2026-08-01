"""CAD Parser Service — FastAPI entrypoint.

POST /parse
  Body: ParseRequest JSON (supports DXF and DWG via `format` field)
  Header: Authorization: Bearer <PARSER_SHARED_SECRET> (when configured)
  Returns: ParseResult JSON

GET /health
  Returns: {"status": "ok", "dwg_support": true|false}
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import sys
import time

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.models import EvidenceRequest, EvidenceResult, ParseRequest, ParseResult
from src.parsers.dwg_converter import (
    DwgConversionError,
    convert_dwg_to_dxf,
    is_available as dwg_available,
)
from src.parsers.ezdxf_extractor import Extractor
from src.storage import download_file, download_signed_url

logging.basicConfig(stream=sys.stdout, level=logging.INFO)
logger = logging.getLogger("cad-parser")

app = FastAPI(title="Third Code ERP CAD Parser", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


def _check_auth(authorization: str | None) -> None:
    """Verify the shared-secret bearer token when configured.

    Local dev (no PARSER_SHARED_SECRET set) skips auth so run-local.sh keeps
    working. Any deployment with the secret set rejects unauthenticated calls
    before downloading the file or touching the DB.
    """
    expected = settings.parser_shared_secret
    if not expected:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    presented = authorization[len("Bearer "):]
    if not hmac.compare_digest(presented, expected):
        raise HTTPException(status_code=401, detail="Invalid bearer token")


def _check_evidence_signature(
    raw_body: bytes,
    job_id: str,
    request_timestamp: str | None,
    request_id: str | None,
    signature: str | None,
) -> None:
    """Verify the request-bound HMAC before reading the signed object."""
    expected_secret = settings.parser_shared_secret
    if not expected_secret or len(expected_secret) < 20:
        raise HTTPException(
            status_code=503,
            detail="Private evidence bridge is not configured",
        )
    if not request_timestamp or not request_id or not signature:
        raise HTTPException(status_code=401, detail="Missing evidence signature")
    if request_id != job_id:
        raise HTTPException(status_code=401, detail="Mismatched evidence request")
    try:
        timestamp = int(request_timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid evidence timestamp") from exc
    if abs(int(time.time()) - timestamp) > 300:
        raise HTTPException(status_code=401, detail="Expired evidence signature")

    signed = f"{request_timestamp}.{request_id}.".encode() + raw_body
    expected_signature = hmac.new(
        expected_secret.encode(), signed, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        raise HTTPException(status_code=401, detail="Invalid evidence signature")


def _evidence_item_key(item: object, occurrence: int) -> str:
    """Stable identity for one bounded extraction item."""
    payload = {
        "item": item,
        "occurrence": occurrence,
    }
    canonical = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


@app.get("/health")
async def health() -> dict[str, object]:
    return {"status": "ok", "dwg_support": dwg_available()}


@app.post("/parse", response_model=ParseResult)
async def parse(
    req: ParseRequest,
    authorization: str | None = Header(default=None),
) -> ParseResult:
    _check_auth(authorization)

    # Resolve format from request, falling back to file extension if needed
    fmt = req.format
    if req.file_name:
        ext = req.file_name.rsplit(".", 1)[-1].lower()
        if ext in ("dxf", "dwg"):
            fmt = ext  # type: ignore[assignment]

    logger.info(
        "Parsing CAD: document_id=%s storage_path=%s format=%s",
        req.document_id,
        req.storage_path,
        fmt,
    )

    try:
        raw_bytes = await download_file(req.storage_path)
    except Exception as exc:
        logger.error("Storage download failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Storage download failed: {exc}") from exc

    # Normalize to DXF bytes regardless of source format
    if fmt == "dwg":
        try:
            dxf_bytes = convert_dwg_to_dxf(raw_bytes)
        except DwgConversionError as exc:
            logger.error("DWG conversion failed: %s", exc)
            raise HTTPException(status_code=415, detail=f"DWG conversion failed: {exc}") from exc
    else:
        dxf_bytes = raw_bytes

    extractor = Extractor()
    scope_items = extractor.extract(dxf_bytes)

    if extractor.warnings:
        logger.warning("Extraction warnings: %s", extractor.warnings)

    # Python is document-processing authority only. It returns extracted
    # evidence; the tenant-authorized application boundary commits it.
    count = len(scope_items)
    logger.info("Extracted %d scope items for document %s", count, req.document_id)

    return ParseResult(
        document_id=req.document_id,
        scope_items=scope_items,
        count=count,
        warnings=extractor.warnings,
        parsed_format="dxf",
        source_format=fmt,
    )


@app.post("/parse-evidence", response_model=EvidenceResult)
async def parse_evidence(
    req: EvidenceRequest,
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
) -> EvidenceResult:
    """Return bounded CAD evidence without database or service-role access."""
    raw_body = await request.body()
    _check_evidence_signature(
        raw_body,
        str(req.job_id),
        request_timestamp,
        request_id,
        signature,
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
    else:
        dxf_bytes = raw_bytes

    extractor = Extractor()
    scope_items = extractor.extract(dxf_bytes)
    if len(scope_items) > req.limits.max_items:
        raise HTTPException(status_code=413, detail="Extraction item limit exceeded")

    items = []
    for index, item in enumerate(scope_items):
        item_data = item.model_dump()
        items.append(
            {
                "item_key": _evidence_item_key(item_data, index),
                "code": item.code,
                "description": item.description,
                "unit": item.unit,
                "quantity": item.quantity,
                "recommended_unit_cost_cents": item.unit_cost_cents,
                "notes": item.notes,
            }
        )

    warnings = [warning[:500] for warning in extractor.warnings[:100]]
    logger.info(
        "Extracted evidence: job_id=%s attempt=%s items=%s source_format=%s",
        req.job_id,
        req.attempt,
        len(items),
        req.source_format,
    )
    return EvidenceResult(
        job_id=req.job_id,
        attempt=req.attempt,
        source_sha256=source_sha256,
        producer={"name": "third-code-cad-extractor", "version": "0.3.0"},
        source_format=req.source_format,
        parsed_format="dxf",
        items=items,
        warnings=warnings,
    )
