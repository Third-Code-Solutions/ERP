# Third Code ERP clean-room capability roadmap

## Product outcome

One calm operating system for construction and adjacent businesses. Users see
today's work, exceptions, approvals, and evidence without learning an ERP module
catalog. Cortex connects authorized records, explains why a result changed, and
proposes reviewable actions with cited sources.

## Baseline

The current application is a substantial construction prototype:

- pipeline, CRM, KYC, proposals, and inspections;
- projects, scope, documents, DXF extraction, BOM, and checklist;
- RFQ, purchase orders, deliveries, and supplier-facing flows;
- progress, cost, change orders, claims, invoices, turnover, and warranty;
- portals, notifications, audit scaffolding, and early Cortex graph/chat.

Current release boundaries:

- the repository contains the complete deployed migration ledger plus
  forward-only hardening and accounting migrations, but those forward
  migrations still need a disposable clean-reset and catalog-diff rehearsal;
- deny-by-default authorization is implemented for the new accounting slice,
  while older resources still need the same bounded review;
- journal posting, reversal, fiscal-period checks, and numbering are
  database-authoritative; tax, multi-currency, and period-close depth remain;
- Cortex coverage, field scope, redaction, grounding verification, and write
  governance are incomplete;
- general ledger, controlled receivables/payables/cash/reconciliation,
  project budgets, Stock Receipts, three-way matching, and controlled Stock
  Movements are implemented but unreleased; reservation, landed cost,
  manufacturing, asset, and broad organization functions are not;
- CI fails on skipped forward-migration database evidence, while authenticated
  browser evidence still depends on disposable test credentials.

## UX model

### Primary surfaces

1. **Today** — role-specific work, blockers, approvals, exceptions, and saved
   views.
2. **Project Command Center** — lifecycle, cost, procurement, site, billing,
   documents, decisions, and client status in one context.
3. **Search + Ask + Create** — exact, relational, document, and semantic search
   with permission-safe results.
4. **Control Center** — organization, finance, inventory, people, policy,
   integration, and audit configuration.

### Progressive disclosure

- Default view shows the next decision and its evidence.
- Advanced fields appear only when policy, role, or exception requires them.
- Lifecycle language follows the business: Win, Plan, Buy, Build, Bill, Close,
  Support.
- Every generated action shows impact, affected records, approver, and rollback
  or reversal path before execution.

## Delivery tiers

### Tier 0 — release substrate

- canonical ordered migrations and clean-database rehearsal;
- tenant memberships, project/team scope, deny-by-default authorization;
- immutable audit verification and financial sequence concurrency;
- required database, browser, accessibility, security, and deployment gates;
- readiness, structured logs, error tracking, traces, queues, and AI telemetry.

Exit criteria: a clean environment can be built from the repository; negative
cross-tenant tests pass; required gates cannot silently skip.

### Tier 1 — construction loop

- role-specific Today surfaces;
- unified search and repaired result routing;
- pipeline-to-project handoff;
- drawing/scope/BOM-to-RFQ/PO/delivery trace;
- daily progress, cost, change, claim, billing, turnover, and warranty;
- client/supplier approval portals with evidence and audit.

Exit criteria: target users complete the ten primary construction jobs with
measured time, error, and help-request improvements over their current process.

### Tier 2 — accounting and cash

- company, fiscal period, chart of accounts, dimensions, journal, and immutable
  postings;
- receivables, payables, payment allocation, banking, reconciliation, budget,
  tax configuration, multi-currency, and period close;
- project/cost-code dimensions on every relevant posting;
- committed, received, invoiced, paid, and consumed cost kept distinct;
- retention, advances, progress billing, and verified Philippine statutory
  outputs.

Exit criteria: subledgers reconcile to the general ledger; corrections use
reversal/reposting; concurrency and closed-period tests pass.

Status: ledger foundation implemented locally. Fiscal periods, chart of
accounts, balanced journals, immutable posting, reversals, project dimensions,
general-ledger inquiry, customer invoice issuance, receivables aging, customer
dimensions, Supplier Bill intake and PO matching, payables aging, Vendor
dimensions, linked invoice and bill correction, search, and Cortex records are
present.
Release remains gated on clean-database SQL execution and authenticated browser
evidence. Tax close and currency remain.

### Tier 3 — items, warehouse, and supply

- items, UOM, price lists, suppliers, warehouses, lots/serials where needed;
- requisition, quotation comparison, order, receipt, invoice, payment;
- stock movement, reservation, transfer, adjustment, valuation, and landed cost;
- project/work-package allocation and site consumption.

Status: Item/UOM/Warehouse masters, Purchase Order Stock Receipts, perpetual
quantity/value evidence, receipt-level Supplier Bill matching, internal
transfer, project/Cost Code consumption, count adjustment, weighted-average
valuation, and immutable reversal are implemented locally. Price lists,
requisition depth, reservation, landed cost, and optional lot/serial tracking
remain.

Exit criteria: physical quantity, valuation, commitments, receipts, invoices,
and job cost reconcile across partial and reversal flows.

### Tier 4 — validated business extensions

- sales order and fulfillment outside construction projects;
- recurring service, support, maintenance, contract, and SLA operations;
- quality inspection, nonconformance, corrective action;
- fixed asset acquisition, depreciation, movement, maintenance, and disposal;
- light manufacturing/subcontracting only when discovery proves demand;
- people/time/payroll only under a dedicated compliance specification.

Exit criteria: each extension has an identified customer job, owner, workflow
invariants, accounting impacts, and adoption evidence.

## Cortex governance

### Read path

1. Authenticate tenant, role, project/team scope, and field policy.
2. Retrieve exact and semantic candidates from authorized records only.
3. Redact prohibited or unnecessary sensitive fields before model access.
4. Produce claim-level citations, freshness, confidence, and refusal state.
5. Store the question, authorized evidence set, answer, and evaluation signals.

### Action path

1. Draft a typed proposal.
2. Validate current record versions, permissions, policy, budget, and period.
3. Show human-readable impact and source evidence.
4. Require the correct approver.
5. Execute idempotently.
6. Record actor, model, prompt/template version, inputs, diff, and result.
7. Provide reversal or compensating action when the domain permits it.

No silent autonomous financial posting, payment, supplier commitment, access
change, record deletion, or compliance submission.

## Outcome metrics

- primary-job completion time and first-pass success;
- help requests and backtracking per workflow;
- approval aging and handoff latency;
- search success and zero-result rate;
- reconciliation differences and reversal rate;
- Cortex citation precision, answer faithfulness, refusal quality, and approved
  action rate;
- deployment frequency, lead time, change failure rate, and restore time.

## Definition of done

“ERP-wide,” “permission-safe AI,” and “better than the current tool” remain
claims, not facts, until the relevant tier exits with live data, browser,
authorization, reconciliation, migration, and user-task evidence.
