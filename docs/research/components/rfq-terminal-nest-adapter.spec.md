# RFQ Terminal Nest Adapter Specification

Date: 2026-07-30

Status: implementation scope

## Objective

Move RFQ completion and cancellation behind the existing NestJS
modular-monolith boundary without changing visible UI, Server Action response,
database schema, or production routing.

RFQ creation and quote logging keep their current independently controlled
paths.

## Existing compatibility contract

`completeRfq(rfqId)` and `cancelRfq(rfqId, reason)`:

1. resolve the authenticated profile;
2. require `rfq.dispatch`;
3. validate the RFQ ID and bounded cancellation reason;
4. return `{ error: string }` on denial or failure;
5. return `{}` and revalidate both RFQ routes after durable success;
6. dispatch completion notification only after commit, without rolling back a
   successful transition when notification delivery fails.

The adapter must preserve this contract.

## Cutover control

Nest routing is selected only when:

- `ERP_RFQ_TERMINAL_WRITES_VIA_API` is exactly `true`;
- the authenticated tenant ID is a UUID;
- `ERP_RFQ_TERMINAL_WRITES_VIA_API_TENANT_IDS` contains that exact UUID;
- every allowlist entry is a UUID, or the allowlist is exactly `*`.

Empty, malformed, mixed-wildcard, case-variant flag, and nonmatching values
select the existing Next.js service.

Production variables remain absent/false and the allowlist remains empty.

## HTTP contract

`POST /v1/procurement/rfqs/:rfqId/transitions`

Capability: `rfq.dispatch`

Completion body:

```json
{
  "command": "complete"
}
```

Cancellation body:

```json
{
  "command": "cancel",
  "reason": "Supplier withdrew"
}
```

Unknown fields fail. Cancellation reason is trimmed, required, and limited to
1000 characters.

Success:

```json
{
  "rfqId": "uuid",
  "tenantId": "uuid",
  "transitioned": true
}
```

## Transaction behavior

Within one PostgreSQL transaction:

1. stamp the authenticated actor for database triggers;
2. lock the tenant RFQ row;
3. reject missing/cross-tenant RFQs;
4. enforce explicit terminal-state transitions;
5. for completion, require `quotes_received` and quote coverage for every
   canonical RFQ line;
6. update only the locked tenant row at its current status;
7. write semantic status-change audit evidence with the cancellation reason
   when applicable.

Any failure rolls back official state and semantic audit.

## Error behavior

- missing/cross-tenant RFQ: `404`;
- incomplete coverage or invalid terminal transition: `409`;
- malformed/unknown input: `400`;
- missing authentication: `401`;
- role without `rfq.dispatch`: `403`;
- unexpected failure: sanitized `5xx`.

The Web client converts API errors into the existing `{ error }` action result
and never falls through to the legacy write after an API attempt.

## Validation

- strict shared command/result contract tests;
- exact flag/tenant allowlist tests;
- controller result and unknown-authority-field rejection;
- service proofs for covered completion, incomplete coverage, cancellation,
  tenant isolation, concurrency guard, semantic audit, and audit rollback;
- Server Action branch-selection, notification, and result-contract tests;
- full lint, typecheck, tests, production build;
- zero-skip PostgreSQL 17/Redis lane;
- zero new Vercel deployments.

## Rollback

- keep both terminal-adapter environment variables absent;
- revert the adapter source commit;
- retain existing RFQ integrity migrations;
- no database, data, queue, Storage, Python, or provider rollback is required.
