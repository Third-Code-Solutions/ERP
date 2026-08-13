# M3.122 source security role baseline

Date: 2026-08-06

## Change

- Added `supabase/migrations/20260806160000_security_role_baseline.sql`.
- Revoked direct `anon` table and sequence privileges in `public`.
- Revoked matching default privileges for future public tables/sequences.
- Converted legacy policies whose only role was `public` to `authenticated`.
- Preserved explicit `authenticated` and `service_role` grants.
- Updated the disposable database verifier and anonymous-boundary test.

## Validation

- Disposable PostgreSQL 17.10 suffix replay: 97/97 migrations.
- Database verifier: all catalog checks pass.
- Database Vitest: 51/51 files, 324/324 tests, zero skips.
- Turbo tests/build, typecheck, TS-only lint: pass.
- Gitleaks 8.30.1 and Actionlint 1.7.12: pass.
- No hosted Supabase, Storage, Vercel, Railway, or tenant-data write.

## Release boundary

Hosted Supabase remains 55/97 and the controlled release remains blocked by
migration drift, duplicate Purchase Orders, missing audit-recovery tenant, and
the required clean replay/managed backup/security evidence. No deployment was
triggered; provider spend guard remains active.
