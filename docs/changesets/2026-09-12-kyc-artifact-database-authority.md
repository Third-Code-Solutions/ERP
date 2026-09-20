# KYC artifact database authority

Status: local Agent 04/12 implementation and PostgreSQL proof. No hosted schema, privileges, data, recovery configuration or migration history changed. Existing claim authority migrations remain prerequisites, not duplicated here.

## Changes

- `supabase/migrations/20260912142153_kyc_artifact_core_authority.sql`: revoke artifact INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER from PUBLIC, anon and authenticated, including independent column INSERT/UPDATE/REFERENCES grants. Replace tenant-only mutation policies with restrictive client-denial policies; preserve SELECT and trusted server grants.
- Revoke accounts/opportunities DELETE/TRUNCATE and add restrictive DELETE backstops without changing other writes. Revoke only users TRUNCATE; preserve controlled administration and existing foreign keys.
- Add nonunique `(tenant_id, document_id)` index `idx_account_kyc_tenant_document` in SQL and `packages/database/src/schema/account-kyc.ts`. No artifact deduplication, data backfill, column/FK removal, audit mutation or lifecycle rewrite.
- `packages/database/src/__tests__/kyc-artifact-authority.test.ts`: role mutation/cascade rejection, unchanged evidence/audit, tenant-isolated reads, accidental regrant backstops, valid index, preserved real service insertion/audit and authenticated account/opportunity updates, representative pre-migration grant preservation, and bounded migration lock contention.
- Add only two lifecycle evidence cases to `apps/api/integration/kyc-artifact.database.integration.spec.ts`; no Core business logic changed.

The Supabase skill requires CLI-generated migration filenames, but no `supabase` executable was available in PATH or the checked local bin location. With explicit parent approval, used `apply_patch` and the actual UTC clock value `20260912142153`, without installing a dependency. Reviewed current [Supabase API security guidance](https://supabase.com/docs/guides/api/securing-your-api): grants and RLS are independent controls. Changelog Markdown fetch was unsupported by the browser tool; reviewed its HTML equivalent. No provider tooling was used for writes.

## Verification

- Used only existing synthetic loopback PostgreSQL 17 database `erp_claim_authority_20260912`; did not reset/drop it or any other database. Preserved `erp_claim_ci_grants_20260912` for main-agent integration. Applied and reapplied the new SQL successfully, then recorded the verified application in the local ledger (172 migrations).
- RED: `DATABASE_HARDENING_EXPECTED=1 pnpm --config.engine-strict=false --filter @third-code-erp/database exec vitest run src/__tests__/kyc-artifact-authority.test.ts` produced six failures/one pass before migration: active authenticated mutation, insufficient maintenance denial, absent restrictive backstops/index and missing candidate migration.
- GREEN: KYC authority nine tests and existing claim authority sixteen tests passed together (25/25) using `vitest run --no-file-parallelism ...`. Parallel files initially reproduced one PostgreSQL deadlock between overlapping rollback-only DDL/grant tests. Main owns the hardening-lane serialization fix; no assertion, database guard or concurrency test was skipped or retried to hide it.
- Representative-grant test grants access only inside rollback, executes the real candidate SQL with verified outer transaction wrappers removed, and proves preserved authenticated SELECT/server CRUD/TRUNCATE, unchanged account/opportunity INSERT/UPDATE/REFERENCES/TRIGGER and removed client privileges. A temporary future column with independent PUBLIC/anon/authenticated grants proves dynamic column revocation. All temporary DDL/grants and fixture rows roll back.
- Actual migration contention returns `55P03` under the migration's 5-second lock timeout, preserving the relation ACL. No broad cascade or destructive cleanup is used.
- A normal `EXPLAIN (ANALYZE, BUFFERS)` for tenant/document lookup chose `idx_account_kyc_tenant_document` without planner overrides. The tiny synthetic lookup is index-use proof, not a hosted-scale latency claim.
- `node scripts/verify-database-repro.mjs` passed for 172 migrations with existing generic RLS/security checks unchanged. Database typecheck passed.
- Core PostgreSQL suite passed 22/22 against the migrated synthetic target, including the two lifecycle cases below. Node 24/pnpm 10 local execution is not the authoritative Node 22/Supabase CLI CI lane.

## User lifecycle evidence and remaining boundary

The existing schema declares artifact `uploaded_by ON DELETE SET NULL`, but it does **not** follow that audited users can actually be deleted. A real privileged deletion after a Core artifact creation failed with SQLSTATE `XX000` from `audit_log_actor_id_users_id_fk`: the actor SET NULL update conflicts with the append-only audit update rule. The failed statement leaves user, artifact and audit unchanged. The regression asserts that observed behavior; no audit rule or FK was weakened. Main separately owns inspection of the administrative application lifecycle and any Auth-before-database partial-failure risk.

A separately labelled synthetic historical artifact with a null uploader remains intact. A missing principal is forbidden before replay checks, and a different active actor cannot reuse its request identity. This fixture is not represented as evidence of successful user deletion.

## Release and recovery

→ Handoff to Agent 03/13 for integrated Web/Core verification, narrow CI fixture parity and source-manifest updates. Main owns those files. Fresh Supabase CLI fixtures may lack preserved legacy SELECT/service grants; the rollback-only migration test must remain so post-migration fixtures cannot mask accidental access revocations.

Keep the existing hosted backup/PITR, Storage recovery and isolated restored-clone/migration rehearsal holds. This local synthetic application is not restore proof. Review relation size and the non-concurrent index build's lock impact before hosted execution; SQL uses 5-second lock and 60-second statement timeouts. Safe recovery retains privilege denials and the index, disables submission if needed, and rolls forward. Never restore unsafe historical grants automatically or erase artifacts/audit history. Privileged database-owner lifecycle actions remain an explicit administrative boundary.
