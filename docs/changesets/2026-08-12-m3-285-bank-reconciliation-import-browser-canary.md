# M3.285 - Bank-reconciliation import Core browser canary

Date: 2026-08-12
Status: source-only, locally verified; no production cutover

## Scope

Extended the disposable authenticated browser proof for the already-existing
Core bank-statement import adapter. The canary now submits a real CSV through
the Web form, verifies the Core request contract, and follows the created draft
without changing hosted data or enabling a production tenant.

## Evidence

- The loopback harness enables import only for its random disposable tenant and
  captures the authenticated Core request without persisting source bytes in
  the repository.
- Playwright proved strict integer-cent balances, CSV base64 transport, bearer,
  UUID request ID, deterministic `bank-import-<sha256>` idempotency key, and
  redirected draft rendering with no console or external-request failures.
- Full gates passed: `pnpm test` (shared-types 332; database 241 passed/143
  skipped; API 764; Web 797), typecheck, lint, production build (83 Next
  pages), migration/release/policy/parity checks, web-database boundary,
  Actionlint, Gitleaks, provider-spend guard, and `git diff --check`.

## Safety boundary

Import API and Web selectors are enabled only inside the disposable loopback
process. No hosted Supabase SQL/data, Storage, Vercel/Railway deployment,
provider setting, credential, or paid action changed.

## Next action

Source commit `d127523bf99fac74ac9dffbe6c0527e0af2dbe33` is pushed under
`kurtgav` with a matching remote SHA. Keep import selectors false/empty outside
the disposable tenant. Review the source-only reconciliation import evidence
before any separate storage-upload or hosted-parity work.
