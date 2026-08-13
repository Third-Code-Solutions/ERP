"""ABI OPS evidence-only CAD parser service.

The service reads one short-lived exact-object URL, extracts bounded evidence,
and returns it. Official tenant/database writes belong to NestJS/Next.js.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import sys

from fastapi import FastAPI, Header, HTTPException

from src.config import settings
from src.models import EvidenceItem, ParseRequest, ParseResult, ScopeItem
from src.parsers.dwg_converter import (
    DwgConversionError,
    convert_dwg_to_dxf,
    is_available as dwg_available,
)
from src.parsers.ezdxf_extractor import Extractor
from src.storage import download_source

logging.basicConfig(stream=sys.stdout, level=logging.INFO)
logger = logging.getLogger("cad-parser")

app = FastAPI(title="ABI OPS CAD Parser", version="0.3.0")


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


def _evidence_item(item: ScopeItem, index: int) -> EvidenceItem:
    """Normalize extractor output and derive stable, content-based identity."""

    raw = item.model_dump()
    code = raw.get("code")
    code = code.strip() if isinstance(code, str) else None
    description = str(raw.get("description", "")).strip()
    unit = str(raw.get("unit", "")).strip()
    notes = raw.get("notes")
    notes = notes.strip() if isinstance(notes, str) and notes.strip() else None
    quantity = int(raw.get("quantity", 0))
    unit_cost = int(raw.get("unit_cost_cents", 0))

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
    return EvidenceItem(
        item_key=item_key,
        code=code,
        description=description,
        unit=unit,
        quantity=quantity,
        recommended_unit_cost_cents=unit_cost,
        notes=notes,
    )


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
