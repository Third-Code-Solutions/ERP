# M2 document-processing evidence design

## Outcome

Recorded original Third Code ERP contract for moving CAD processing from direct
Python/Next.js writes to an evidence-only Python service and idempotent,
tenant-scoped NestJS transaction authority.

## Runtime impact

None. Documentation only.

No application code, schema, business data, Auth user, Storage object, queue,
provider setting, or deployment changed.

## Evidence

- Complete source call graph traced.
- Hosted PostgreSQL 17.6 catalog inspected read-only.
- RLS exists on `documents` and `scope_items`.
- Composite tenant/Project constraints and audit triggers are absent on both.
- BullMQ foundation exists with no registered business processor.
- Vercel deployment count remains zero after Git disconnect.

## Next gate

Complete M1 canary evidence and obtain separate owner approval to reconcile
stale `AGENTS.md` before implementing inert M2.1.

## Rollback

Revert this documentation changeset and its memory updates. Runtime and
provider rollback is unnecessary.
