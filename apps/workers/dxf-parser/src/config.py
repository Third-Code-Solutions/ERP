"""Worker config — accepts both worker-style (SUPABASE_URL) and web-style
(NEXT_PUBLIC_SUPABASE_URL) env var names so the same .env.local from the web
app can be reused without renaming.
"""

import os

from pydantic_settings import BaseSettings


def _get_supabase_url() -> str:
    return (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        or ""
    )


class Settings(BaseSettings):
    database_url: str
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    storage_bucket: str = "documents"
    log_level: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()  # type: ignore[call-arg]

# Fall back to NEXT_PUBLIC_* when worker-specific names are not set
if not settings.supabase_url:
    settings.supabase_url = _get_supabase_url()
if not settings.supabase_service_role_key:
    settings.supabase_service_role_key = os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY", ""
    )

if not settings.supabase_url:
    raise RuntimeError(
        "supabase_url is required (set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL)"
    )
if not settings.supabase_service_role_key:
    raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required")

# Strip postgres-js / pgbouncer query params that psycopg rejects.
# Drizzle/postgres-js uses ?pgbouncer=true to disable prepared statements when
# connecting through the Supabase transaction pooler. psycopg treats unknown
# query keys as errors.
if settings.database_url:
    import re

    settings.database_url = re.sub(
        r"([?&])pgbouncer=true(&)?",
        lambda m: m.group(1) if m.group(2) else "",
        settings.database_url,
    )
    settings.database_url = settings.database_url.rstrip("?&")
