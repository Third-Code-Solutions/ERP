"""CAD Parser Service — FastAPI entrypoint.

POST /parse
  Body: ParseRequest JSON (supports DXF and DWG via `format` field)
  Header: Authorization: Bearer <PARSER_SHARED_SECRET> (when configured)
  Returns: ParseResult JSON

GET /health
  Returns: {"status": "ok", "dwg_support": true|false}
"""

from __future__ import annotations

import hmac
import logging
import sys

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.models import ParseRequest, ParseResult
from src.parsers.dwg_converter import (
    DwgConversionError,
    convert_dwg_to_dxf,
    is_available as dwg_available,
)
from src.parsers.ezdxf_extractor import Extractor
from src.storage import download_file

logging.basicConfig(stream=sys.stdout, level=logging.INFO)
logger = logging.getLogger("cad-parser")

app = FastAPI(title="Third Code ERP CAD Parser", version="0.2.0")

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
