# ERP module backlog

Seeded from OpenConstructionERP's public module map (v19, Nov 2026), ordered by dependency for a contractor-focused MVP. Statuses were set by Phase D on 2026-11-04 from the gap analysis [`reports/01-gap-analysis.md`](reports/01-gap-analysis.md); new rows and dependency changes come from the survey [`oce/survey.md`](oce/survey.md). Rows with status `unrated` were added by the survey and have not been checked against the app yet. Rate them before `/erp-swarm next` picks them.

Status: `todo` · `unrated` · `exists` · `partial` · `in-progress` · `done` · `defer` (`todo` = gap analysis `missing`; `unrated` = survey row not yet checked). "Later." in Notes marks survey not-MVP flags on rows whose Notes were edited; `oce/survey.md` has the full flag list.

Paths use the gap report's prefixes: `S/` schema · `M/` migrations · `W/` dashboard routes · `P/` portal · `L/` web lib · `C/` components · `A/` Core API · `T/` shared-types · `O/` operations. Sizes (S/M/L) and defects (D-n) are from the gap report.

## Wave 0 — Foundation (everything depends on this)
| Slug | Module | Depends on | Status | Notes |
|---|---|---|---|---|
| tenancy | Organisations / tenants, tenant settings (currency, tax rate, calendar) | — | partial | `tax_profiles` unused: invoices and POs hardcode 12% VAT / 2% EWT / 10% retention; wire the tenant/client profile into that math (S) |
| rbac | Users, invites, roles & permissions, SSO later | tenancy | exists | `T/authorization.ts`, `A/auth/capability.guard.ts`; SSO later |
| audit-log | Immutable audit trail for financial actions | tenancy | exists | `S/audit-log.ts`; hash chain in `M/20260509164538_audit_triggers.sql` |
| notifications | In-app + email notifications | rbac | exists | `S/notifications.ts` (outbox), `A/notifications/notification-email.service.ts` |
| approvals | Approval routes engine (multi-step, delegation, escalation) | rbac, audit-log, notifications | partial | Engine lives in the API only; PO/VO/invoice/budget run their own state machines and delegations are never read. Drive them from `approval_rules` (M) |
| contacts | Contacts directory (clients, subcontractors, suppliers) | tenancy | partial | `vendors` lacks payee type, VAT flag, EWT ATC/rate and subcontractor PCAB licence (S) |
| tax-profile | Tax & registration profile per tenant and counterparty (TIN + branch, VAT status, certificates, withholding-agent class) plus a withholding-rate table | tenancy, contacts | unrated | Unused `tax_profiles` table already in `S/roadmap.ts`; overlaps the tenancy and contacts gaps |
| projects | Projects & portfolio | tenancy, contacts | exists | `S/projects.ts`, `A/projects/projects.service.ts` |
| documents | Document store with revisions, private storage, signed URLs | projects | exists | `S/documents.ts`, signed URL route `apps/web/src/app/api/documents/[id]/route.ts`; general docs have no supersede chain |
| tasks | Tasks / action items: one owner and due-date list that meetings, RFIs, inspections, punch items and approvals feed | projects, rbac, notifications | partial | `W/tasks` task page + cadence generation exist (PR #128); not yet fed by RFIs, punch items or approvals |

## Wave 1 — Estimate
| Slug | Module | Depends on | Status | Notes |
|---|---|---|---|---|
| crm | Sales pipeline: leads and opportunities by bid stage with value, GP, probability and client KYC; a won deal becomes a project | contacts, projects | exists | Same as the shipped CRM (`W/crm`, `W/pipeline`; gap cites `W/crm/accounts`). Status inferred, not rated by the gap report |
| cost-db | Cost database: labour, material, equipment, subcontract rates | tenancy | partial | Crew/equipment rates settable only by SQL; add rate upkeep with effective dates and a 90-day stale flag. Seed from own DUPAs, never CWICR (S) |
| assemblies | Assemblies / composite rates built from resources, waste factors | cost-db | partial | Templates can be applied but not authored; add an assembly library editor (S) |
| conceptual-estimate | Early estimate from floor area or unit counts using historical cost per m² | cost-db, crm | unrated | Later. |
| boq | Bill of quantities: sections, items, quantities, rates, markups, allowances, provisional sums, revisions | projects, assemblies, approvals | partial | Integer qty must become numeric (D-5); split cost from sell (D-1); add provisional/PC sums, allowances, preliminaries; revision diff (M) |
| boq-validation | Validation rules (missing rates, zero qty, outliers) with traffic-light report | boq | partial | Only an unpriced count and approval gates; add zero-qty, missing/outlier/stale-rate rules and the traffic-light report (S) |
| boq-export | Excel/CSV/PDF export and Excel import | boq | partial | Takeoff import exists (Togal/CSV, lands as draft lines); no BOQ Excel/CSV/PDF export or print route. Guard CSV formula injection (S) |
| proposal | Client proposal generated from the BOQ: inclusions, exclusions, assumptions, validity, payment terms; versioned, sent/accepted tracked | boq, boq-export, crm | unrated | Proposal pages already under `W/crm/opportunities/[id]/proposal`; check before building |

## Wave 2 — Commercial
| Slug | Module | Depends on | Status | Notes |
|---|---|---|---|---|
| tendering | RFQ packages from BOQ, invite subcontractors, bid comparison, award | boq, contacts | exists | `W/procurement/rfqs`, `A/tenders/tenders.service.ts`; covers supplier canvass / price comparison; no bidder portal |
| licences | Licences & accreditations for tenant and counterparties (PCAB category and range, PhilGEPS, insurance) with expiry alerts and over-range warnings | contacts, documents | unrated | — |
| contracts | Contracts & awards, contract sum, retention terms | boq, contacts (tendering for subcontract awards) | partial | Only an e-signature record; add contract sum (VAT flag), retention %, down payment + recoupment, LD rate and cap, payment terms, defects period, subcontracts (M) |
| subcontractors | Subcontractor management: prequalify (licence, tax, insurance), onboard, track scope, performance and payment status | contacts, tax-profile, licences | unrated | — |
| procurement | Purchase requests, POs, approvals, deliveries | boq, contacts, approvals | partial | No purchase-requisition screen (table sits behind the roadmap service only); PO-from-BOM pricing wrong (D-4) (S) |
| variations | Variations / change orders: scope + cost + time impact | contracts, boq, approvals | partial | A signed VO only changes its own status; feed revised contract sum to billing, revise budget, split sell/cost, link VO lines to BOQ (M) |
| bonds | Bonds & guarantees per contract (performance, surety, down payment, retention, warranty) tracked through release | contracts, documents | unrated | — |
| rfi | Requests for information, due dates, cost-bearing answers → variation | projects, variations, tasks | exists | `S/project-rfis.ts`, `W/projects/[id]/rfis`; no cost-impact link to VOs |
| submittals | Submittals & transmittals | documents, approvals | exists | `S/project-submittals.ts`, `W/projects/[id]/submittals`; no transmittal register |

## Wave 3 — Controls & money
| Slug | Module | Depends on | Status | Notes |
|---|---|---|---|---|
| progress | Progress tracking / measurement to date | boq | partial | Category % only; add measured qty / % to date per BOQ line at the weekly cut-off (M) |
| payables | Supplier & subcontractor bills: match to PO and receipt, withhold tax, approve, pay | procurement, tax-profile, approvals | exists | Same as shipped supplier bills (`S/supplier-bills.ts`, `W/finance/payables`, three-way match); flat EWT (D-9). Status inferred, not rated by the gap report |
| cost-model | 5D cost: budget, committed, actual, forecast per cost head | boq, procurement, payables | exists | `L/operations/project-cost-control.ts`, `W/projects/[id]/cost`; baseline and forecast math wrong (D-3, D-10) |
| payment-apps | Interim payment applications: work to date, retention, advance recoupment | progress, contracts | partial | Claim amount is typed, not contract-driven; add BOQ valuation less prior, DP recoupment, contract retention + release ledger, LD, both directions, IPC print (L) |
| invoicing | Invoices, payments, cashflow curve | payment-apps, tax-profile | exists | `A/finance/customer-invoice-*.service.ts`, `W/invoices`; no cashflow curve; defects D-2, D-6–D-8; keep BIR series gapless, cancel not delete |
| withholding-tax | Withholding tax: EWT per payment by income type, quarterly 2307s and payee list; log 2307s and government VAT withheld on receivables | payables, invoicing, tax-profile | unrated | Customer-invoice 2307 print exists but with parties reversed (D-8) |
| schedule | 4D programme: activities linked to BOQ items, Gantt, dependencies | boq | partial | Later. Tasks are not linked to BOQ lines; one predecessor per task (M) |
| evm | Earned value: PV/EV/AC, CPI/SPI, EAC/ETC/VAC/TCPI | cost-model, progress, schedule | exists | `A/projects/project-performance.service.ts`, `T/erp-api/project-performance.ts`; no TCPI, project level only, BAC from sell baseline (D-3) |
| risk | Risk register with priced exposures → contingency | projects | todo | Later. |
| cvr | Cost-value reconciliation per cost head | cost-model, payment-apps | partial | Later. Project-level EV vs AC only; add per-cost-head valuation vs cost, accruals and forecast (M) |

## Wave 4 — Site & field
| Slug | Module | Depends on | Status | Notes |
|---|---|---|---|---|
| site-diary | Daily site diary (weather, labour, plant, events, photos) | projects | partial | No plant/equipment lines, labour by trade or photos (S) |
| punch-list | Punch list / snags with photo evidence | projects | exists | `S/post-construction.ts` (`punchlist_items`, photos), `W/punchlist` |
| hse | Safety incidents, toolbox talks, observations | projects | todo | Needs a DOLE-approved safety programme before work starts, safety-officer staffing, toolbox talks |
| permits | Regulatory permits register (building, fire, electrical, DOLE, occupancy) with countdown and a mobilisation gate | projects, documents | unrated | `W/permits` and `W/projects/[id]/permits` already exist; check before building |
| handover | Handover & closeout: turnover package, completion certificates, defects period that gates final retention and bond refund | punch-list, documents, payment-apps | unrated | COC and turnover screens exist (`W/coc`, `W/turnover`); check before building |
| warranty | Warranty tickets with acknowledge and schedule SLAs, tied to the defects period | handover, tasks | exists | Same as shipped warranty (`S/warranty.ts`, `W/warranty`, `P/warranty/[token]`). Status inferred, not rated by the gap report |
| quality | Inspections, checklists, NCRs | projects | partial | Later. Hold points and checklists exist; no NCR register (raise, cause, disposition, close) (S) |
| timesheets | Labour hours / crews | site-diary, cost-db | partial | Later. Only planned vs actual minutes on tasks; no daily crew timesheet, no hours × rate to labour cost codes (M) |
| equipment | Equipment & fleet | projects | partial | Later. Register and maintenance exist; no usage log per project, no plant cost to cost codes (S) |
| inventory | Site inventory & deliveries | procurement | exists | `W/inventory/receipts`, three-way match `M/20260726240000_supplier_bill_three_way_match.sql` |
| meetings | Meetings & minutes, actions | projects, tasks | todo | Later. |
| commissioning | Testing & commissioning checklists and readiness scoring before turnover | quality, handover | unrated | Later. |
| claims | Delay & money claims: one evidence pack from diary, RFIs, variations and schedule | variations, site-diary, schedule | unrated | Later. Not the existing `W/claims` (progress claims = payment-apps) |

## Wave 5 — Platform
| Slug | Module | Depends on | Status | Notes |
|---|---|---|---|---|
| dashboards | Project & portfolio dashboards, report exports | cost-model, crm | exists | `W/dashboard`, `W/reports`, `L/dashboard-queries.ts` |
| data-privacy | Data-privacy operations: data-subject requests, personal-data inventory, breach log with the 72-hour clock | rbac, audit-log | unrated | — |
| api-webhooks | Public REST API + HMAC-signed outgoing webhooks | rbac | defer | Core API is internal; no API keys or webhook table. Revisit with SAP (O-02). SSRF-safe |
| accounting-export | Export invoices, bills, payments and journals to the tenant's book of record (SAP, QuickBooks, Xero, CSV) | invoicing, payables | unrated | Later. `sap_posting_outbox` stub in `S/roadmap.ts` |
| client-portal | Client/partner portal (read-scoped) | rbac, projects | exists | `P/project/[token]`, `S/customer-portal-sessions.ts` |
| i18n | Interface languages (EN, Filipino first) | — | defer | English-only UI; English is the working language of PH construction documents. Revisit on demand |

## Deferred — heavy infrastructure (revisit after MVP revenue)
| Slug | Module | Why deferred |
|---|---|---|
| dxf-takeoff | DXF layers, blocks, text and areas → draft unpriced scope lines | Split from cad-bim. DXF ingest already exists (`apps/workers/dxf-parser`, `A/cad/document-processing.*.ts`); promote candidate |
| pdf-takeoff | Quantity takeoff on PDF drawings | PDF rendering + measurement UI; Togal/CSV import covers takeoff for now |
| cad-bim | DWG/RVT/IFC ingest, BIM viewer, element → BOQ | Converter pipeline (DXF split out to dxf-takeoff) |
| clash | Clash detection & triage | BIM dependency |
| point-cloud | Reality capture | Heavy infra |
| carbon | Embodied carbon / LCA | Needs a licensed emission-factor dataset |
| ai-estimate | AI estimate builder, semantic cost search | Needs cost data + embeddings; pieces exist (`S/embeddings.ts`, similar-items API) |

## Changes
- 2026-11-04: Statuses set from the Phase D gap analysis; the unreviewed-seed warning was removed.
- 2026-11-04: Added `tax-profile` and `tasks` to Wave 0.
- 2026-11-04: Added `crm`, `conceptual-estimate` (later) and `proposal` to Wave 1.
- 2026-11-04: Added `licences`, `subcontractors` and `bonds` to Wave 2.
- 2026-11-04: Added `payables` and `withholding-tax` to Wave 3.
- 2026-11-04: Added `permits`, `handover`, `warranty`, `commissioning` (later) and `claims` (later) to Wave 4.
- 2026-11-04: Added `data-privacy` and `accounting-export` (later) to Wave 5.
- 2026-11-04: Split `dxf-takeoff` out of `cad-bim`; kept deferred and flagged as a promote candidate.
- 2026-11-04: `approvals` now depends on `notifications` and sits after it.
- 2026-11-04: `contracts` depends on `boq, contacts` instead of `tendering`; tendering only feeds subcontract awards.
- 2026-11-04: Added survey dependency edges: `rfi` → variations, tasks; `submittals` → approvals; `meetings` → tasks.
- 2026-11-04: New `unrated` status for survey-added rows; `tasks` rated `partial` (PR #128).
- 2026-11-04: `procurement` depends on `boq, contacts, approvals` instead of `contracts, approvals`.
- 2026-11-04: Added dependencies: `variations` → approvals, `evm` → schedule, `cost-model` → payables, `invoicing` → tax-profile, `dashboards` → crm.
- 2026-11-04: `progress` no longer depends on `schedule` and leads Wave 3; `schedule` moves after the money rows.
- 2026-11-04: Rows reordered within waves to the survey's order (MVP rows first); no wave moves, no rows removed.
- 2026-11-04: Notes extended per the survey for boq, boq-export, cost-db, contracts, tendering, payment-apps, invoicing and hse; survey "later" flags shown as "Later." on rows whose Notes changed (full list in `oce/survey.md`).
