# Cortex provider circuit runbook

Runbook key: `cortex-provider-circuit`

## Purpose

Use this runbook when a tenant's Cortex provider policy reports an open or
half-open circuit, elevated failures, or unexpected spend. The endpoint exposes
tenant-scoped aggregates only. It never returns prompts, responses, attempt
identifiers, user identifiers, or credentials.

## First check

An authenticated tenant owner, administrator, or finance user may call:

```http
GET /v1/cortex/provider-health?provider=<provider>&model=<model>
Authorization: Bearer <Supabase access token>
```

Do not supply a tenant identifier. Tenant scope is derived from the verified
principal. Record the response timestamp, provider/model, circuit state,
`retryAt`, failure count, probe state, daily spend, attempt counts, and latency
percentiles in the incident record. Do not copy payloads or credentials.

## Interpret the response

- `closed`: normal reservations may proceed.
- `open`: reservations are denied until `retryAt`. Repeated retries increase
  queue noise and do not bypass the circuit.
- `half_open`, `probeInFlight=false`: one new reservation may become the probe.
- `half_open`, `probeInFlight=true`: wait for the existing probe to settle.
- `outcomeUnknown > 0`: provider-side outcome cannot be proven. Treat cost and
  duplicate-delivery risk as unresolved until reconciled.
- `policyEnabled=false`: no provider request should be dispatched.

## Response

1. Confirm the tenant, provider, model, policy state, and current release gate.
2. Check provider credentials and provider status without exposing secrets.
3. Check recent queue retries and stable outcome codes. Do not replay an
   unknown-outcome request manually.
4. If open, wait until `retryAt`; allow exactly one normal queued probe.
5. If the probe succeeds, confirm the circuit closes and latency/spend remain
   within the tenant's approved policy.
6. If the probe fails, leave the circuit open. Disable the tenant policy or the
   provider release gate when continued requests create financial or data risk.
7. Reconcile reserved/dispatched attempts through the supported recovery path;
   never edit spend or attempt rows directly.

## Escalation

Escalate to the ERP backend owner when the circuit does not match immutable
attempt evidence, more than one probe exists, spend exceeds the configured
daily limit, or reconciliation cannot prove an outcome. Escalate suspected
credential exposure through the security incident process and rotate the
credential before re-enabling the policy.

## Alerting status

The source-only alert ledger records one aggregate `opened` event per circuit
trip and one `recovered` event after a successful probe. Events are scoped by
tenant and policy, deduplicated by deterministic event key, audited without
payloads, and delivered through an injectable local sink with bounded retry.
`pending`, `processing`, `delivered`, and `failed` are database states; a
failed sink may be retried by event key, and the drain stops after one failure
to prevent a hot loop. Route delivery uses the same claim path: acceptance
marks `delivered`; bounded route failures persist as `last_error` and remain
retryable. No external paging integration is activated. Before production
activation, connect an approved provider-neutral route through the protocol-v1
envelope. Verify exact-tenant gating, adapter-key validation, event-key
idempotency, bounded failure codes, and credential isolation. Test-fire each
circuit state, verify routing, and link this runbook. Never put prompts,
responses, credentials, URLs, attempt IDs, or user identities in an alert.
