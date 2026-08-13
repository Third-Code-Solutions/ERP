# M3.261 bank-statement auto-match authority

## Change

- Added the fail-closed Nest Core auto-match command at
  `POST /v1/finance/reconciliation/:statementId/auto-match`.
- Added strict shared body/command/result contracts and an exact tenant-scoped
  request ledger with force-RLS/service-role-only access.
- Added idempotent replay/conflict handling, statement locking, trusted
  PostgreSQL matching, semantic audit, and a rollback-only HTTP canary.
- Kept the existing Web Server Action and all hosted/provider selectors
  unchanged.

## Evidence

- Focused local canary: 1/1 PASS.
- Root tests: 173/173 files, 753/753 tests PASS.
- API integration: 55/55 files, 69 tests PASS, two explicit Redis-restart
  skips.
- Typecheck, lint, production build, parity, release, boundary, workflow,
  actionlint, and provider-spend gates PASS.
- No managed Supabase SQL/data, Storage, Railway/Vercel deployment, credential,
  provider setting, or paid action changed.
- Source commit: `ea8957057db8d8a4ba4cb4695b9c560d8624b9e9`.

## Follow-up

Keep `ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_ENABLED=false` and its
tenant list empty. Manual match/unmatch, reconcile, void, import, Web cutover,
hosted parity, and production release require separate evidence.
