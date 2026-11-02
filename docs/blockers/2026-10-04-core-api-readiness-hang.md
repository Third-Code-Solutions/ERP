# Blocker — Core API `/ready` never answers in production; Core-backed screens fail closed

Status: **RESOLVED (verified 2026-11-02).** The fix was deployed to Railway
(`Third Code ERP API`, deployment `4a2409d1`, SUCCESS, 2026-10-13). Live probes
on 2026-11-02:

| Probe | Result |
|---|---|
| `https://third-code-erp-api-production.up.railway.app/ready` | 200 in 0.19s — `{"status":"ready","database":"ok","redis":"ok"}` |
| `…/health` | 200 — `{"status":"ok","service":"abi-ops-api"}` |
| `…/v1/projects` (unauthenticated) | 401 |
| `https://thirdcode-erp.vercel.app/api/health` | 200 — `dependencies.coreApi.state = "ok"` |

The historical record below is kept as written. Its domain
(`thirdcode-erp-api-…`) was mistyped; the service domain is
`third-code-erp-api-production.up.railway.app`.

## What was happening

`https://third-code-erp-api-production.up.railway.app/ready` did not respond.
Measured from outside Railway:

| Probe | Result |
|---|---|
| `/health` | 200 in 0.19s |
| `/ready` | no response after 20s (`http=000`) |
| `/v1/projects` (unauthenticated) | 401 in 0.13s |

The process is alive and its HTTP pipeline answers; only `/ready` hangs.

## Cause

`apps/api/src/observability/redis.module.ts` builds `REDIS_CLIENT` with
`lazyConnect: true` and `maxRetriesPerRequest: null`. When Redis is unreachable,
ioredis queues `ping()` instead of rejecting it, so the readiness probe awaits a
promise that never settles. Railway's `healthcheckPath = "/ready"` never gets a
verdict, and the web tier's fail-closed Core API calls surface the timeout as
"ERP Core API is unavailable. … was not read." on Platform Control, Takeoff
project reads and the dashboard.

The database probe can produce the same hang (`DatabaseService.ping()` has no
connection timeout), so both dependencies are bounded now.

## Fix in the working tree

- `apps/api/src/health/health.controller.ts` — bounded probes (2s) with
  per-dependency `ok | timeout | error`; Redis connection status checked before
  pinging; `/health` remains dependency-free liveness.
- `apps/api/src/observability/provider-quota.service.ts` — bounded Redis
  operation so an outage returns the intended fail-closed 503 instead of hanging
  an AI route.
- `railway.toml` — `healthcheckTimeout` 120 → 15.
- Tests: `apps/api/src/health/health.controller.spec.ts`,
  `provider-quota.service.spec.ts`.

## Required action

1. Deploy the Core API to Railway (`railway.toml` is picked up from the repo).
2. Confirm `GET /ready` answers within ~2s with
   `{"status":"ready","database":"ok","redis":"ok"}`. If it answers
   `not_ready`, the payload now names which dependency failed — that is the
   follow-up investigation, not this blocker.
3. Deploy the web app and confirm `/api/health` reports
   `dependencies.coreApi.state = "ok"` rather than `timeout`.
4. Confirm Platform Control (`/platform-admin`) and Takeoff (`/scope`) load their
   Core-backed data.

## Note for the deploy

`/ready` now returns 503 when a dependency is down, which is what Railway's
routing health check consumes. That was already true before this change — the
difference is that it now answers instead of hanging, so an unhealthy instance is
recycled promptly instead of sitting unrouted. If a future Redis outage should
degrade the API rather than de-route it, `healthcheckPath` can be moved to
`/health` (liveness) and `/ready` kept for monitoring; that is a deliberate
availability trade-off, not an oversight.
