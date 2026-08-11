# M3.282 - Bank-reconciliation line match/unmatch Core authority

Date: 2026-08-12
Status: source-only, locally verified; no production cutover

## Scope

Moved manual bank-statement line match and unmatch through the existing Nest
workflow for an exact tenant canary. The compatibility Server Actions now
require opaque per-line retry keys when selected and never fall back to direct
SQL after a selected Core failure.

## Evidence

- Core client and Server Action tests cover exact-tenant selection, strict
  match/unmatch bodies, retry-token validation, result schema validation, and
  no Web database fallback.
- The disposable PostgreSQL/Nest HTTP canary passed auth, RBAC, tenant scope,
  idempotent replay/conflict, state transitions, audit, and rollback checks.
- The authenticated Playwright loopback proved match and unmatch UI flows,
  exact Core POST paths, bearer, UUID request IDs, per-line idempotency keys,
  strict bodies, rendered counts, responsive overflow, zero console errors,
  and blocked external requests.
- Full gates passed before source push: `pnpm test` (shared-types 332; database
  241 passed/143 skipped; API 764; Web 791), typecheck, lint, production build
  (83 Next pages), migration/release/policy/parity checks, web-database boundary,
  Actionlint, Gitleaks, provider-spend guard, and `git diff --check`.
  Hosted migration and provider work remain intentionally disabled.

## Safety boundary

The API and Web line-match selectors remain false/empty outside the disposable
browser tenant. No hosted Supabase SQL/data, Storage, Vercel/Railway
deployment, provider setting, credential, or paid action changed.

## Next action

Review and push source/docs under `kurtgav`, verify the exact remote SHA, and
keep hosted selectors closed. No deployment or paid provider action is part of
this slice.
