# M3.217 - CAD parser-to-Core canary boundary

## Outcome

CAD parsing now emits strict worker evidence without writing scope rows or
draft BOMs. Exact-allowlisted upload tenants commit through Nest Core; Core
failure is terminal and never falls back to the compatibility writer.

## Changed

- Added `parseCadEvidence` and retained `parseAndStoreCad` compatibility wrapper.
- Wired the closed CAD selector to the existing Core commit adapter.
- Added parser-boundary and upload route regressions.

## Evidence and limits

Parser 2/2, route 10/10, adapter 4/4; root tests (shared 315, API 736, Web
749), lint, typecheck, production build (82/82 routes), boundary, migration,
workflow-reference, provider-spend, and diff checks pass. Disposable
PostgreSQL/RLS replay, protected browser proof, hosted release identity, and
provider deployment remain unverified. No SQL, Supabase,
Vercel, Railway, flag, or paid state changed.
