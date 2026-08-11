# M3.266 — Bank-statement storage source and Web/Core parity

## Summary

- Added an exact-one import source contract: bounded inline base64 CSV or a
  tenant-prefixed private Storage path.
- Added nullable `bank_statements.source_storage_path` and its format check.
- Added a server-only signed-URL reader for the private `documents` bucket,
  capped at 2 MB with timeout and fail-closed error mapping.
- Added a finance-capability signed-upload route with audit and no ERP-table
  writes.
- Added an exact-tenant Web/Core import adapter. A selected Core failure is
  terminal; the legacy Web database write is not attempted.

## Verification

Focused shared/database/storage/route/adapter/action checks and the protected
local PostgreSQL HTTP canary passed. Root `pnpm test` passed shared 55/55
files and 331 tests, database 69/73 files with 241 passed and 143
environment-skipped, Web 112/112 files and 774 tests, and API 174/174 files
and 760 tests. API integration passed 55/55 files with 69 passed and two
intentional Redis-restart skips; typecheck, lint, build, policy, parity,
release, boundary, workflow, actionlint, and spend gates passed. Source commit
SHA: `2fe1e3a`. The migration was applied only to the disposable local CI
database.

## Release boundary

Both import selectors remain false/empty. The browser form remains on the
inline compatibility path until a separate upload/browser cutover is proven.
Managed Supabase, Vercel, Railway, Storage objects, credentials, and paid
provider actions were not changed.
