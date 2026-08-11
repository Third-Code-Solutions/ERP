# M3.260 - Invoice draft test baseline repair

Date: 2026-08-11

## Change

The customer-invoice-draft replay unit fixture now includes the
tenant-scoped project-lock result before the idempotency request claim. The
service already performed this query; the spec's two-result mock was stale and
crashed on the third `select().from()` call.

No production source, schema, API contract, or provider configuration changed.

## Evidence

- Focused invoice-draft spec: 3/3 PASS.
- Root tests: 173/173 files, 752/752 tests PASS.
- API integration: 54/54 files, 68 passed, 2 explicit Redis-restart skips.
- Root typecheck, lint, production build, provider-spend, parity, release,
  Web/DB boundary, workflow-reference, and actionlint gates: PASS.
- Source commit: `4abbf75baa9dbbf019b38b3b0bc5678c933f367f`.

## Operational boundary

No hosted Supabase SQL/data, Storage, Railway/Vercel deployment, credentials,
provider settings, or paid action changed. Keep all selectors closed and
continue the source-only migration sequence.
