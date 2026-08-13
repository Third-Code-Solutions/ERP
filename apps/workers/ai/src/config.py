"""Environment configuration for the advisory AI worker."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    shared_secret: str = Field(
        default="", validation_alias="AI_WORKER_SHARED_SECRET"
    )
    provider_url: str = Field(
        default="https://api.openai.com/v1/embeddings",
        validation_alias="AI_PROVIDER_URL",
    )
    provider_api_key: str = Field(
        default="", validation_alias="AI_PROVIDER_API_KEY"
    )
    embedding_model: str = Field(
        default="text-embedding-3-small",
        validation_alias="AI_EMBEDDING_MODEL",
    )
    embedding_dimensions: int = Field(
        default=1536,
        ge=1,
        le=4096,
        validation_alias="AI_EMBEDDING_DIMENSIONS",
    )
    max_texts: int = Field(
        default=64, ge=1, le=128, validation_alias="AI_MAX_TEXTS"
    )
    max_chars: int = Field(
        default=8000, ge=1, le=16_000, validation_alias="AI_MAX_CHARS"
    )
    provider_timeout_seconds: float = Field(
        default=15.0,
        gt=0,
        le=60,
        validation_alias="AI_PROVIDER_TIMEOUT_SECONDS",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        populate_by_name=True,
    )


settings = Settings()  # type: ignore[call-arg]
