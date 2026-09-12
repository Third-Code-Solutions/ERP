# Claim attachment direct database authority

Status: child and parent privilege boundaries locally implemented and verified; not deployed or applied to a hosted database. This is the bounded Agent 04/12 handoff, not a claim that privileged SQL administrators cannot delete evidence.

## Changes

- Added `supabase/migrations/20260912130031_claim_document_core_authority.sql`: revoke client table mutation/maintenance and independent column mutation privileges; replace old attachment write policies with restrictive client-denial policies. Existing authenticated tenant-scoped SELECT and trusted server grants remain intact.
- Added non-unique `(tenant_id, document_id)` retention-lookup index and matching Drizzle declaration. No attachment deduplication, data backfill, table/column removal, foreign-key change, or audit-trigger change.
- Added `packages/database/src/__tests__/claim-document-authority.test.ts`: actual anon/authenticated INSERT/UPDATE/DELETE denial, unchanged rows/audit on rejection, tenant-isolated reads, individual service-role grants and audited insert, valid index, and restrictive-policy protection under transactional accidental-regrant probes.

The Supabase skill's CLI filename-generation step was unavailable: neither PATH nor the workspace supplied a Supabase CLI. Used the repository's UTC timestamp convention with explicit parent approval, without installing a dependency. Current [Supabase API security documentation](https://supabase.com/docs/guides/api/securing-your-api) confirms grants and RLS are separate controls; both are retained here.

## Verification

- Created only fresh loopback PostgreSQL 17 database `erp_claim_authority_20260912`; existing `erp_claim_workflow_20260912_v3` and other databases were not reset, dropped or modified. Replayed 169 prior repository migrations and applied the new migration twice successfully. Recorded those 170 applied versions in this disposable database's migration ledger.
- RED before migration: 3 failures demonstrated authenticated INSERT grant/access and absent index; 3 existing read/service/anon proofs passed.
- GREEN: `DATABASE_HARDENING_EXPECTED=1 pnpm --config.engine-strict=false --filter @third-code-erp/database exec vitest run src/__tests__/claim-document-authority.test.ts` against the named loopback database: 7 passed.
- `pnpm --config.engine-strict=false --filter @third-code-erp/database typecheck`: passed.
- `node scripts/verify-database-repro.mjs` against that database: passed for 170 migrations, including the existing policy invariants without verifier changes. Initial execution failed only because the manual replay had not yet recorded its ledger entries; populated the verified local replay ledger and reran successfully.
- Runtime probes use rollback-only synthetic fixtures. Local runtime is Node 24/pnpm 10; authoritative CI remains the repository's Node 22 lane.

## Writer review and remaining boundary

Located explicit attachment-table application writer: `apps/api/src/documents/claim-document.service.ts`. The claim Web action now calls Core; the claim page and Core document-delete retention check read attachment rows. No explicit attachment-table SQL/RPC writer was located by repository search or the replayed public function-source scan. This is a bounded source/catalog check, not proof against every possible dynamic SQL path.

Preserved foreign keys cascade document, claim and tenant deletion into attachment removal. Parent-agent hosted read-only evidence and the fresh replay showed direct authenticated parent DELETE/TRUNCATE privileges at baseline. Child-table revocation alone cannot prevent those cascades; the separately authorized second migration below closes these direct client paths locally. Hosted state is unchanged.

Located legitimate document deletion paths:

- `apps/api/src/documents/document-delete.service.ts`: privileged Core writer with the new attachment-retention guard.
- `apps/web/src/app/(dashboard)/projects/[id]/documents/actions.ts`: privileged fallback when Core deletion is not selected. The main agent added the matching transactional retention guard in a separately owned Web change; its 9 focused tests passed, and independent source review confirmed document-before-evidence lock order and no deletion/storage cleanup after rejection. Browser-role grants do not constrain this server connection, so the guard must be released with this workflow.
- No explicit application `progressClaims` or `tenants` delete writer was found in the scoped search. Project retirement updates soft-deletion metadata, not physical deletion. Do not change claim finance/status transitions as part of this permission closure.

The parent-agent hosted function-source scan found no browser-executable explicit parent-delete RPC. This bounded scan is not proof against arbitrary dynamic SQL or privileged administration.

## Parent cascade privilege closure

- Added ordered forward migration `20260912131004_claim_document_parent_delete_authority.sql`: revoke DELETE/TRUNCATE on `documents`, `progress_claims`, `tenants` from PUBLIC/anon/authenticated, and the remaining TRUNCATE grant on `projects` (project DELETE was already revoked). Restrictive DELETE-only policies on the three cascading parents provide an accidental-regrant backstop.
- No other grants, INSERT/UPDATE/SELECT policies, FKs, rows, triggers or privileged-server behavior were changed. Compared all 60 combinations of three roles, four tables and five unrelated privileges (SELECT/INSERT/UPDATE/REFERENCES/TRIGGER) before and after local application: unchanged.
- Applied and reapplied only on `erp_claim_authority_20260912`, then recorded the new migration in its ledger; the local target now contains 171 repository migrations. No history was rewritten and v3 remained untouched.
- RED against the 170-migration target: three failures reproduced authenticated parent-delete access and the insufficient TRUNCATE privilege boundary; nine existing tests passed. The TRUNCATE probes never use CASCADE and are rollback-only.
- Extended real security proof covers actual anon/authenticated parent DELETE rejection without attachment cascade or audit damage; actual TRUNCATE permission errors; retained server DELETE grants and successful unreferenced server document deletion; and restrictive DELETE policies under accidental regrant. Application guards, not these role revocations, protect referenced evidence from trusted server writers.
- Final GREEN: the same focused security command passed all 15 tests; database typecheck passed; `verify-database-repro.mjs` passed with 171 migrations and unchanged generic RLS invariants.
- Privileged database-owner operations and approved tenant-lifecycle administration remain an explicit administrative boundary. This migration does not promise immutable evidence against the database owner, replace recovery backups, or change commercial claim transitions.

## Release and recovery

Hosted application is not authorized by this changeset. Before any release, require approved recovery evidence, target/grant/index preflight, integrated deployment of parent/fallback protections, migration rehearsal and complete Core/Web verification. Both migrations use lock timeout 5 seconds and statement timeout 60 seconds; the additive index on a larger hosted relation needs size/lock-impact review and an appropriately rehearsed build plan.

Safe rollback keeps the client-write denial and supporting index. Revert compatible application code or disable attachment submission and roll forward; do not restore unsafe historical grants/policies to make an old path work. There is no destructive down migration. No attachment or audit rows require reversal, and the retained index does not invalidate old reads. Any future privilege restoration is a separate explicit security decision, not an automatic rollback.

The dedicated local database is retained for independent verification; cleanup, if requested, must target exactly `erp_claim_authority_20260912`. No production credentials or data were copied.

→ Handoff to Agent 03/12/13: independently verify both privilege migrations with the Core and guarded fallback paths, obtain recovery evidence, then run integrated release gates. This changeset alone is not deploy-ready.
