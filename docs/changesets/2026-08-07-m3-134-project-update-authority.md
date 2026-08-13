# M3.134 - Project-update authority hardening

Date: 2026-08-07
Source commit: `5534046`

## Change

- Lock the caller's tenant membership inside the existing NestJS Project
  update transaction.
- Recheck the stored role's `project.update` capability before locking or
  mutating Project state.
- Use the rechecked database principal for tenant predicates, actor context,
  optimistic-concurrency mutation, and semantic audit.
- Add regression coverage for a forged admin-shaped principal against a locked
  viewer membership.

No migration, feature flag, hosted SQL, Vercel build, Railway deploy, or
provider mutation was introduced.

## Validation

- Focused Project authority tests: 21/21.
- Self-hosted PostgreSQL 17.10/Redis 7.4.9 replay: 98/98 migrations and
  Project API integration passed.
- Serial workspace tests: shared 27/228; database 47/51 files with 141
  compatibility skips; API 112/479; Web 89/581.
- Production build: 81/81 routes.
- Typecheck, lint, migration verifier, Actionlint, Gitleaks,
  controlled-release 5/5, and provider-spend 4/4 passed.

## Release boundary

Reviewed source remains provider-neutral. Hosted Supabase, Vercel, Railway,
and ERP canaries remain closed until parity, security, rollback, identity,
audit, and spend evidence are approved.
