# Supplier payables foundation

## User outcome

Finance can prepare a Vendor bill against an approved Purchase Order, allocate
its subtotal to expense or asset accounts, post it once, inspect the payable,
and reverse it without rewriting financial history.

## Invariants

- Purchase Orders are commitments and create no payable journal.
- Every Supplier Bill belongs to one tenant, Vendor, project, and Purchase
  Order.
- Vendor bill numbers are unique per tenant and Vendor.
- Bill allocations are positive and sum exactly to subtotal.
- Total payable equals subtotal plus Input VAT minus Withholding Tax.
- Cumulative active billed subtotal cannot exceed Purchase Order subtotal.
- Posting and reversal are finance-only, atomic, and require an open period.
- Posted bill terms and allocation lines are immutable.
- Project and Vendor dimensions survive posting and reversal.
- Payment status requires future disbursement allocation evidence.

## Acceptance criteria

- A valid matched draft posts one balanced payable journal and receives a
  transaction-safe internal number.
- Duplicate number, mismatched Vendor/project/PO, draft or cancelled PO,
  overbilling, bad allocation, missing control account, closed period,
  repeated posting, and non-finance actor fail atomically.
- Reversal creates one linked equal opposite journal and closes the bill.
- Generic journal reversal cannot bypass the Supplier Bill workflow.

## Delivered slice

- Tenant-safe Supplier Bill and allocation-line schema with duplicate Vendor
  bill prevention.
- Draft create, edit, review, and delete workflow.
- Purchase Order prefill, Vendor/project lock, and cumulative unbilled-subtotal
  control.
- Finance-maintained Accounts Payable, Input VAT, and Withholding Tax Payable
  mappings.
- Atomic posting to expense/asset debits, Input VAT debit, Accounts Payable
  credit, and Withholding Tax Payable credit.
- Transaction-safe `SB-YYYY-######` numbering.
- Vendor and project dimensions in posting and equal-opposite reversal.
- Payables aging, bill detail, Purchase Order backlinks, and Vendor-aware
  general-ledger filters.
- Audit-chain and Cortex projection with finance-sensitive graph visibility.
- Column-scoped grants, finance RLS, trusted-only posting RPCs, and CI catalog
  assertions.

## Verification

- Production web build passed; 68 static pages generated.
- Web: 42/42 tests passed.
- Database: 69 passed; 53 forward-migration runtime tests gated locally.
- Supplier payable contract: 7 static tests passed; 15 runtime tests are
  required by clean-reset CI.
- Playwright inventory: 62 tests across 28 files, including read-only payable
  and Vendor-ledger journeys.
- Auth, database, and web TypeScript checks passed.
- Repository migration ledger verifier passed with 30 files.

## Release boundary

This slice is not deployed. The connected production database does not contain
the accounting, receivables, or payables migrations. Local clean-reset SQL
execution remains blocked by unavailable hardware virtualization.

CI must apply all 30 migrations to disposable PostgreSQL 17, execute all 122
database tests with zero skips, validate the complete catalog and empty schema
diff, then run authenticated Finance browser journeys. Receipt-level
three-way matching, payment allocation, and bank reconciliation remain later
controlled slices; the current UI does not claim that those events occurred.
