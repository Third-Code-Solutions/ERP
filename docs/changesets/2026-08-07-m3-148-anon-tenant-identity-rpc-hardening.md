# M3.148 anonymous tenant-identity RPC hardening

## Scope

- Revoke implicit `public` and explicit `anon` EXECUTE on
  `public.auth_tenant_id()`.
- Preserve the helper for authenticated tenant RLS and trusted service work.
- Enforce the contract in static tests, runtime tests, and the database
  reproducibility verifier.
- Record local desktop/mobile landing QA without changing UI source.

## Changed source

- `supabase/migrations/20260807140000_revoke_anon_tenant_identity_rpc.sql`
- `packages/database/src/__tests__/tenant-identity-rpc-hardening.test.ts`
- `scripts/verify-database-repro.mjs`

Source checkpoint: `9c2b64b81b64b91de013d470e3147c3817dab27b`.

## Validation

- Focused database contract test: passed; runtime skipped only without
  `DATABASE_URL`.
- Migration verifier files-only: 102 files, passed.
- Serial workspace tests, typecheck, lint: passed.
- Production build: passed, 81/81 routes.
- Actionlint and Gitleaks: passed.
- Controlled-release: 5/5 passed.
- Provider-spend guard: 4/4 passed.
- Disposable PostgreSQL 17/Redis 7.4.9: 102/102 migrations, database
  334/334, API integration 27/27, Redis recovery passed.
- Schema before/after:
  `278B8F024CED178A943B9E22FB14B9CD3BC7AEC3E339269E9DD20969B4B20843`.
- Local browser QA: desktop/mobile layout and interactions passed; zero
  console errors; no failed dynamic requests.

## Release and rollback

Hosted state is unchanged. Managed Supabase remains 47 migrations behind
source. Vercel/Railway deployments and ERP canaries remain closed.

If this migration is later approved and must be reversed, revoke EXECUTE from
`authenticated, service_role` only if replacing the dependent RLS helper;
otherwise restore the prior anonymous grant explicitly with a reviewed
migration. Do not edit the managed migration ledger manually.
