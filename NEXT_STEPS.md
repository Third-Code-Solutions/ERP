# Third Code ERP — Next release steps

## Current verified state

- Public brand, landing page, metadata, search surfaces, and product UI use
  Third Code ERP.
- Construction spine covers CRM, projects, documents, BOM, procurement,
  delivery, site progress, cost, claims, billing, turnover, warranty, portals,
  and Cortex graph/chat foundations.
- Accounting foundation covers fiscal periods, chart of accounts, balanced
  journals, immutable posting, linked reversals, and general-ledger inquiry.
- Customer invoices post controlled receivables. Matched Supplier Bills post
  controlled payables with Customer/Vendor/project dimensions and aging.
- Customer receipts and Vendor disbursements now allocate to live open
  subledger components, drive invoice payment state, reduce aging, and own
  immutable reversal evidence.
- Bank statement import now records exact-file SHA-256 provenance, matches
  posted cash through exact or reviewed evidence, reconciles only complete
  statements, and corrects through immutable void records.
- Inventory now provides UOM/Item/Warehouse masters, posted Stock Receipts,
  perpetual quantity/value evidence, Inventory/GRNI journals, linked
  reversals, receipt-level Supplier Bill three-way matching, internal
  transfers, Project/Cost Code consumption, count adjustments, and
  weighted-average valuation.
- Project Budget control now provides tenant Cost Codes, immutable revisions,
  separate Commercial/Finance approval, PO commitment enforcement, and
  baseline/commitment/actual/forecast/variance evidence.
- Production web build passes and generates 75 pages.
- Shared types pass 76/76 tests; web passes 61/61; database passes 103 tests
  with 94 forward-migration tests gated against the older production schema.
- Playwright discovers 70 browser tests in 30 files.
- The 20 deployed migration files are byte-identical to fetched production
  history. Twenty-one forward migrations are not deployed.

## Release gate — do this first

1. Reconcile the six May versions that exist locally but not in the production
   migration ledger. Do not run `supabase db push` or migration repair against
   production before a reviewed reconciliation plan.
2. Start a disposable PostgreSQL 17/Supabase environment and run the repository
   migrations from zero with the deterministic seed.
3. Run the full catalog verifier and confirm an empty schema diff.
4. Run database tests with `DATABASE_HARDENING_EXPECTED=1`,
   `DATABASE_ACCOUNTING_EXPECTED=1`, and
   `DATABASE_RECEIVABLES_EXPECTED=1`, and
   `DATABASE_PAYABLES_EXPECTED=1`, and
   `DATABASE_CASH_EXPECTED=1`, and
   `DATABASE_RECONCILIATION_EXPECTED=1`, and
   `DATABASE_INVENTORY_EXPECTED=1`, and
   `DATABASE_BUDGET_EXPECTED=1`, and
   `DATABASE_STOCK_MOVEMENT_EXPECTED=1`; require the current full suite with
   zero skips.
5. Run authenticated finance browser journeys for admin, finance, and denied
   roles. Verify desktop/mobile layout, keyboard use, console, and network.
6. Complete security review of function ACLs, row policies, service-role
   boundaries, tenant-negative cases, sequence concurrency, and reversal paths.
7. Apply forward migrations in a reviewed preview environment, verify rollback
   by forward compensation, then promote. Production deployment remains a
   separate authorized action.

Docker Desktop cannot currently provide the disposable database on this
workstation because hardware virtualization is unavailable. GitHub CI is
configured to reject skipped forward-migration tests.

## Tier 2 — accounting and cash

Build as small reconciled vertical slices:

1. Customer invoices and receivable control account posting. Implemented
   locally; release-gated.
2. Supplier bills and payable control account posting. Implemented locally;
   release-gated.
3. Receipts, disbursements, retention, and allocation. Implemented locally;
   release-gated. Advances remain a later specified subledger.
4. Bank statement import, matching, and reconciliation. Implemented locally;
   release-gated.
5. Budget controls and project/cost-code dimensions. Implemented locally;
   release-gated.
6. Philippine tax configuration and verified statutory outputs.
7. Multi-currency, realized/unrealized differences, and period close.

Exit only when every subledger reconciles to the general ledger and correction
uses reversal/reposting.

## Tier 3 — items, warehouse, and supply

- Item/UOM/Warehouse masters, perpetual Stock Receipts, and receipt-linked
  Supplier Bill matching are implemented locally and release-gated.
- Transfer, project/Cost Code consumption, count adjustment,
  weighted-average valuation, and immutable reversal are implemented locally
  and release-gated.
- Requisition → quotation comparison → order → receipt → bill → payment.
- Stock reservation, landed cost, and price-list depth.
- Lots/serials only where discovery establishes a traceability requirement.
- Quantity, value, commitment, receipt, invoice, payment, and job-cost
  reconciliation across partial and reversal flows.

## Tier 4 — validated extensions

- Sales fulfillment and recurring service.
- Quality and corrective action.
- Fixed assets and depreciation.
- Light manufacturing/subcontracting only after customer discovery.
- People, time, and payroll only under a dedicated compliance specification.

## Ongoing product gates

- One calm next-decision surface per role; progressive disclosure for advanced
  controls.
- Cortex reads only authorized evidence and cites it. High-impact actions remain
  proposed until a qualified person approves.
- No financial posting, payment, supplier commitment, access change, deletion,
  or compliance submission occurs silently.
- Each slice includes tenant-negative, role-negative, immutability, reversal,
  concurrency, audit, reconciliation, accessibility, browser, and deployment
  evidence appropriate to its risk.
