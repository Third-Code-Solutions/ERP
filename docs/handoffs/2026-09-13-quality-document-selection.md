# QA/QC project-document selection

## Scope

Complete the existing rejected-IWR punchlist handoff's project-document selection
without requiring a user to paste a UUID. PRD post-MVP plan pinning remains the
source requirement. Existing eligibility accepts a document belonging to the
same tenant and project; no approved-version status is invented or required.

Preserve optional attachment, existing source evidence, audit/idempotency rules,
all financial/BOM behavior and server-side authorization. No new dependencies,
migrations or hosted data access are planned. This branch follows PR #79; its CI
and production release holds remain independently tracked.

## Ordered ownership

1. Agent 05: existing project-document Core adapter gains strict request/result
   binding and access-error containment, with regression tests. Main then adds a
   capability-gated Web read action with typed pagination and scope validation.
2. Astra security inspection: inspect the actual punchlist handoff transaction,
   document-list authority and lifecycle admission. Report concrete prerequisites
   before any backend change; do not silently broaden schema or business policy.
   Verified prerequisites now assigned to Agent 05/Astra: handoff-only current
   active actor and tenant SHARE NOWAIT admission retained through audit; document
   list active membership predicate; stored clientRequestId in create/replay
   receipts, without comparing mutable punchlist contents. Add actual PostgreSQL
   concurrency, isolation and audit rollback evidence. Preserve existing locks,
   all-role document-read policy and document eligibility. No migration is needed.
   Main owns compatible controller negotiation: only callers sending
   `x-erp-receipt-version: 1` receive the bound receipt. Unversioned callers retain
   the exact legacy shape, and unsupported versions fail before mutation. Deploy
   Core first, then Web; new clients must not confirm an unbound old receipt.
3. Frontend owner: use the fixed read-action contract for an on-demand paginated
   selector with filename/type/date, persistent selection, explicit Clear,
   loading/empty/error/retry, stale-scope response protection and keyboard access.
   Integrate into the existing handoff only after action ownership is handed off.
   Preserve the exact submitted document choice during uncertain mutation results;
   do not label an ambiguous remote outcome as not committed.
4. Browser owner: verify real production components and controlled action
   boundaries in Chromium, including paging, selection, retry, scope changes,
   uncertain submission and 320/768/1024/1440px layouts. Fixtures are not hosted
   all-role proof. Main separately verifies action/Core authorization.
5. Agent 13: CI coverage, required changeset, final review and draft PR after
   proportionate checks. No production release until inherited gates are met.

Disjoint tests/components may run concurrently against an agreed contract. No
two owners edit the same file. Each handoff supplies paths and evidence before
the next owner edits them.
