# Operational Observability Policy

Status: source-only policy. No operational exporter, hosted telemetry sink, or
browser route is enabled.

This policy governs process-level operational snapshots in the NestJS modular
monolith. It is intentionally separate from tenant-facing ERP reporting and
from public health/readiness probes.

## Current snapshot contract

`CortexAssistantProviderCircuitAlertObservability.readOperationalSnapshot()`
is an internal read seam for fixed-cardinality enqueue counters. The policy is
encoded beside the seam as
`CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_OPERATIONAL_SNAPSHOT_POLICY`.

| Control | Current contract |
| --- | --- |
| Authorization | Internal Nest service only; no browser or token route |
| Exposure | Backend-only; not a controller, exporter, or tenant response |
| Scope | One running process |
| Tenant attribution | None; process counters must not be attributed to a tenant |
| Redaction | Fixed-cardinality counters only; no IDs, payloads, credentials, or raw errors |
| Retention | Process lifetime only; no persistent telemetry write |
| Rate limit | Not applicable while no exporter exists |
| External sink | Disabled |
| Cost control | Zero external spend |
| Owner | ERP backend owner; no anonymous operational adapter |
| Consumer | None registered in runtime |
| Allowed consumer | Future separately reviewed operational adapter only |
| Release identity | Exact Git commit SHA |
| Rollback | Last known-good artifact; no rebuild required |
| Deployment | Separate reviewed release decision and rollback evidence required |

Ownership, release identity, and rollback fields are evidence requirements,
not deployment authority. The source policy cannot enable an exporter or route.

## Adapter trigger evaluator

`evaluateCortexAssistantProviderCircuitAlertOperationalAdapterTrigger()` is a
pure, fail-closed evidence check. It requires all nine reviews: caller
authorization, process-versus-tenant scope, redaction, retention, bounded
rate, provider/network cost, backend-owner approval, exact Git SHA, and
last-known-good rollback artifact. `eligible` means only that the evidence
inputs are complete; it does not enable a route, exporter, sink, or deployment.

## Boundary audit

- `/health` and `/ready` are public liveness/readiness probes only. They do not
  expose operational counters.
- Every non-public Nest route passes JWT identity and explicit capability
  guards. The snapshot service is registered as a provider, not an HTTP
  controller, and the module-boundary test locks this invariant.
- The snapshot is process-scoped, immutable, and unexported. A future adapter
  must not infer tenant scope from process counters.
- User-facing Cortex search derives tenant and role from the authenticated
  session/principal, maps only registered entity sources to safe deep links, and
  never reads the snapshot. The strict search result contract rejects
  process-scoped `scope`, `metric`, or `counters` fields; command-palette
  normalization is presentation-only.
- The brief, graph, entity, conversation, and chat retrieval consumers also
  have no access to `readOperationalSnapshot()`. Their direct-read fallbacks
  and Core canaries are ERP data paths only; process metrics cannot become a
  dashboard KPI, graph node, citation, or assistant context.

## M3.189 Chat retrieval boundary

Chat retrieval is ERP tenant data, not process observability. Its future
projection must not carry `readOperationalSnapshot()` fields, exporter state,
or provider circuit counters. A chat-read canary is independent of any
operational adapter review.

## M3.190 Chat retrieval contract boundary

The new Core chat retrieval projection contains only tenant-scoped ERP graph
facts, bounded item windows, citations, freshness, and an explicit semantic
status. It cannot carry `readOperationalSnapshot()` fields, process counters,
provider circuit state, request IDs, or tenant-control metadata. Its API gate
and allowlist are false/empty; no browser route or exporter consumes it. Any
future Web cutover requires a separate parity and protected-flow review.

## M3.191 Chat retrieval parity boundary

The deterministic parity fixture compares only tenant ERP retrieval
projections. It does not read, export, or authorize the process snapshot;
process counters and provider circuit state remain excluded from the packet,
the Core result, and any future Web seam.

## M3.192 Web seam boundary

The unconnected Web adapter imports no database helper and does not expose
operational snapshots. Its exact-tenant Core selection, timeout, and
fail-closed behavior are ERP read controls only; observability remains
backend-only and cannot become chat context or provider budget input.

## M3.188 Release identity boundary

Local source and documented rollback metadata are evidence fields only. They do
not expose process counters, authorize a hosted exporter, or prove a Railway/
Vercel deployment identity.

## M3.187 Exact-tenant brief canary boundary

The Web brief canary rejects wildcard tenant selection locally. This protects
tenant scope but does not expose process counters, authorize an exporter, or
replace hosted identity/rollback/spend evidence.

## M3.186 Cortex brief canary review boundary

The review packet is evidence metadata only. It cannot authorize an exporter,
process snapshot route, tenant canary, provider call, or deployment. Request
limits and spend controls are application/release evidence, not operational
counter exposure.

## M3.185 Dashboard brief parity boundary

Parity fixtures compare tenant-scoped ERP projections only. They do not read
the process snapshot, export counters, activate a provider, or authorize a
dashboard canary. Observability remains backend-only and separate from this
consumer evidence.

## M3.184 Dashboard brief consumption boundary

The dashboard page consumes the server-only brief seam and never imports the
database brief helper. The seam can select only the exact-tenant Core adapter,
normalizes ERP projection fields, and returns an explicit failure without
re-entering direct reads. Dashboard KPI/graph metrics remain ERP data, not
process snapshot counters or exporter input.

## M3.183 Cortex brief read boundary

The brief contract and Nest authority carry only the tenant-scoped ERP
projection. The Web adapter and route reject process fields such as `scope`,
`metric`, and counters. The Core canary is independent from the process
snapshot and provider budgets; an endpoint does not imply dashboard cutover or
exporter eligibility.

## Adapter gate

Do not add a route, exporter, or external sink until a separate milestone
records: exact caller authorization, process-versus-tenant scope, field-level
redaction, retention/deletion behavior, bounded rate limits, provider/network
cost controls, deployment identity, release SHA, rollback, and focused plus
integration evidence. This gate remains closed under the current cost lock.
