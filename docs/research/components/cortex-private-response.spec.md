# Cortex private response contract

Status: source-complete transport hardening, 2026-08-04. This is an original
Third Code ERP contract; it does not copy a vendor implementation.

## Scope

The contract applies to authenticated Cortex handlers:

- `POST /api/cortex/chat`
- `GET /api/cortex/search`
- `GET /api/cortex/graph`
- `GET /api/cortex/entity/:refTable/:refId`
- `GET /api/cortex/conversations`
- `GET /api/cortex/conversations/:id`
- `POST /api/cortex/embed`

## Required headers

Application responses use the exact directives below. Next.js may append its
router values to `Vary`, but `Cookie` must remain present.

```text
Cache-Control: private, no-store, max-age=0
Vary: Cookie
```

Apply the same contract to successful responses and application-generated
401/403/400/404/409/500 responses. Framework-generated method errors are not
owned by these handlers.

## Invariants

- Request bodies, status codes, stream framing, citation headers, and error
  envelopes remain unchanged.
- Tenant/RBAC checks and redaction remain the authorization source of truth.
- No browser write is introduced; NestJS remains the official ERP transaction
  authority.
- No database schema, migration, provider setting, deployment, or hosted data
  changes are part of this slice.

## Acceptance evidence

- Focused Cortex route tests assert the two headers on auth, validation,
  not-found, success, and stream paths.
- Local unauthenticated probes show 401 plus the contract for every protected
  application handler.
- Authenticated disposable-tenant browser verification remains the next
  required gate before wiring new live-data UI.
