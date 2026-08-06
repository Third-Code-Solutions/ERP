# Project update Core authority

## Status

The former `ERP_PROJECT_WRITES_VIA_API` flag and tenant allowlist are retired.
Project edits now use the NestJS Core read/PATCH boundary for every tenant.
There is no direct Web/SQL rollback writer. A missing Core URL, session,
read, authorization, or PATCH response fails closed and records no change.

This runbook validates the authority boundary. It does not authorize a
production deployment, hosted SQL, tenant data repair, or billing expansion.

## Required gates before any protected canary

Attach all evidence to the release artifact:

1. Reviewed Web/API source SHAs and a clean worktree.
2. PostgreSQL 17 and Redis replay with migration/catalog checks.
3. Focused Project Core tests covering allowed movement, terminal rejection,
   locked-membership denial, tenant scope, stale `updatedAt` conflict, and
   semantic audit actor identity.
4. Web action tests proving Core-only routing, Core read failure, tenant
   mismatch, capability denial, and no direct-table retry.
5. Nest `/health` and `/ready`, Auth token verification, CORS, logs, and
   rollback evidence for the exact target environment.
6. Managed backup/PITR, duplicate-record mapping, audit recovery, and spend
   approval. A local build or HTTP 200 is not sufficient.

Abort if any gate is missing. Do not use production data as a disposable
fixture and do not create a Vercel build merely to test this runbook.

## Local/self-hosted validation

Run the least-cost source lane first:

```powershell
pnpm --filter @third-code-erp/web exec vitest run "src/app/(dashboard)/projects/[id]/actions.test.ts"
pnpm --filter @third-code-erp/web exec vitest run src/lib/erp-core-client.test.ts
pnpm --filter @third-code-erp/api exec vitest run src/projects
pnpm typecheck
pnpm lint
pnpm build
```

Then run the disposable PostgreSQL/Redis integration lane and retain its
migration, RLS, audit, and rollback artifacts. The local lane proves source
behavior only; it does not prove hosted parity.

## Protected runtime canary

Only after the gates above are approved:

1. Use one designated, non-critical tenant and one designated Project.
2. Confirm `ERP_CORE_API_URL` points to the exact approved Nest deployment and
   the authenticated session belongs to the same tenant.
3. Capture a read-only Project baseline, `updatedAt`, tenant audit tail, and
   last known-good Web/API release IDs.
4. Update one non-critical field through the normal Web form.
5. Verify the Core correlation ID, committed tenant/actor, expected audit
   diff, and `updatedAt` advance.
6. Attempt a stale update and a terminal-state reopen; expect bounded 409
   errors and no row/audit mutation.
7. Restore the original business value through the same Core path and
   reconcile the append-only audit chain.
8. Exercise an unavailable Core endpoint in a controlled non-production
   environment; expect an error and zero direct database writes.

Never use operator SQL to update `public.projects` or `public.audit_log` for
this proof. Python/Cortex may advise but cannot finalize the transaction.

## Rollback and abort

Rollback is an application source/deployment rollback to the last known-good
Web/API pair. Do not reintroduce a direct writer or restore the retired flag.
If Core is unavailable, leave the Web update surface fail-closed until the
approved Core release is restored. Preserve append-only audit rows and restore
business values only through the Core command after service recovery.

Abort on readiness/auth failure, cross-tenant visibility, wrong actor,
unexpected diff, missing audit/correlation evidence, non-409 stale behavior,
terminal reopen, data drift, or any provider spend signal.
