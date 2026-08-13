# M3.133 - Project-create authority hardening

Date: 2026-08-07
Source commit: `6276d10`

## Change

- Lock the caller's tenant membership row inside the existing NestJS project
  create transaction.
- Recheck the stored role's `project.create` capability before idempotency or
  mutation.
- Use the rechecked database principal for actor context, idempotency,
  tenant-scoped insert, and semantic audit.
- Add regression coverage for a forged admin-shaped principal against a locked
  viewer membership.

No migration, feature flag, hosted SQL, Vercel build, Railway deploy, or
provider mutation was introduced.

## Validation

- Focused project authority tests: 20/20.
- Self-hosted PostgreSQL 17.10/Redis 7.4.9 replay: 98/98 migrations and
  project-create integration passed.
- Serial workspace tests: shared 27/228; database 47/51 files with 141
  compatibility skips; API 112/478; Web 89/581.
- Production build: 81/81 routes.
- Typecheck, lint, migration verifier, Actionlint, Gitleaks,
  controlled-release 5/5, and provider-spend 4/4 passed.

## Release boundary

The reviewed branch is source-only. Hosted Supabase, Vercel, Railway, and ERP
canaries remain closed until parity, security, rollback, identity, audit, and
spend evidence are approved.
