from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    supabase_url: str
    supabase_service_role_key: str
    storage_bucket: str = "documents"
    log_level: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()  # type: ignore[call-arg]
