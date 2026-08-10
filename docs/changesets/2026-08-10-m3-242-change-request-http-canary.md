# M3.242 Change Request protected HTTP canary

## Scope

Add disposable protected HTTP evidence around existing Nest
`POST /v1/crm/opportunities/:opportunityId/change-requests` authority.

## Evidence

- Real Supabase identity and `change_request.create` capability guards.
- Strict body and `Idempotency-Key` validation.
- Disabled feature fail-closed behavior and cross-tenant concealment.
- Affected design-file scope, replay, key conflict, notification, audit, and
  rollback.
- Focused database plus HTTP canaries: 2/2 PASS. Root API 173/173 files and
  751/751 tests, shared 54/54 files and 323/323 tests, typecheck 5/5, lint
  2/2, production build 82/82 pages, disposable 117-migration lane with
  database 149/149 suites and 370/370 tests, and API integration 38/38 files
  and 54/54 tests all passed without skips.

## Release boundary

Source-only. No selector, schema, hosted Supabase state, Railway/Vercel
deployment, provider setting, credential, or paid action changed. Keep all
Change Request flags and UUID allowlists false/empty until hosted parity,
readiness, protected browser evidence, rollback, exact SHA, and spend approval
are complete.
