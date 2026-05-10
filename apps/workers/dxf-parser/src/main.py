"""CAD Parser Service — FastAPI entrypoint.

POST /parse
  Body: ParseRequest JSON (supports DXF and DWG via `format` field)
  Returns: ParseResult JSON

GET /health
  Returns: {"status": "ok", "dwg_support": true|false}
"""

from __future__ import annotations

import logging
import sys

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.db import write_scope_items
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

app = FastAPI(title="BuildOps CAD Parser", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, object]:
    return {"status": "ok", "dwg_support": dwg_available()}


@app.post("/parse", response_model=ParseResult)
async def parse(req: ParseRequest) -> ParseResult:
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

    try:
        count = await write_scope_items(
            project_id=req.project_id,
            tenant_id=req.tenant_id,
            document_id=req.document_id,
            items=scope_items,
        )
    except Exception as exc:
        logger.error("DB write failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"DB write failed: {exc}") from exc

    logger.info("Wrote %d scope items for document %s", count, req.document_id)

    return ParseResult(
        document_id=req.document_id,
        scope_items=scope_items,
        count=count,
        warnings=extractor.warnings,
        parsed_format="dxf",
        source_format=fmt,
    )
