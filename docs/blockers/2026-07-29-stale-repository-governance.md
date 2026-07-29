# Stale repository governance

## Finding

`AGENTS.md` requires a bootstrap read of
`docs/Third Code ERP_PRD_v1.md`, but no matching PRD file exists. Its stack
lock also requires pnpm 9, PostgreSQL 16, tRPC, and Inngest, conflicting with
the explicit owner-approved target:

- pnpm 10
- Next.js frontend/BFF
- NestJS modular-monolith transaction authority
- PostgreSQL 17
- Redis and BullMQ
- Python analysis-only workers

## Current handling

Current owner-approved files under `docs/architecture/` govern implementation.
No application work may use the obsolete stack rules. `AGENTS.md` remains
unchanged because it requires explicit owner sign-off.

## Resolution required

Approve one dedicated governance change that:

1. establishes the canonical product-requirements document path;
2. aligns stack and agent boundaries with the current architecture;
3. removes obsolete tRPC/PostgreSQL 16/pnpm 9/Inngest-as-target rules;
4. preserves tenant isolation, transactional audit, security, and release
   gates;
5. updates the file's owner sign-off date.

This does not block remaining M1 canary work. It must be resolved before M2
application code begins.
