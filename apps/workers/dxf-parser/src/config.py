"""Worker config — accepts both worker-style (SUPABASE_URL) and web-style
(NEXT_PUBLIC_SUPABASE_URL) env var names so the same .env.local from the web
app can be reused without renaming.
"""

import os

from pydantic_settings import BaseSettings, SettingsConfigDict


def _get_supabase_url() -> str:
    return (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        or ""
    )


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    storage_bucket: str = "documents"
    log_level: str = "INFO"
    # Shared secret enforced on /parse. When unset (local dev), the endpoint
    # still works without auth so existing run-local.sh keeps functioning.
    # In any deployed environment this MUST be set or /parse will refuse all
    # callers. The web app sends it via Authorization: Bearer <secret>.
    parser_shared_secret: str = ""

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()  # type: ignore[call-arg]

# Fall back to NEXT_PUBLIC_* when worker-specific names are not set
if not settings.supabase_url:
    settings.supabase_url = _get_supabase_url()
if not settings.supabase_service_role_key:
    settings.supabase_service_role_key = os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY", ""
    )
if not settings.parser_shared_secret:
    settings.parser_shared_secret = os.environ.get("PARSER_SHARED_SECRET", "")

if not settings.supabase_url:
    raise RuntimeError(
        "supabase_url is required (set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL)"
    )
