# Customer receivables foundation

## User outcome

Finance can issue a project invoice into the general ledger once, see the
customer and project behind every receivable line, and understand what is
collectible now versus retained or withheld.

## Invariants

- Draft invoices have no general-ledger effect.
- Issuance is finance-only and atomic.
- The invoice belongs to a project and Business Account in the same tenant.
- Net due equals subtotal minus retention plus VAT minus withholding tax.
- Total issuance debits equal subtotal plus VAT.
- Total issuance credits equal subtotal plus VAT.
- Required system Ledger Accounts exist, are active, and have correct types.
- Issued commercial and monetary terms are immutable.
- One invoice links to at most one issuance journal.
- Issued invoice cancellation creates one linked, dimensional opposite journal.
- Invoice-linked journals cannot be reversed outside the invoice workflow.
- Payment status cannot be set without posted receipt allocation evidence.

## Acceptance criteria

- A valid draft in an open period issues and links one posted journal.
- Missing customer, invalid amounts, missing control account, inactive account,
  closed period, repeated issuance, and non-finance actor all fail atomically.
- General-ledger lines retain project and Business Account dimensions.
- Reversal preserves those dimensions and closes the invoice without rewriting
  its original terms.
- Tenant and role policies prevent cross-tenant or unauthorized access.
- Receivables inquiry reconciles issued invoice balances to posted journal
  references.

## Delivered slice

- Customer and project dimensions on invoices and journal lines.
- Finance-maintained receivables control-account mappings.
- Atomic invoice issuance into open fiscal periods.
- Separate currently due, retention, withholding-tax, revenue, and output-VAT
  postings.
- Receivables aging linked to immutable posting evidence.
- Linked invoice reversal that preserves dimensions and cannot be bypassed by
  the generic journal workflow.
- Canonical invoice calculation helpers and concurrency-safe numbering in both
  project billing entry points.

## Verification

- Production web build passed; 66 static pages generated.
- Shared types: 76/76 tests passed.
- Web: 36/36 tests passed.
- Database: 62 passed; 38 forward-migration runtime tests gated locally.
- Playwright inventory: 60 tests across 28 files.
- Migration manifest, deterministic seed, CI workflow, official action
  references, TypeScript, and static database contracts passed.

## Release boundary

This slice is not deployed. The connected production database has demo invoice
data but does not contain the forward accounting or receivables migrations.
Local SQL execution remains blocked by unavailable hardware virtualization.
CI must apply all 29 migrations to a disposable PostgreSQL 17 database, pass
all 100 database tests with zero skips, validate the complete catalog and empty
schema diff, then run authenticated finance browser journeys before any
production migration.

Receipt entry, allocation, bank matching, and reconciliation remain the next
cash-control slice. No current UI infers collection from a manual paid status.
