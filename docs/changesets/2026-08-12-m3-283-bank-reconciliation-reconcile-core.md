# M3.283 - Bank-reconciliation statement reconcile Core authority

Date: 2026-08-12
Status: source-only, locally verified; no production cutover

## Scope

Moved the draft bank-statement reconcile command through the existing Nest
workflow for an exact tenant canary. The compatibility Server Action now
requires one opaque statement retry key when selected and never falls back to
the direct SQL writer after a selected Core failure.

## Evidence

- Core client and Server Action tests cover exact-tenant selection, strict `{}`
  request bodies, retry-token validation, result-schema validation, and no Web
  database fallback.
- The disposable PostgreSQL/Nest HTTP canary passed auth, RBAC, tenant scope,
  idempotency replay/conflict, state transitions, audit, and rollback checks.
- The authenticated Playwright loopback proved both line matches and the final
  reconcile UI flow, exact Core POST path, bearer, UUID request ID, retry key,
  strict body, reconciled rendering, responsive overflow, zero console errors,
  and blocked external requests.
- Full gates passed: `pnpm test` (shared-types 332; database 241 passed/143
  skipped; API 764; Web 794), typecheck, lint, production build (83 Next
  pages), migration/release/policy/parity checks, web-database boundary,
  Actionlint, Gitleaks, provider-spend guard, and `git diff --check`.

## Safety boundary

The API and Web reconcile selectors remain false/empty outside the disposable
browser tenant. No hosted Supabase SQL/data, Storage, Vercel/Railway
deployment, provider setting, credential, or paid action changed.

## Next action

Source/docs commit `2e6ca43972b0b5900e471b0d847c0608491d8ac9` is pushed under
`kurtgav` with a matching remote SHA. Keep the reconcile selector closed
outside the disposable tenant. Statement voiding remains a separate next
slice.
