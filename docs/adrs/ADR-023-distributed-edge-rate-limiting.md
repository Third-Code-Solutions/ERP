# ADR-023: Gate Edge rate limits behind an explicit distributed Upstash REST adapter

- Status: Accepted (source-only; production enablement remains blocked)
- Date: 2026-08-17

## Context

The Web middleware previously held every request counter in one Edge-isolate
`Map`. Cold starts and horizontal scaling reset or split those counters, so the
implementation could only be an instance-local burst guard. It also assigned
the BOM similar-item embedding route to the looser chat bucket and left
visual-document extraction in the general request bucket.

The existing Core provider-quota API is Redis-backed and tenant/user scoped,
but it is feature-gated for a small set of external-provider calls. It is not a
general Edge request limiter and must not be represented as one.

## Decision

1. The Web middleware supports a dependency-free HTTPS adapter for the
   existing `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` variables.
   It uses the documented Upstash REST command-array protocol and one atomic
   Redis `EVAL` fixed-window counter, which is usable from an Edge runtime
   without a TCP Redis client.
2. Distributed mode is selected only by exact
   `ERP_DISTRIBUTED_RATE_LIMIT_ENABLED=true`. It additionally requires a TLS
   root `*.upstash.io` endpoint, a server-only token, and a server-only
   `ERP_RATE_LIMIT_KEY_SALT` of at least 32 characters. The salt and raw
   IP/user identity are never sent as Redis key text; a salted SHA-256 digest
   scopes each counter.
3. If distributed mode is explicitly selected but configuration, key
   derivation, the REST request, or the provider response is invalid, middleware
   returns a generic 503 before application handling. It never silently falls
   back to the process-local map. The local map remains only when distributed
   mode is explicitly disabled and is not enterprise-global protection.
4. The route policy distinguishes chat, embedding, and visual-extraction
   spending. `/api/ai/similar-items` is an embedding route; `/api/upload/complete`
   receives the lower visual burst. The existing Core provider quota gains the
   matching `provider-vision` bucket. When its tenant gate is selected, visual
   uploads consume that quota before document-intake state is created.
5. `RateLimit-*` response fields are emitted by the Edge limiter.
   Core provider quotas remain a separate tenant/user spend-control contract.

No provider account, token, deployment flag, or hosted data changes with this
decision. No package is added.

## Consequences

- A configured production deployment adds an HTTPS dependency and per-request
  provider cost to middleware. Operations must monitor timeout, 5xx, and 429
  rates before enabling it.
- The one-second limiter timeout and fail-closed behavior favor abuse/spend
  safety over availability. An enablement decision therefore needs an approved
  incident/rollback plan and upstream WAF/auth controls.
- The adapter does not prove an Upstash account, regional latency, rate-limit
  capacity, centralized telemetry, backup/restore, or a hosted user journey.
  Those need separate provider-backed evidence.
- Custom Redis hosts are intentionally rejected. Supporting a different
  provider or custom endpoint is a new reviewed adapter/ADR, not an environment
  substitution that could exfiltrate the configured token.

## Rollout evidence required

1. Security and operations approve the provider, data-processing location,
   budget, incident owner, alert thresholds, and server-only secret handling.
2. A disposable tenant/origin sets the four variables without exposing their
   values to client code or logs.
3. A protected test sends an identical verified subject through more than one
   Edge instance/location and proves one shared limit, 429 retry metadata, 503
   failure behavior, and recovery after window expiry.
4. A reviewer confirms Redis keys contain no raw user ID, tenant ID, IP
   address, prompt, document name, or business payload.
5. Hosted logs/metrics and an alert route record provider failure without
   leaking secrets. Production remains closed until this evidence and the
   broader observability/runbook gate are complete.

## Primary references

- [Upstash Redis REST API](https://upstash.com/docs/redis/features/restapi)
- [Upstash EVAL command](https://upstash.com/docs/redis/sdks/ts/commands/scripts/eval)
