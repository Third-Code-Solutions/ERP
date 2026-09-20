# Claim-draft command receipts

## Objective and ownership

As an existing authorized claim creator, save an exact draft once and recover its
original receipt after an uncertain response without duplicating financial records.
ADR-036 defines the contract. Preserve all existing modules and draft capabilities.

1. Agent 01 / root: contract and ADR, no product-policy expansion.
2. Agent 05 with Agent 04/12 review / Astra lane: shared contract, Core endpoint,
   service, module wiring and real PostgreSQL tests. No Web or migration edits.
3. Agent 03 / root: Web Core client, server action, exact form-money boundary and
   focused tests. No overlapping Core/shared edits.
4. Agent 02/03 UI lane / Luna: claim form and new-claim page only after contract
   handoff, component tests; reuse existing primitives/tokens.
5. Browser test lane / Luna: isolated claim-draft browser suite only after UI
   contract handoff. Root integrates CI selection and reviews visual evidence.
6. Agent 12 / Astra: independent review of Web/UI and high-risk integration.
7. Agent 13 / root: changeset, verification, non-force push and PR. No merge or
   deployment while production recovery evidence remains unavailable.

Parallel lanes own disjoint files; each handoff must state completed verification
and remaining risks. Root owns final integration and does not equate CI with live
production or all-demo-account verification.

## Acceptance

- Reject malformed, excessive-decimal and unsafe money; retain exact cents.
- Allocate PC-100000 and PC-100001 correctly after PC-99999.
- Atomic semantic receipt and draft, original replay after later transitions.
- Current tenant/actor/project admission, conflicts and concurrency fail safely.
- Unknown Web outcome keeps the exact command; no duplicate or stale-scope success.
- Keyboard-accessible and responsive UI with truthful errors and refresh warnings.

## Current checkpoint

Contract handed to Core lane. Web money boundary test initially fails because the
new adapter does not exist; implementation and integration remain in progress.
