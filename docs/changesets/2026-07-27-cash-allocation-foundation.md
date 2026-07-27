# Cash allocation foundation

## User outcome

Finance can record a customer receipt or Vendor disbursement, allocate every
peso to open subledger components, post once, inspect settlement evidence, and
reverse the cash event without rewriting history.

## Invariants

- A Cash Account maps one-to-one to an active asset Ledger Account.
- A receipt has one Business Account; a disbursement has one Vendor.
- Allocations sum exactly to the cash transaction amount.
- Receipt allocations target invoice current-due or retention components.
- Disbursement allocations target posted Supplier Bills.
- Counterparties and tenants must match every allocated document.
- Active posted allocations cannot exceed the target component.
- Posting and reversal are finance-only, atomic, and require an open period.
- Posted terms and allocations are immutable.
- Generic journal reversal cannot bypass the cash transaction workflow.
- Invoice and payable balances derive from active posted allocations.

## Acceptance criteria

- Valid receipts and disbursements create balanced dimensional journals.
- Duplicate reference, counterparty mismatch, bad allocation, over-allocation,
  missing control account, closed period, repeated posting, and unauthorized
  actor fail atomically.
- Full/partial invoice payment states follow active receipt evidence.
- Reversal restores the open balance and creates one linked opposite journal.
- Allocated invoices and Supplier Bills cannot be reversed before their cash
  transactions.

## Implemented surface

- Cash Account setup maps each till, bank, or e-wallet to one asset ledger.
- `/finance/cash` shows posted receipts, disbursements, drafts, and evidence.
- `/finance/cash/new` exposes open invoice components and Supplier Bill
  balances, grouped by the required counterparty.
- `/finance/cash/[id]` owns review, controlled posting, reversal, allocations,
  and journal links.
- Receivable and payable aging subtract only active posted allocations.
- Invoice and Supplier Bill details link back to every cash allocation.
- Cortex mirrors finance-only Cash Account and cash transaction nodes.

## Verification

- Production build generated 70 pages.
- Web tests: 46 passed.
- Database tests: 76 passed locally; 69 clean-reset runtime tests are
  intentionally gated until PostgreSQL 17 CI.
- Playwright inventory: 64 tests across 28 files.
- Repository migration ledger: 32 files.
- Full clean-reset catalog, function ACL, runtime, and empty-diff proof remains
  the release gate; no production migration or deployment occurred.
