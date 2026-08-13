"""Worker configuration.

Worker is evidence-only. It receives short-lived source URLs and has no
database, Supabase Storage, or service-role credentials.
"""

import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    parser_shared_secret: str = ""
    allow_unauthenticated_local: bool = False


settings = Settings()  # type: ignore[call-arg]

# Explicit prefix avoids accepting an accidentally similarly named setting.
if os.environ.get("PARSER_ALLOW_UNAUTHENTICATED_LOCAL", "").lower() == "true":
    settings.allow_unauthenticated_local = True
