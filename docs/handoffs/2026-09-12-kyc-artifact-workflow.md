# KYC artifact workflow

## Outcome and approved policy

Replace raw document UUID entry with readable, paginated account-scoped document selection, backed by the same authoritative relationship check during submission. Preserve metadata-only artifacts, existing artifact history, existing artifact kinds and notes limit, and the current `account.create` permission. Do not add new KYC-status restrictions or change dual-track approval decisions.

On 2026-09-12 the user explicitly approved consistent legacy inheritance: an opportunity document may inherit its project's account only when no direct account is set and all populated relationships agree. Reject conflicting or unresolved ownership. Direct project/account and opportunity/account relationships remain supported. Accounts without eligible documents retain an honest empty state and metadata-only submission. Account-only uploads are a separate intake/data-model capability, not silently invented here.

This branch starts from claim candidate `52685085c65b8f407a8d738afe3edd2d3009c44b` in draft PR 67, reusing its reviewed nonblocking audit admission and retention groundwork. It is a dependent local slice, not part of production commit `81393e10a36ab4e2c322d6ec77c0f0bafef4282d`. No production migration or provider setting change is authorized by this note.

## Sequential ownership

1. Agent 05/12 (Astra): define strict account-document query and KYC artifact command contracts; implement one eligibility rule for listing and submission. Recheck current active user/tenant and `account.create`; lock relevant account, relationship and document rows; reject cross-tenant, cross-account, conflicting and unresolved ownership. Use artifact UUID as request identity, normalized payload plus uploader for exact replay, and atomic insertion/audit with safe contention handling. Preserve metadata-only submission across KYC statuses. First prove relationship and retry behavior with failing tests, then implement; no Web or migration edits in this step.
2. Agent 03 (Luna after contract handoff): retire only the legacy artifact writer in favor of Core, verify returned identity/scope, show the form only for current permitted roles, implement labelled search/pagination/selection, readable parent context, loading/empty/error/retry/success, metadata-only choice, and immutable uncertain retries. Use existing styles and preserve unrelated account and KYC-review flows. Browser proof covers 320/768/1024/1440 px, keyboard/focus, search/pagination, stale results and retry safety.
3. Agent 04/12: independently inspect actual artifact and parent/delete authority, existing document/opportunity deletion paths and audit behavior before choosing narrow hardening. Preserve existing artifacts and foreign keys. Any migration needs local PostgreSQL privilege/isolation/replay/index/lock proof and safe recovery; do not treat application checks as direct-client closure. Surface any retention or lifecycle policy decision that source evidence cannot settle.
4. Agent 13: independently integrate, run relevant local and locked CI gates, verify actual browser/API/PostgreSQL journeys and all permitted/denied roles, and record exact evidence. Keep the existing backup/PITR, Storage recovery and isolated restored-clone rehearsal gate for hosted migrations. No skipped test or synthetic replay may be represented as production recovery proof.

No agents edit the same files concurrently. Each handoff states its exact contract, verification and remaining limits before the next writer starts.

## Contract handoff and retention review

Agent 05 completed shared contract edits before Agent 03 began separate Web files. Core implementation and Web implementation may proceed on disjoint files. The strict contracts are in `packages/shared-types/src/erp-api/kyc-artifacts.ts`: account-scoped document options include independent resolution of the selected eligible document, and artifact creation uses a normalized immutable request UUID and payload. Both routes require `account.create`.

Read-only hosted catalog inspection on 2026-09-12 inspected `account_kyc_artifacts`, `accounts`, and `opportunities` on the existing Supabase project. Each had enabled (not forced) RLS, tenant-only permissive authenticated CRUD policies, authenticated SELECT/INSERT/UPDATE/DELETE/TRUNCATE, no corresponding anonymous table grants, and preserved service-role grants. This proves application checks alone do not close direct-client authority. No business rows were queried and no hosted configuration or data was changed. Direct-client closure remains pending a narrow migration and disposable PostgreSQL proof; hosted application remains subject to the existing recovery gate.

Source review found the KYC document FK uses `ON DELETE SET NULL`, which could erase evidence linkage and alter replay identity. Main owns the Core and legacy Web document-delete guards and their focused tests. These now reject referenced KYC documents after acquiring the document update lock, before derived-row deletion or Storage cleanup. The artifact writer's document share lock supplies the corresponding serialization boundary. Concurrent PostgreSQL proof is handed to Agent 05. No parent account/opportunity locks are added to deletion.

The delete in `opportunity-creation.service.ts` is cleanup of an opportunity inserted earlier in the same uncommitted transaction, not a general existing-opportunity deletion path. It does not need a speculative KYC guard. Parent direct-client grants still need separate review.
