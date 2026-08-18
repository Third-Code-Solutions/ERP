# Distributed Edge rate limiting runbook

**State: NOT RUN against any hosted provider.** This runbook is an activation
checklist for the source-only adapter in ADR-023. It does not authorize a
provider account, deployment, or customer-tenant test.

## Purpose and boundary

The Web middleware can use one Upstash REST counter for a fixed request window
across Edge isolates. It stores only salted digests and counters. It is not ERP
transaction authority, audit evidence, durable provider spending accounting,
or a replacement for Core tenant/user quotas.

## Preconditions

- A named security/operations owner approves the provider, region, budget,
  retention posture, incident response, and alert recipient.
- The target is an isolated disposable tenant/origin with a written rollback
  and no customer records.
- A Vercel/server runtime secret store is available. Do not use a
  `NEXT_PUBLIC_*` variable, source file, browser storage, URL, or build log.
- Core Redis/provider-quota readiness is separately verified if visual, chat,
  or embedding spend controls will be enabled for that tenant.

## Required server-only configuration

| Variable | Required value | Safety rule |
| --- | --- | --- |
| `ERP_DISTRIBUTED_RATE_LIMIT_ENABLED` | exact `true` | Any other value keeps the local compatibility limiter. |
| `UPSTASH_REDIS_REST_URL` | TLS root `*.upstash.io` REST endpoint | No custom host/path/query or credentials in the URL. |
| `UPSTASH_REDIS_REST_TOKEN` | Standard server-only REST token | Never expose or log it. EVAL needs write capability. |
| `ERP_RATE_LIMIT_KEY_SALT` | random secret, at least 32 characters | Rotate with the token after suspected exposure. |

An explicit enablement with a missing/invalid value returns a generic 503; it
does not fall back to the local map. Keep the selector false until all four
values are in the target server runtime.

## Disposable-target validation

1. Record the exact app commit, target origin, tenant ID, tester identity,
   provider region, rollback owner, and test window. Do not record secret
   values.
2. Exercise a provider route with a controlled authenticated test user from
   at least two independent Edge executions. Submit the policy limit, then one
   additional request. Confirm the additional request returns 429 with
   `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`,
   and `RateLimit-Scope` as applicable.
3. Wait for window expiry and confirm one new request is accepted. Repeat with
   an anonymous route/IP and a second authenticated user to prove subject
   separation.
4. Temporarily make the disposable limiter endpoint unavailable using an
   approved reversible provider/test control. Confirm a generic 503 before the
   protected application route runs. Restore the endpoint and confirm recovery.
5. Inspect the provider key prefix only. Verify no raw tenant/user/IP,
   request body, source filename, prompt, or pricing data appears in keys or
   values.
6. Capture Edge/runtime logs, provider health metrics, alert receipt, and a
   protected browser run with no console or failed-network errors. These are
   separate artifacts; a 429 alone is not end-to-end evidence.

## Operational signals and response

| Signal | Initial response |
| --- | --- |
| Sustained limiter 5xx/503 | Treat as a high-priority dependency incident; verify token/endpoint status without printing secrets; use the approved rollback decision. |
| Unexpected 429 concentration | Check policy routing, client retry behavior, proxy-IP trust, and abusive traffic. Do not increase limits without a documented spend/capacity review. |
| Redis key privacy issue | Disable the selector on the isolated target, rotate token and salt, preserve audit/log evidence, and involve security. |
| Provider budget/latency breach | Keep provider routes fail-closed; do not bypass quota or Edge controls to restore traffic. |

## Rollback

Only the named operations owner may set
`ERP_DISTRIBUTED_RATE_LIMIT_ENABLED=false`. That restores the documented
process-local compatibility guard, not equivalent global protection. Pair any
rollback with an upstream WAF/rate-control decision, incident record, and a
follow-up provider remediation; it is not a green production state.
