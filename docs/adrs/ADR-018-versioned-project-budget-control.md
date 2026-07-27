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
