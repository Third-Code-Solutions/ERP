# RFQ terminal-transition Nest adapter

Status: implemented locally; rollout remains disabled.

## Contract

- `POST /v1/procurement/rfqs/:rfqId/complete` accepts `{}`.
- `POST /v1/procurement/rfqs/:rfqId/cancel` accepts `{ reason }` with 1–1000
  trimmed characters.
- Both routes return `{ rfqId, tenantId, transitioned: true }`.
- Unknown authority fields, missing cancellation reasons, malformed UUIDs,
  missing RFQs, foreign-tenant RFQs, terminal conflicts, and incomplete quote
  coverage fail before a mutation.

## Authority and rollout

- Supabase JWT identity supplies actor and tenant; request bodies cannot supply
  either field.
- `rfq.dispatch` is required.
- The Nest transaction locks the RFQ, validates quote coverage for completion,
  updates status with tenant and previous-status predicates, and writes the
  semantic audit record in the same transaction.
- Next.js remains the default writer. Nest routing requires the exact flag
  `ERP_RFQ_TRANSITION_WRITES_VIA_API=true` plus
  `ERP_RFQ_TRANSITION_WRITES_VIA_API_TENANT_IDS` containing the approved tenant.
- No migration, hosted environment change, deployment, or provider write is
  part of this slice.

## Verification

- Shared contract tests: PASS.
- Nest unit and HTTP tests: PASS.
- Web action and Core API client tests: PASS.
- Disposable PostgreSQL 17 + Redis 7.4.9 lane: PASS; 242/242 database tests,
  3/3 API integration journeys, including quote completion, retry rejection,
  cross-tenant denial, cancellation, audit, and rollback.
