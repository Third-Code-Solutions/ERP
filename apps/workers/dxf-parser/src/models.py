from typing import Literal

from pydantic import BaseModel, Field


CadFormat = Literal["dxf", "dwg"]


class ParseRequest(BaseModel):
    document_id: str
    project_id: str
    tenant_id: str
    storage_path: str
    # The CAD format we received. DWG is converted to DXF before extraction.
    # Defaults to 'dxf' for backward compatibility with the old event payload.
    format: CadFormat = "dxf"
    file_name: str | None = None


class ScopeItem(BaseModel):
    code: str | None
    description: str
    unit: str
    quantity: int
    unit_cost_cents: int  # default 0 — estimator fills in
    notes: str | None


class ParseResult(BaseModel):
    document_id: str
    scope_items: list[ScopeItem]
    count: int
    warnings: list[str] = Field(default_factory=list)
    # Format we actually parsed after any conversion. For DWG inputs this is
    # still "dxf" because we converted before extraction.
    parsed_format: CadFormat = "dxf"
    source_format: CadFormat = "dxf"
