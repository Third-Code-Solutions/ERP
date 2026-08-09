# Web Database Boundary Review

## M3.199 follow-up

The planned Nest document-intake contract now exists, but the legacy
`upload/complete` allowlist entry remains active because the Web adapter is not
connected. See `DOCUMENT_INTAKE_REVIEW.md`; migration replay and response
parity are the next gates.

## M3.198 scope

This packet covers only runtime files under `apps/web/src/app/api`. It is a
source-only guard, not a deployment or database approval. The Next API remains
compatible while direct authorities are migrated incrementally into Nest.

## Current inventory

Direct Web writes are explicit and temporary:

| Route | Operations | Migration owner | Boundary note |
| --- | --- | --- | --- |
| `apps/web/src/app/api/bom/togal-commit/route.ts` | `insert`, `transaction`, `update` | Nest BOM commit authority | Core canary exists; legacy branch remains while the canary is closed. |
| `apps/web/src/app/api/notifications/route.ts` | `update` | Nest notification read-state authority | User + tenant predicates; not an ERP posting. |
| `apps/web/src/app/api/upload/complete/route.ts` | `insert`, `transaction` | Nest document intake authority | Tenant/project path and role checks precede the insert. |
| `apps/web/src/app/api/webhooks/docuseal/route.ts` | `insert`, `update` | Nest signature webhook authority | Secret-gated callback; token use, document attach, and BOM lock are idempotent legacy work. |

Read-only `db.execute` is separately classified for the similarity query and
`SELECT 1` readiness probe. Any new direct write or unclassified raw execute
fails `pnpm verify:web-db-boundary`.

The guard intentionally does not claim that Server Actions and internal Web
services are migrated. Those remain the broader M3.199+ authority inventory;
this milestone prevents the Next API surface from growing new direct writes.

## Validation and rollback

- `pnpm test:web-db-boundary` — current inventory and synthetic bypass cases.
- `pnpm verify:web-db-boundary` — read-only report; expected status `clear`.
- CI runs the test in both hosted and self-hosted workflows.
- Rollback is deleting the verifier/workflow/docs commit; no runtime schema,
  data, environment, provider, or deployment state changes.

## Exact next action

Keep all Core canaries and hosted actions closed under the cost lock. M3.199
should add a strict Nest document-intake contract, parity tests, idempotency,
and a disabled-by-default Web adapter before removing
`upload/complete` from the allowlist. Do not infer production authority from
this static guard.
