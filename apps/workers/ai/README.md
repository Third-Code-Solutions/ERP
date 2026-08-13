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

```bash
python -m venv .venv
.venv/Scripts/pip install -e ".[dev]"
uvicorn src.main:app --reload --port 8001
```

Configure `AI_WORKER_URL` and `AI_WORKER_SHARED_SECRET` in the trusted Next or
NestJS runtime that calls the applicable endpoint. If `AI_WORKER_URL` is absent,
the existing TypeScript embedding provider remains the compatibility fallback.
Do not expose this service directly to browsers.

## Deployment

`Dockerfile` and `railway.toml` support a separately controlled Railway
service. Do not deploy or enable it as part of a routine Vercel release. Set
the provider key and worker secret only in the private service environment.
