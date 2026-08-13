from typing import Literal
from uuid import UUID

from pydantic import AnyHttpUrl, BaseModel, Field


CadFormat = Literal["dxf", "dwg"]


class ScopeItem(BaseModel):
    """Extractor-internal item before evidence normalization."""

    code: str | None
    description: str
    unit: str
    quantity: int
    unit_cost_cents: int
    notes: str | None


class ParseRequest(BaseModel):
    """Evidence-only request issued by the official processing authority."""

    job_id: UUID
    attempt: int = Field(default=1, ge=1, le=10)
    source_url: AnyHttpUrl
    source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    source_format: CadFormat
    file_name: str = Field(min_length=1, max_length=255)
    max_bytes: int = Field(default=100 * 1024 * 1024, ge=1, le=100 * 1024 * 1024)
    max_items: int = Field(default=5_000, ge=1, le=5_000)


class EvidenceItem(BaseModel):
    item_key: str = Field(pattern=r"^[0-9a-f]{64}$")
    code: str | None = Field(default=None, max_length=120)
    description: str = Field(min_length=1, max_length=500)
    unit: str = Field(min_length=1, max_length=64)
    quantity: int = Field(ge=1, le=1_000_000)
    recommended_unit_cost_cents: int = Field(ge=0, le=100_000_000_000)
    notes: str | None = Field(default=None, max_length=1_000)


class ParseResult(BaseModel):
    schema_version: Literal[1] = 1
    job_id: UUID
    attempt: int = Field(ge=1, le=10)
    source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    producer: dict[str, str]
    source_format: CadFormat
    parsed_format: Literal["dxf"] = "dxf"
    items: list[EvidenceItem] = Field(max_length=5_000)
    warnings: list[str] = Field(default_factory=list, max_length=100)
