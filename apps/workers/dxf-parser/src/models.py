from typing import Literal
from uuid import UUID

from pydantic import AnyHttpUrl, BaseModel, Field


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


class EvidenceLimits(BaseModel):
    max_bytes: int = Field(default=100 * 1024 * 1024, gt=0, le=100 * 1024 * 1024)
    max_items: int = Field(default=5_000, gt=0, le=5_000)


class EvidenceRequest(BaseModel):
    """Private request accepted only from the signed NestJS boundary."""

    job_id: UUID
    attempt: int = Field(ge=1, le=5)
    source_url: AnyHttpUrl
    source_format: CadFormat
    file_name: str | None = Field(default=None, max_length=255)
    limits: EvidenceLimits = Field(default_factory=EvidenceLimits)


class EvidenceItem(BaseModel):
    item_key: str = Field(pattern=r"^[0-9a-f]{64}$")
    code: str | None = Field(default=None, max_length=50)
    description: str = Field(min_length=1, max_length=4_000)
    unit: str = Field(min_length=1, max_length=20)
    quantity: int = Field(gt=0, le=2_147_483_647)
    recommended_unit_cost_cents: int = Field(ge=0, le=9_000_000_000)
    notes: str | None = Field(default=None, max_length=2_000)


class EvidenceProducer(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    version: str = Field(min_length=1, max_length=100)


class EvidenceResult(BaseModel):
    schema_version: Literal[1] = 1
    job_id: UUID
    attempt: int = Field(ge=1, le=5)
    source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    producer: EvidenceProducer
    source_format: CadFormat
    parsed_format: CadFormat
    items: list[EvidenceItem] = Field(max_length=5_000)
    warnings: list[str] = Field(default_factory=list, max_length=100)
