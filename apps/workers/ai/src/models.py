"""Bounded wire contracts for advisory embeddings."""

from pydantic import BaseModel, Field, field_validator

from src.config import settings


class EmbeddingRequest(BaseModel):
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


class EmbeddingResponse(BaseModel):
    schema_version: int = 1
    model: str
    dimensions: int
    embeddings: list[list[float]]
