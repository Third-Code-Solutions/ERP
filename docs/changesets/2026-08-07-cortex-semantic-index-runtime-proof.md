# M3.156 Cortex semantic-index runtime proof

## Change

- Add disposable PostgreSQL RLS/privilege proof for the server-owned semantic
  index job table.
- Add always-rollback PostgreSQL and real local BullMQ integration coverage
  with a deterministic fake embedding worker.
- Record the local evidence and remaining release gates in architecture and
  operations memory.

## Validation

- PostgreSQL 17.10 migrations: 104/104.
- Database: 341/341, zero skips.
- API integration: 31/31 across 44 suites, zero failures/pending.
- Focused database: 4/4.
- Focused API: 3/3.
- API/database typecheck: pass.
- API source/e2e: 546/546.
- Ordinary no-database tests: 198 passed, 143 expected environment skips.
- Workspace lint/typecheck: pass.
- NestJS/Next.js production build: pass, 82 static pages.
- Provider-spend 4/4 and controlled-release 5/5: pass.
- Actionlint, Gitleaks across 539 commits, pinned workflow refs, diff checks,
  and clean-room scan: pass.
- Schema SHA-256:
  `4DDF4B3D24906CA2328790342E6406636080BE5475AA0138DF8E7431D615E9F6`.
- Disposable database and Redis: removed after validation.

## Unresolved gates

- Managed Supabase remains last verified at 55/104 migrations.
- M3.152 owner-approved Purchase Order mapping and complete backup/PITR restore.
- Auth-safe protected desktop/mobile browser proof.
- Exact-tenant, spend-ceiling, and rollback-owner approval before any real
  provider call.

## Rollback

Revert the two test files and this documentation changeset. Production runtime
behavior does not change. Keep all semantic-index flags false, tenant
allowlists empty, AI worker variables absent, and legacy embedding disabled.
No database rollback, hosted action, or deployment is required.
