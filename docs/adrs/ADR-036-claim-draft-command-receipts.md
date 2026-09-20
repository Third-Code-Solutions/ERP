# ADR-036: Durable claim-draft commands

- Status: Accepted for implementation; production release remains gated
- Date: 2026-09-14
- Scope: Existing progress-claim draft creation, not claim transitions or statutory accounting

## Context

The existing claim form parses peso text through floating-point arithmetic and
accepts numeric prefixes. Claim-number allocation uses lexical maximum, which
breaks beyond PC-99999. Domain insertion and the semantic audit are separate
commits; existing database row-audit triggers do not provide an original command
receipt. Retrying an uncertain response can create a second claim.

## Decision

Add a Core command at `POST /v1/projects/:projectId/claims/drafts`. Preserve the
existing capability union: `kyc.create_ar_code` or `precon.manage_checklist`.
No WAR, COC, retention, tax, invoice or approval prerequisite is added to drafts.
Existing project-picker status filtering remains; lifecycle admission rejects
retired projects and inactive actors/tenants without inventing a new status policy.

Input is `{clientRequestId, projectId, milestonePct, amountCents, description}`.
UUIDs normalize to lowercase, milestone remains integer 0–100, amount is positive
safe integer centavos, description is nullable (empty means null) and bounded at
5,000 characters. Web reuses the existing exact BigInt peso parser and rejects
malformed, over-precision and unsafe amounts rather than rounding them.

Return `{projectId, created, changed, receipt}`. Receipt schema version 1 binds
operation `create_draft`, tenant, current actor, project, request UUID, canonical
payload SHA-256 and the original claim snapshot (id, claim number, milestone,
amount, description, draft status, creator and timestamp). Fresh creation sets
created/changed true; exact replay returns the original receipt with both false,
even after a later claim transition. Never reconstruct an original receipt from
the mutable claim. Conflicting identity/payload or malformed receipts fail closed.

Use the existing append-only semantic audit store, atomically with insertion.
Current actor/tenant/project admission and bounded locking precede receipt lookup.
Allocate numeric PC suffixes under tenant serialization; preserve all existing
numbers and data. Unique conflicts and lock errors must be safe and bounded.
No new dependency, schema, audit-history edit or production-data export.

Web commands retain their immutable request/payload through uncertain responses,
prevent parallel dispatch, validate original receipt scope/content, and fence stale
scope results. A refresh failure after confirmation is a warning, not a rollback.
Old and new Web paths must not silently replace a dispatched request identity.

## Verification and release

Prove exact money parsing, numeric sequence rollover, actual PostgreSQL atomicity,
concurrency, replay after later transition, identity conflicts and current lifecycle
admission. Test Web trust boundaries and browser retries/permissions/scope changes
at 320, 768, 1024 and 1440 pixels. Synthetic evidence is not production verification.

Production backup/restore and coordinated Core/Web release gates remain. This
command does not claim global write authority over all legacy claim transitions
or direct table writers. Those boundaries remain separately tracked work.
