# M2.9 — Python AI advisory boundary

## Scope

Move embedding generation toward the required Python AI boundary without
rewriting the frontend or changing current behavior when the worker is absent.

## Delivered

- `apps/workers/ai`: authenticated FastAPI `/v1/embeddings` service, bounded
  inputs, provider timeout, response ordering/dimension checks, and generic
  validation responses.
- `packages/ai`: Python worker client and worker-first selection. Partial worker
  configuration fails closed; absent worker URL retains TypeScript compatibility.
- RAG suggestions, auto-BOM, and Inngest BOM embedding refresh use shared
  provider readiness.
- Environment/deployment documentation and worker Docker/Railway manifests.

## Verification

Python 6/6; focused Web 10/10; full Web 316/316; API 120/120;
shared-types 115/115; database 116 pass with 137 explicit local integration
skips; typecheck, lint, Next build 78/78 routes, gitleaks, actionlint,
workflow-reference checks, and diff checks pass. Worker Docker smoke could not
run because local Docker Desktop returned HTTP 500 before build.

No hosted database, provider, deployment, feature flag, or business data was
changed. Worker enablement remains a separately controlled production action.
