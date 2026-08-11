# M3.258 — Cash draft delete authority

Date: 2026-08-11

## Change

Added a rollback-only HTTP/DB canary for cash draft create, update, and
delete. The canary found and closed two real defects: the cash transaction
`BEFORE DELETE` guard returned `NEW` (`NULL`), and FK cascade caused the child
allocation guard to reject deletion after the parent disappeared.

- Added forward migration `20260811180000_cash_draft_delete_trigger_fix.sql`.
- Core now deletes draft allocations before deleting the draft parent.
- Deleted request rows retain target UUID and durable result for replay.

## Evidence

- Focused HTTP canary: 1/1 PASS.
- Database migration regression: 3/3 PASS.
- API integration: 53/53 files, 67 passed, 2 explicit Redis-restart skips.
- API/database typecheck, lint, build, and policy gates: PASS.
- Source commit: `2c59e6886214e42b646b4ad32938db5f5440ef10`.

## Operational boundary

No hosted Supabase SQL/data, Storage, Railway/Vercel deployment, credentials,
provider settings, or paid action changed. Source parity is 55/118 with 63
pending. Keep `ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED=false` and its tenant
allowlist empty until hosted parity, readiness, browser, rollback, and billing
gates are separately reconciled.
