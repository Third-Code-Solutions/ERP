# Manual BOM-to-RFQ NestJS Adapter Specification

## Purpose

Move authenticated manual RFQ creation authority from the transitional
Next.js transaction path into the NestJS modular monolith without changing
the background BOM approval worker or enabling production cutover.

This is an original operational specification derived only from this
repository's current behavior and target architecture. No external ERP code,
schema, copy, test, or internal structure is used.

## Interaction Model

- Command-driven server workflow.
- Browser calls the existing authenticated Next.js Server Action.
- Server Action derives tenant, actor, and role from the session.
- Independent tenant gate selects either the NestJS command or the legacy
  server-only compatibility transaction.
- Once the NestJS path is selected, failure is fail-closed. No retry against
  the legacy path.
- Background Inngest events continue using the existing server-only
  transaction service during this milestone.

## HTTP Contract

### Request

- Method: `POST`
- Path: `/v1/procurement/rfqs`
- Required capability: `rfq.dispatch`
- Body: `{ "bomId": "<uuid>" }`
- Unknown fields rejected.
- Tenant, actor, role, source, and system mode never accepted from the body.

### Success

- Status: `200`
- Strict body:
  - `rfqId`: UUID
  - `tenantId`: UUID
  - `projectId`: UUID
  - `lineCount`: non-negative safe integer
  - `created`: boolean
- Exact replay returns the existing RFQ with `created: false`.

### Business Errors

- `404`: tenant-scoped BOM missing.
- `409`: BOM has no item lines.
- `409`: every item line is already covered by a contracted rate.
- Other failures return a bounded generic message through the Next.js action.

## Transaction Rules

1. Start one PostgreSQL transaction.
2. Stamp authenticated actor into transaction-local database claims.
3. Select and lock the BOM by both `id` and principal `tenantId`.
4. Return existing tenant/BOM RFQ before any new mutation.
5. Select tenant-scoped non-group BOM lines.
6. Resolve tenant-scoped material codes and rate-card coverage.
7. Exclude lines with an existing contracted rate.
8. Insert one pending RFQ with canonical JSON line items.
9. Write one semantic `rfq/create` audit entry in the same transaction:
   - actor: authenticated principal
   - `bom_id`
   - `line_count`
   - `source: "manual"`
10. Commit result only if RFQ and audit both succeed.

## Integrity and Idempotency

- Principal supplies tenant and actor authority.
- Every read and write is tenant-scoped.
- BOM row lock serializes concurrent manual creation attempts.
- Existing unique constraint on `(tenant_id, bom_id)` is the final duplicate
  barrier.
- Replay produces no insert and no semantic audit.
- Notification remains post-commit and runs only when `created: true`.
- Notification failure does not reverse a committed RFQ.

## Cutover Gate

- `ERP_RFQ_CREATE_WRITES_VIA_API`
- `ERP_RFQ_CREATE_WRITES_VIA_API_TENANT_IDS`
- Exact lowercase `true` required.
- Allowlist requires valid UUIDs, or `*` as its only entry.
- Empty, malformed, mixed wildcard, or unmatched values fail closed to the
  legacy compatibility path.
- Both variables remain unset after this milestone.

## Compatibility

- Existing `createRfqFromBom(bomId)` return shape stays unchanged:
  `{ rfqId } | { error }`.
- Existing manual notification and revalidation behavior stays unchanged.
- Existing background event path stays unchanged.
- No React/UI, database migration, Python, queue, storage, copy, or visible
  design change.

## Acceptance Criteria

- Strict shared request and result schemas reject unknown or malformed fields.
- Controller derives principal authority and requires `rfq.dispatch`.
- Service unit tests prove create, replay, tenant concealment, coverage
  filtering, no-lines conflict, all-covered conflict, and audit rollback.
- Controller tests prove strict request/result behavior.
- Next client tests prove independent fail-closed gate, request forwarding,
  response validation, and unavailable-core failure.
- Server Action tests prove gated Nest use, legacy compatibility, notification
  behavior, and no fallback after a selected Nest failure.
- PostgreSQL integration proves unauthenticated denial, capability denial,
  tenant isolation, create, exact replay, one RFQ, one audit, and rollback
  cleanup.
- Full lint, typecheck, tests, production build, database suite, and runtime
  smoke pass.

## Rollback

1. Keep both cutover variables unset or set
   `ERP_RFQ_CREATE_WRITES_VIA_API=false`.
2. Existing Next.js compatibility transaction remains authoritative.
3. Revert the milestone commit if source rollback is needed.
4. No schema or data rollback exists because this milestone adds none.
