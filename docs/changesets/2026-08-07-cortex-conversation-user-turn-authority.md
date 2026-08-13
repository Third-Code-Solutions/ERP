# M3.160 Cortex conversation user-turn authority

## Outcome

- Added a strict, idempotent NestJS user-turn command.
- Added a service-only PostgreSQL request ledger and tenant constraints.
- Rechecked current membership, capability, ownership, and record context in
  the write transaction; audited hashes/counts without raw content.
- Added exact-tenant, closed-by-default Web/Core gates and preserved the chat
  API with fail-closed selected-Core behavior.
- Kept assistant/provider persistence outside the browser-facing command.

## Validation

- Shared 247/247; API 564/564; Web 650/650.
- Ordinary database 200 passed / 143 environment-gated skips.
- Disposable PostgreSQL/Redis: 105/105 migrations, database 343/343 zero skips,
  full API integration lane passed, focused transaction suite 1/1, stable
  before/after schema hash.
- Forced bounded root tests, workspace lint/typecheck, Nest build, and Next
  build with 82 static pages passed.
- Spend 4/4; release 5/5; Actionlint; pinned actions; pre-commit Gitleaks 543
  commits; diff hygiene passed.

## Release boundary

All flags remain false and allowlists empty. Managed Supabase remains last
verified at 55/105 and was not accessed. No hosted mutation, provider call,
cloud build, or deployment occurred. Isolated complete-clone replay,
legacy/Core parity, backup/PITR, and protected exact-tenant canary remain
required.
