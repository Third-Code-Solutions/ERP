# ADR-018: Project budgets are versioned control baselines

- Status: Accepted
- Date: 2026-07-27

A BOM is an estimate and scope artifact. A Project Budget is the approved cost
control baseline. Third Code ERP keeps them related but distinct so changes do
not silently rewrite historical performance.

Cost Codes are tenant-owned dimensions with one operational category. Each
Project Budget is an immutable revision containing one or more Cost Code
lines. Draft revisions may change. Submission freezes the draft. Commercial
and Finance approve separate lanes; the final approval supersedes the prior
baseline atomically. The same user cannot approve both lanes unless the actor
is the Owner, whose override remains explicit and audited.

Purchase Order lines, Supplier Bill lines, and manual Cost Entries carry the
same Cost Code. Issued or confirmed Purchase Orders become commitments.
Posted Supplier Bill lines and manual non-PO costs become actuals. Forecast at
completion is calculated per Cost Code as the greater of commitment and actual
before roll-up, preventing PO-to-bill double counting.

Every approved budget chooses `monitor`, `warn`, or `block` commitment control
and an integer basis-point tolerance. `block` rechecks all PO lines and current
commitments under row locks before issuance. Missing Cost Codes, unbudgeted
codes, and excess commitments are rejected. `warn` remains visible in review
surfaces but does not mutate or silently approve a commitment.

Revisions never edit the active baseline. A new draft clones the approved
revision, records its reason, and becomes active only after both approvals.

## Draft command integrity (2026-09-13)

Draft saves must not silently replace another editor's changes. The editable
header, exact persisted version and ordered lines are loaded from a coherent
database snapshot. An opaque token combines the budget tuple's `xmin` and exact
microsecond `updated_at` representation; JavaScript dates must not truncate it.
The current token is compared under the budget lock before any new save. A
missing or stale token rejects with reload/conflict guidance. This token is a
concurrency precondition, never authorization.

Each editor command carries a stable request UUID. Current actor, tenant and
project authority, data changes and semantic audit share a transaction. The
existing project advisory lock is canonicalized and acquired before the budget
row lock. Saved receipts bind the request to its normalized ordered payload,
including the expected version and omitted-versus-null BOM association fields.
Exact replay is checked before current status/version admission, so a committed
save can be reconciled after subsequent submission without repeating writes.
The receipt retains the original new-line identity mapping and resulting token.
A changed payload with the same key is rejected.

The UI retains an uncertain command exactly, freezes its editable inputs and
validates the returned scope. A stale receipt cannot reset a newer editor state.
Cache failures are refresh warnings after commit, not failed mutations. Legacy
unkeyed create callers may remain supported without a safe-retry promise; save
callers missing the concurrency precondition must reload rather than overwrite.
Tenant-wide Cost Code uniqueness remains authoritative across projects; a
different request's duplicate is not treated as a successful replay.

This adds no table or dependency. Existing centavo calculations, cost-code swaps,
line identities/creation timestamps, hidden BOM associations, approval rules and
the immutable approved baseline remain unchanged.
