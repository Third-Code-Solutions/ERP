# RFQ Quote Nest Adapter Specification

Date: 2026-07-30

Status: implementation scope

## Objective

Move only RFQ quote logging behind the existing NestJS modular-monolith
boundary without changing the current Server Action response, visible UI,
database schema, or production routing.

Completion and cancellation remain on the current row-locked Next.js service
for this milestone.

## Existing compatibility contract

`logQuote(formData)`:

1. resolves the authenticated profile;
2. requires `rfq.dispatch`;
3. validates bounded quote input;
4. returns `{ error: string }` on denial or failure;
5. returns `{}` and revalidates both RFQ routes after durable success.

The adapter must preserve this contract.

## Cutover control

Nest routing is selected only when:

- `ERP_RFQ_QUOTE_WRITES_VIA_API` is exactly `true`;
- the authenticated tenant ID is a UUID;
- `ERP_RFQ_QUOTE_WRITES_VIA_API_TENANT_IDS` contains that exact UUID;
- every allowlist entry is a UUID, or the allowlist is exactly `*`.

Empty, malformed, mixed-wildcard, case-variant flag, and nonmatching values
select the existing Next.js service.

The production variables remain absent/false and the allowlist remains empty.

## HTTP contract

`POST /v1/procurement/rfqs/:rfqId/quotes`

Capability: `rfq.dispatch`

Body:

```json
{
  "submissionId": "uuid",
  "bomLineItemId": "uuid",
  "vendorId": "uuid",
  "unitPriceCents": 10000,
  "leadTimeDays": 7,
  "validUntil": "2026-08-31T00:00:00.000Z",
  "notes": "Optional"
}
```

Optional fields may be omitted. Unknown fields fail.

Success:

```json
{
  "quoteId": "uuid",
  "created": true,
  "statusChanged": true
}
```

An exact idempotent replay returns the same `quoteId` with `created=false`
and `statusChanged=false`.

## Transaction behavior

Within one PostgreSQL transaction:

1. stamp the authenticated actor for database triggers;
2. acquire the tenant/submission advisory lock;
3. lock the tenant RFQ row;
4. resolve the canonical BOM line and server-derived material;
5. return exact replay or reject conflicting key reuse;
6. reject terminal RFQs;
7. validate same-tenant vendor/material;
8. insert the quote;
9. move `pending` to `quotes_received`;
10. write semantic quote and status audit evidence.

Any failure rolls back all official state and semantic audit.

## Error behavior

- missing/cross-tenant RFQ: `404`;
- missing/cross-tenant vendor or material: `404`;
- submission conflict or terminal RFQ: `409`;
- malformed/unknown input: `400`;
- missing authentication: `401`;
- role without `rfq.dispatch`: `403`;
- unexpected failure: sanitized `5xx`.

The Web client converts API errors into the existing `{ error }` action
result and never falls through to the legacy write after an API attempt.

## Validation

- strict shared contract tests;
- exact flag/tenant allowlist tests;
- Nest capability-role tests;
- controller contract and unknown-field rejection;
- service proofs for atomic quote/status/audit, exact replay, conflict,
  cross-tenant denial, terminal denial, and audit rollback;
- Server Action branch-selection and result-contract tests;
- full lint, typecheck, tests, production build;
- zero-skip PostgreSQL 17/Redis lane;
- zero new Vercel deployments.

## Rollback

- restore/keep both RFQ adapter environment variables absent;
- revert the adapter source commit;
- keep migration `20260729162944` and its tenant/idempotency/state invariants;
- no database, data, queue, Storage, or Python rollback is required.
