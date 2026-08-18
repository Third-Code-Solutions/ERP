# Distributed rate-limit source slice — 2026-08-17

## Completion state

**PARTIALLY VERIFIED.** The Web/Core source changes and focused local tests
passed. No Upstash credential, provider account, server-runtime setting,
network request, deployment, hosted tenant, or centralized observability sink
was used.

## Completed source contract

1. **Agent 03 — Web middleware:** added a disabled-by-default Upstash REST
   adapter for the general Edge limiter. It validates the endpoint/configuration,
   hashes raw identities with a deployment secret, submits one atomic EVAL
   counter, bounds the network wait, emits `RateLimit-*` metadata, and returns
   503 rather than silently using a local map when distributed mode is selected
   but unavailable.
2. **Agent 03 — policy correction:** classified `/api/ai/similar-items` as
   provider embedding rather than chat and introduced a lower visual-extraction
   bucket for `/api/upload/complete`.
3. **Agent 05 — Core quota:** added the tenant/user `provider-vision` policy
   and validates it in the authenticated Core endpoint and Web/Core response
   contract.
4. **Agent 03 + Agent 05 — upload boundary:** visual extraction now consumes
   the selected Core vision quota before the document-intake command. A
   blocked Core quota produces no document creation or visual extraction call.

The Next/Inngest BOM-history embedding worker is deliberately not redirected to
Cortex in this slice. Its vector schema, consumer contract, provider-data
handling, and durable job equivalence are not the same as Cortex; M5 requires
an explicit consumer/runbook migration before retiring legacy writers.

## Local verification

- PASS: Web focused tests — 32 tests across rate policy, distributed adapter,
  middleware, provider quota, and upload completion.
- PASS: API focused tests — 8 tests across provider quota service and
  controller.
- NOT RUN: Node 22 execution. This host is Node 24.16.0 / pnpm 10.33.0 while
  the Web package requires Node 22.x / pnpm 9.x.
- NOT RUN: a real Redis REST call or cross-isolate proof; test fetches were
  local doubles and no provider credential was used.

## Operator handoff

→ **Agent 13 — CI/CD & Ops.** Use
`docs/runbooks/distributed-rate-limiting.md` only after security/operations
select an approved provider, isolated tenant/origin, server-only credentials,
budget, alert route, and rollback owner. Do not enable the selector on a
customer tenant. Required evidence is a multi-instance shared-limit test,
failure/recovery proof, key-privacy inspection, hosted logs/alerts, and a
protected browser flow tied to the exact deployment SHA.
