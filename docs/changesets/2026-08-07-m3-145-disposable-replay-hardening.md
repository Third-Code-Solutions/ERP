# M3.145 - Disposable replay hardening

## Scope

- Align `scripts/verify-database-repro.mjs` with the Core-only Cost Entry
  authority introduced by M3.142.
- Assert that the `authenticated` role cannot INSERT, UPDATE, or DELETE
  `cost_entries`.
- Update the runtime hardening proof so permitted business roles are denied
  direct browser writes.

## Validation

- Disposable PostgreSQL 17 / Redis 7.4.9 lane: 100/100 migrations.
- Database no-skip suite: 53/53 files, 329/329 tests.
- Nest API integration: 20/20 files, 27/27 tests.
- Redis restart/reconnect and database-pending recovery passed.
- Schema before/after SHA256 identical:
  `18D2840CE47084F159BDF5037F74AE51BD24418EF8F63943096F996509BB6FFC`.
- Serial workspace tests, typecheck/lint, production build 81/81 routes,
  migration verifier, Actionlint, Gitleaks, controlled-release 5/5, and
  provider-spend 4/4 passed.

No hosted Supabase SQL, Vercel build, Railway deploy, provider variable, or
tenant data changed. Disposable services were stopped and cleaned.

## Rollback

Rollback is the reviewed prior source release. Do not restore browser Cost
Entry grants; Core-only authority and the closed feature flags remain the
safe default.
