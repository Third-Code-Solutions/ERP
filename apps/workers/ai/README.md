# Third Code ERP AI Worker

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

## Run locally

```bash
python -m venv .venv
.venv/Scripts/pip install -e ".[dev]"
uvicorn src.main:app --reload --port 8001
```

Configure `AI_WORKER_URL` and `AI_WORKER_SHARED_SECRET` in the Next runtime to
select this worker for embedding calls. If `AI_WORKER_URL` is absent, the
existing TypeScript provider remains the compatibility fallback. Do not expose
this service directly to browsers.

## Deployment

`Dockerfile` and `railway.toml` support a separately controlled Railway
service. Do not deploy or enable it as part of a routine Vercel release. Set
the provider key and worker secret only in the private service environment.
