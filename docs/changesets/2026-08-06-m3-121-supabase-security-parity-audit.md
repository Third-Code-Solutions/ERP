# M3.121 Supabase security and parity audit

Date: 2026-08-06

## Scope

Read-only verification of the configured Supabase project before any hosted
migration or provider promotion.

## Evidence

- Project `aqqrtkmtcsfkbyyqxowv`: `ACTIVE_HEALTHY`, PostgreSQL 17.6.1,
  `ap-northeast-2`.
- Hosted migration ledger: 55 applied; repository: 96; 41 pending.
- Public catalog: 88 tables; all 88 have RLS enabled.
- `anon` direct table grants: 375 rows; 54 tables include write privileges;
  321 write-grant rows total.
- 56 tenant tables have policies attached to the `public` role.
- Supabase advisor MCP calls returned no records; treated as inconclusive.
- Controlled release: `review_required`; provider readiness 200; spend guard
  clear; Vercel Git deployment disabled.

## Decision

No SQL, Storage, provider, build, deployment, or tenant-data write. Anonymous
role hardening is now a release blocker. Next milestone is source-only policy
and privilege hardening with disposable PostgreSQL 17 replay.
