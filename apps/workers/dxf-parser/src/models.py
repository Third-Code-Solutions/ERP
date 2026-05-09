from pydantic import BaseModel


class ParseRequest(BaseModel):
    document_id: str
    project_id: str
    tenant_id: str
    storage_path: str


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
    warnings: list[str]
