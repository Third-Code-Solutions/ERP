# M3.216 - Web-to-Nest CAD evidence adapter

## Outcome

Web now has a closed exact-tenant, server-only client for the existing Nest
CAD evidence commit transaction. No upload or parser canary is enabled.

## Changed

- Added strict worker-response validation before Core network calls.
- Added authenticated, idempotent `POST /v1/documents/:documentId/cad-evidence`
  adapter with strict result validation and terminal failures.
- Added exact tenant selector and environment documentation.

## Evidence and limits

Focused adapter tests pass 4/4; root tests (shared 315, API 736, Web 745),
lint, typecheck, production build (82/82 routes), Web DB-boundary,
migration files-only, workflow-reference, provider-spend, and diff checks
pass. Parser/auto-BOM parity, disposable PostgreSQL/RLS replay, protected
browser proof, hosted release identity, and provider deployment remain
unverified.
No SQL, Supabase, Vercel, Railway, flag, or paid state changed.
