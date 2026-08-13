# M3.135 - Project status state machine

Date: 2026-08-07
Source commit: `97c41f8`

## Change

- Add shared, explicit Project status transitions.
- Enforce transitions inside the NestJS Core update transaction after row
  locks and before mutation/audit.
- Preserve same-state metadata edits while preventing terminal-state reopen.
- Add shared contract and service regression coverage.

No migration, feature flag, hosted SQL, Vercel build, Railway deploy, or
provider mutation was introduced. Legacy Web fallback remains a separate
convergence task.

## Validation

- Shared-types: 27 files / 229 tests.
- Focused Project service/HTTP tests: 22/22.
- Self-hosted PostgreSQL 17.10/Redis 7.4.9 replay: 98/98 migrations and
  Project API integration passed.
- Serial workspace tests: database 47/51 files with 141 compatibility skips,
  API 112/480, Web 89/581.
- Production build: 81/81 routes.
- Typecheck, lint, migration verifier, Actionlint, Gitleaks,
  controlled-release 5/5, and provider-spend 4/4 passed.

## Release boundary

Hosted Supabase, Vercel, Railway, and ERP canaries remain closed until legacy
fallback convergence and parity, security, rollback, identity, audit, and
spend evidence are approved.
