# Approved-BOM RFQ BullMQ Dispatch Specification

## Purpose

Move automatic approved-BOM RFQ creation from the transitional Next.js/Inngest
worker to the NestJS modular monolith and BullMQ without enabling production
cutover.

This is an original workflow specification derived only from this repository's
current behavior and approved target architecture. No external ERP code,
schema, UI, copy, test, documentation, or internal structure is used.

## Interaction Model

- `approveBom` remains the compatibility producer during this milestone.
- An independent exact tenant gate selects one producer:
  - disabled or unmatched: existing `bom/approved` Inngest event;
  - enabled and matched: authenticated NestJS enqueue command.
- Selection is final. A selected NestJS failure never retries through Inngest.
- NestJS authorizes enqueue. BullMQ performs the official RFQ transaction.
- Production flags remain unset.

## HTTP Contract

### Request

- Method: `POST`
- Path: `/v1/procurement/rfqs/dispatch`
- Capability: `rfq.dispatch`
- Body: `{ "bomId": "<uuid>" }`
- Unknown fields rejected.
- Tenant, actor, role, source, queue name, retry count, and job ID are never
  accepted from the caller.

### Success

- Status: `202`
- Strict body:
  - `jobId`: non-empty bounded string;
  - `enqueued`: boolean.
- Duplicate tenant/BOM enqueue returns the same deterministic job ID.

## Job Contract

- Queue: `procurement-rfq-dispatch`.
- Job: `create-from-approved-bom`.
- Data:
  - `schemaVersion: 1`;
  - `tenantId`: UUID from authenticated principal;
  - `actorId`: UUID from authenticated principal;
  - `bomId`: UUID from strict request;
  - `source: "bom_approved"` assigned by server.
- Deterministic job ID is derived from queue contract version, tenant UUID, and
  BOM UUID. Caller cannot override it.
- Payload is parsed again by the worker before any database access.

## Authority and Transaction Rules

1. HTTP guard verifies Supabase access token and current database membership.
2. Capability guard requires `rfq.dispatch`.
3. Worker re-reads actor membership by both actor and tenant.
4. Worker rechecks current role against `rfq.dispatch`; stale, removed,
   cross-tenant, or downgraded actors fail closed.
5. Existing NestJS RFQ transaction remains the sole commit path.
6. Transaction stamps the revalidated actor.
7. Transaction selects and locks the tenant-scoped BOM.
8. Automatic jobs require BOM status `approved`.
9. Existing tenant/BOM RFQ returns as an exact replay.
10. New RFQ and semantic audit commit atomically.
11. Automatic audit records `source: "bom_approved"`.

## Retry and Dead-Letter Rules

- Five attempts maximum.
- Exponential backoff starts at one second.
- Infrastructure and unexpected failures retry.
- Final failure is copied once to `procurement-rfq-dispatch-dead-letter`.
- Dead-letter record contains strict original job data, bounded failure name,
  bounded message, attempts made, and failure timestamp.
- Completed jobs remain long enough for deterministic duplicate suppression.
- Failed source jobs remain available for investigation.
- Redis reconnect uses BullMQ's shared connection configuration.

## Web Cutover Gate

- `ERP_RFQ_AUTO_DISPATCH_VIA_API`
- `ERP_RFQ_AUTO_DISPATCH_VIA_API_TENANT_IDS`
- Exact lowercase `true` required.
- Allowlist accepts valid UUIDs, or `*` only as the sole entry.
- Empty, malformed, mixed wildcard, or unmatched values use Inngest.
- Both variables remain unset after this milestone.

## Compatibility

- `approveBom(bomId, projectId)` signature and `{ error? }` result stay
  unchanged.
- BOM approval remains persisted before best-effort dispatch.
- Existing Inngest producer and consumer remain intact for disabled tenants.
- Selected NestJS failure is logged and does not roll back approval.
- No React/UI, database migration, Python, Storage, visible copy, or Vercel
  deployment changes.
- Existing Inngest notification remains authoritative until a later
  notification-outbox migration. BullMQ tenant cutover must remain disabled
  until equivalent idempotent notification delivery is implemented.

## Acceptance Criteria

- Shared request, result, job, and dead-letter schemas reject malformed or
  unknown fields.
- Controller derives principal authority and returns `202`.
- Producer proves deterministic duplicate job ID and fixed retry policy.
- Worker proves payload validation, current membership and capability recheck,
  approved-state enforcement, existing transaction reuse, and final-attempt
  dead-lettering.
- Service proves manual audit source unchanged and automatic audit source,
  actor revalidation, tenant denial, role denial, approved-state denial,
  replay, one RFQ, and one audit.
- Next client proves independent fail-closed gate, strict request/result
  validation, and no caller-supplied authority.
- BOM action proves one selected producer only and no Inngest fallback after a
  selected NestJS failure.
- Disposable PostgreSQL 17 and Redis 7.4.9 prove duplicate delivery, bounded
  retry, dead-letter, reconnect after Redis restart, tenant denial, one RFQ,
  and one audit.
- Root lint, typecheck, tests, production build, secret scan, workflow
  validation, and prohibited external ERP runtime scan pass.

## Rollback

1. Keep `ERP_RFQ_AUTO_DISPATCH_VIA_API` unset or exact `false`.
2. Keep tenant allowlist empty.
3. Existing Inngest path stays authoritative.
4. Revert source milestone if needed.
5. No schema or data rollback exists.
