"""DXF Parser Service — FastAPI entrypoint.

POST /parse
  Body: ParseRequest JSON
  Returns: ParseResult JSON

GET /health
  Returns: {"status": "ok"}
"""

from __future__ import annotations

import logging
import sys

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.db import write_scope_items
from src.models import ParseRequest, ParseResult
from src.parsers.ezdxf_extractor import Extractor
from src.storage import download_file

logging.basicConfig(stream=sys.stdout, level=logging.INFO)
logger = logging.getLogger("dxf-parser")

app = FastAPI(title="BuildOps DXF Parser", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Inngest calls from their infrastructure
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/parse", response_model=ParseResult)
async def parse(req: ParseRequest) -> ParseResult:
    logger.info("Parsing DXF: document_id=%s storage_path=%s", req.document_id, req.storage_path)

    try:
        dxf_bytes = await download_file(req.storage_path)
    except Exception as exc:
        logger.error("Storage download failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Storage download failed: {exc}") from exc

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
    )
