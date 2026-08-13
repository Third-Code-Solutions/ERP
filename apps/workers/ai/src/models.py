"""Bounded wire contracts for advisory AI analysis."""

from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.config import settings


class WorkerModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EmbeddingRequest(WorkerModel):
    texts: list[str] = Field(min_length=1, max_length=128)

    @field_validator("texts")
    @classmethod
    def validate_texts(cls, values: list[str]) -> list[str]:
        if len(values) > settings.max_texts:
            raise ValueError("too many texts")
        normalized = []
        for value in values:
            text = value.strip()
            if not text:
                raise ValueError("text must not be empty")
            if len(text) > settings.max_chars:
                raise ValueError("text exceeds configured limit")
            normalized.append(text)
        return normalized


class EmbeddingResponse(WorkerModel):
    schema_version: int = 1
    model: str
    dimensions: int
    embeddings: list[list[float]]


class GroundedEvidence(WorkerModel):
    node_id: str = Field(
        pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
    )
    node_type: str = Field(min_length=1, max_length=64)
    title: str | None = Field(default=None, max_length=500)
    summary: str | None = Field(default=None, max_length=4_000)


class GroundedAnswerRequest(WorkerModel):
    question: str = Field(min_length=1, max_length=20_000)
    evidence: list[GroundedEvidence] = Field(max_length=12)

    @field_validator("question")
    @classmethod
    def normalize_question(cls, value: str) -> str:
        question = value.strip()
        if not question:
            raise ValueError("question must not be empty")
        return question

    @field_validator("evidence")
    @classmethod
    def unique_evidence(
        cls, values: list[GroundedEvidence]
    ) -> list[GroundedEvidence]:
        ids = [value.node_id for value in values]
        if len(set(ids)) != len(ids):
            raise ValueError("evidence IDs must be unique")
        return values


class GroundedAnswerResponse(WorkerModel):
    schema_version: int = 1
    model: str = "deterministic-grounded-v1"
    content: str
    citation_node_ids: list[str]
