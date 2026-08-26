# Local E2E CSP loopback gate — 2026-08-27

## Scope

Agent 12 completed the ADR-030 local browser-verification handoff. Middleware
now permits the disposable Supabase Realtime endpoint only through an explicit,
server-only local-E2E configuration.

## Changed areas

- `apps/web/src/middleware.ts`
  - replaces development-mode inference from `NEXT_PUBLIC_SUPABASE_URL` with
    `ERP_E2E_LOCAL_CSP=1` and `ERP_E2E_SUPABASE_ORIGIN`;
  - accepts only the exact origin form `http://127.0.0.1:<valid-port>` and
    derives exactly one corresponding `ws://127.0.0.1:<port>` source;
  - rejects missing, malformed, credentialed, path/query/fragment-bearing,
    wildcard, non-loopback, non-HTTP, and invalid-port values;
  - disables the augmentation for Vercel-hosted runtimes, including production
    and preview deployments.
- `apps/web/src/middleware.test.ts`
  - proves the exact loopback pair, all rejected forms, public-URL non-authority,
    and byte-exact hosted `connect-src` regression behavior.

## Local matrix configuration

Run the local production-mode app with only these non-public, server-side
values for the disposable target:

```text
ERP_E2E_LOCAL_CSP=1
ERP_E2E_SUPABASE_ORIGIN=http://127.0.0.1:55321
```

They are ignored by hosted Vercel runtime detection and are absent by default.

## Verification

- PASS — `pnpm --filter @third-code-erp/web exec vitest run src/middleware.test.ts`
  - 27 tests passed.
- PASS — `pnpm --filter @third-code-erp/web lint`.
- PASS — `pnpm --filter @third-code-erp/web typecheck`.

## Handoff

→ Handoff to the release captain / authenticated-role-matrix owner. Reason:
the local role-matrix app can now connect only to the validated disposable
Supabase Realtime origin, while hosted CSP remains unchanged. Inputs: the two
local-only variables above and the clean `erp-e2e-disposable` fixture. Expected
output: run the authenticated matrix and retain NO-GO if any browser or role
assertion fails.
