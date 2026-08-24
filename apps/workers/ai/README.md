# ABI OPS AI Worker

Private FastAPI advisory service for embeddings. It returns model-derived
evidence only. It has no PostgreSQL, Supabase, Storage, tenant, approval, or
ERP transaction authority.

## Contract

`GET /health` is public and returns service liveness.

`POST /v1/embeddings` requires `Authorization: Bearer <AI_WORKER_SHARED_SECRET>`
and accepts a bounded body:

```json
{"texts":["Copper pipe | Unit: m | Unit cost: 125.50 PHP"]}
```

Response preserves provider order by input index and includes `schema_version`,
model, dimensions, and vectors. Submitted text is never logged or echoed by
validation errors.

`POST /v1/cortex/grounded-answer` uses the same bearer secret. It accepts one
redacted question plus bounded, tenant-authorized evidence selected by NestJS.
This endpoint is deterministic and provider-free: it returns advisory text,
source node IDs, and model identifier `deterministic-grounded-v1`. NestJS alone
rechecks permissions and commits the official assistant message.

## Run locally

Python 3.12 is the supported runtime. Use the committed `uv.lock`; do not
resolve from the open lower bounds during a build or test run.

```powershell
uv sync --frozen --extra dev
uv run --frozen --extra dev pytest -q
uv run --frozen uvicorn src.main:app --reload --port 8001
```

`requirements.lock` and `requirements-dev.lock` are hashed exports for build
systems that cannot consume `uv.lock`. Regenerate all three artifacts only from
Python 3.12, then verify them before committing:

```powershell
uv lock --python 3.12
uv export --frozen --no-dev --no-emit-project --format requirements-txt --output-file requirements.lock
uv export --frozen --extra dev --no-emit-project --format requirements-txt --output-file requirements-dev.lock
uv lock --check
```

Configure `AI_WORKER_URL` and `AI_WORKER_SHARED_SECRET` in the trusted Next or
NestJS runtime that calls the applicable endpoint. If `AI_WORKER_URL` is absent,
the existing TypeScript embedding provider remains the compatibility fallback.
Do not expose this service directly to browsers.

## Deployment

`Dockerfile` and `railway.toml` support a separately controlled Railway
service. Do not deploy or enable it as part of a routine Vercel release. Set
the provider key and worker secret only in the private service environment.
The image uses the immutable Python 3.12 Alpine 3.23 base digest, installs only
the hashed runtime export, and runs as unprivileged UID/GID 10001.
