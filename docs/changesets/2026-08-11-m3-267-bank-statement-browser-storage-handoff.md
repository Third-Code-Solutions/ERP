# M3.267 — Bank-statement browser Storage handoff

## Summary

- Added an exact-tenant, closed-by-default browser Storage selector that also
  requires the existing Web/Core import selector.
- Added a typed signed-upload transport that uploads directly to the private
  `documents` bucket and retains the path for cleanup on failure.
- Updated the form to keep inline base64 as the default and to never fall back
  to a legacy Web write after Storage is selected.
- Added an audited tenant-scoped DELETE cleanup route and server-action gate.

## Verification

Focused helper 3/3, signed-upload route 6/6, Web action 6/6, and Core selector
165/165 tests passed. Root `pnpm test` passed shared 55/55 files and 331 tests,
database 69/73 files with 241 passed and 143 environment-skipped, Web 113/113
files and 782 tests, and API 174/174 files and 760 tests. API integration
passed 55/55 files with 69 passed and two intentional Redis-restart skips.
Typecheck, lint, production build, database release, parity, Web/DB boundary,
workflow-reference, provider-spend, actionlint, and gitleaks passed. Browser
E2E against an authenticated disposable tenant was not run. Source commit SHA:
`20f2b76953688b02a12b6bcca0f53455282421e5`.

## Release boundary

All API/Web import and Storage-upload selectors remain false/empty. No database
migration, managed Supabase SQL/object, Vercel or Railway deployment, provider
setting, credential, or paid action changed.
