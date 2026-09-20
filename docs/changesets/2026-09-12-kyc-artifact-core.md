# KYC artifact Core authority

Status: local Agent 05/12 slice implemented and verified; no provider writes, migration application, commit or deployment. User-approved relationship policy is recorded in `docs/handoffs/2026-09-12-kyc-artifact-workflow.md`.

## Contract and behavior

- Strict exported `AccountKycDocumentQuery/Result/Row` and `KycArtifactCreateCommand/Result` schemas in `packages/shared-types/src/erp-api/kyc-artifacts.ts`.
- `GET /v1/crm/accounts/:accountId/kyc-document-options`: bounded literal filename search, stable created-at/UUID ordering, exact pagination and separately resolved eligible selection independent of page/search. Returns readable project/opportunity context, never Storage paths or URLs. Count/page/selection share a read-only repeatable-read snapshot.
- `POST /v1/crm/accounts/:accountId/kyc-artifacts` (200): artifact UUID is `clientRequestId`; optional document normalizes to null, notes trim to null when blank with the existing 2,000-character limit. Existing artifact kinds, metadata-only entries and every KYC status remain supported. Result binds artifact/account/tenant/document identities plus `changed`.
- Both routes require current active user/tenant and the existing `account.create` capability (owner/admin/sales). Creation rechecks and SHARE-locks membership inside the transaction; it does not trust a stale principal role.
- One eligibility predicate serves list and final mutation checks: every populated project/opportunity relationship must resolve within the tenant to the requested account. Opportunities inherit project ownership only when their direct account is absent; conflicting or unresolved project relationships are rejected. Retired projects are not new attachment sources. Existing artifacts are not rewritten or reclassified.
- Exact normalized replay also compares uploader. It remains a success after later relationship/status changes. Changed payload/account/actor reuse conflicts; a foreign-tenant UUID collision returns an opaque identity-unavailable conflict.

## Transactions and contention

Creation obtains a namespaced per-tenant/request advisory transaction lock before entity locks. Account SHARE stays compatible with existing conversion's opportunity-to-account SHARE order; an account UPDATE lock would introduce a reverse-order risk. Document eligibility locks opportunity, sorted project IDs, then document; changed document pointers return a deliberate same-request retry conflict. Final eligibility is checked after those locks. The existing nonblocking tenant-audit admission happens before artifact INSERT, so busy audit chains return a safe 409 without persisted effects. Artifact and semantic audit commit atomically.

The main agent separately added Core/legacy Web KYC document-retention guards. This slice proves the actual Core guard against committed and concurrent artifacts; it does not claim a browser or real Storage cleanup test of the legacy path.

## Verification

- RED: shared contract test failed on missing contract module; PostgreSQL behavior suite failed on missing service; protected HTTP test failed on missing controller before their respective implementations.
- First executable PostgreSQL run passed 11/12; remaining fixture lacked required suspended-user status metadata. Corrected the fixture without relaxing the database check. Corrected a synthetic HTTP role name to the actual canonical `finance` role.
- GREEN: `ERP_API_INTEGRATION_EXPECTED=1 pnpm --config.engine-strict=false --filter @third-code-erp/api exec vitest run src/crm/kyc-artifact.controller.spec.ts src/crm/accounts.service.spec.ts src/documents/document-delete.service.spec.ts integration/kyc-artifact.database.integration.spec.ts` passed 44 tests with zero skips against existing synthetic loopback `erp_claim_ci_grants_20260912`.
- The 20 real PostgreSQL cases cover direct/inherited/conflicting/unresolved relationships, literal wildcard search, selected resolution, pagination, tenant isolation, all KYC statuses, changed/exact replay, cross-actor/account/tenant identity reuse, suspended user/tenant, audit rollback, simultaneous identical requests, audit contention and retry, ownership reassignment, document-pointer mutation, and both attach/delete interleavings. Race assertions observe distinct backend PIDs and `pg_blocking_pids`, not timing alone.
- The protected HTTP matrix exercises every canonical ERP role through real JWT/capability guards with a synthetic identity boundary. Expected allowed roles are fixed owner/admin/sales, not derived from the function under test. This is not demo-login E2E.
- Shared contract tests: 3 passed. API and shared-types typechecks passed; a dedicated in-memory API TypeScript program including the otherwise-excluded PostgreSQL spec passed. Focused API production-source ESLint passed; test files are excluded by repository ESLint configuration. `git diff --check` passed.
- Local runtime Node 24/pnpm 10 differs from authoritative Node 22 CI. CI and Web integration remain main-agent gates. No retained database was reset or dropped; committed UUID-isolated synthetic fixtures retain append-only audit history.

## Remaining boundaries and handoff

→ Agent 03: consume the stable shared contract, replace only the legacy artifact writer, preserve immutable uncertain retries and metadata-only submission, and verify returned scope plus readable selection/browser states.

→ Agent 04/12/13: direct-client artifact and cascading-parent authority is not closed by this command. Preserve historical artifact data/FKs; independently complete privilege/index/retention review and real privilege tests before integrated release. Existing application artifacts may be deleted or unlinked by unclosed direct database paths, which can invalidate durable replay. Hosted backup/PITR, Storage recovery and isolated restore/migration rehearsal remain mandatory; local synthetic evidence does not satisfy those release holds.
