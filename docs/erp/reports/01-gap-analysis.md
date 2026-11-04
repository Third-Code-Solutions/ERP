# 01 · Gap analysis (Phase D)

Author: `erp-domain-expert` (gap mode). Date 2026-11-04. Worktree `D:\thirdcode\ERP-phased`, branch
`docs/erp-phase-d` (product code = `main`). Read-only review. Statuses replace the unreviewed seeds in
[`../BACKLOG.md`](../BACKLOG.md). Product authority: `docs/PRD.md` (BUILD OPS PRD v1.5).

Status meanings: `exists` = the core workflow is usable end to end · `partial` = some of it exists, gap
stated · `missing` = none of it · `defer` = heavy infrastructure, or not needed for a PH mid-size GC MVP.
An `exists` status does not mean the math is right. Calculation defects are listed separately below.

Path legend: `S/` = `packages/database/src/schema/` · `M/` = `supabase/migrations/` ·
`W/` = `apps/web/src/app/(dashboard)/` · `P/` = `apps/web/src/app/portal/` · `L/` = `apps/web/src/lib/` ·
`C/` = `apps/web/src/components/` · `A/` = `apps/api/src/` · `T/` = `packages/shared-types/src/` ·
`O/` = `packages/operations/src/`.

Name map (ours → backlog): `dupas` + `dupa_*_lines` (Detailed Unit Price Analysis) → assemblies/boq
pricing · `crew_roles`, `equipment_catalog`, `material_catalog`, `price_history`, `rate_cards` → cost-db ·
`boms` / `bom_line_items` → boq · `rfqs` / `rfq_quotes` / `tender_packages` → tendering ·
`variation_orders` (VOs) → variations · `progress_claims` + `project_weekly_progress` (WAR) +
`certificates_of_completion` → payment-apps / progress · `project_budgets` + `cost_entries` → cost-model ·
`quality_hold_points` (IWR) → quality · `assets` → equipment · `master_schedules` / `project_schedule_tasks` → schedule.

Feature flags: the `ERP_<X>_VIA_API` pairs (`L/erp-core-client.ts:520-566`) only switch a module between
the legacy web path and the Core API. Both paths compute the same money. No flag hides a whole module.
`tenant_feature_flags` gates roadmap integrations only (`A/roadmap/roadmap.service.ts:202`).

## 1. Module status

| slug | wave | status | evidence (paths) | MVP gap (for partial) |
|---|---|---|---|---|
| tenancy | 0 | partial | `S/tenants.ts`, `S/business-calendar.ts`, `S/roadmap.ts` (`tax_profiles`, `tenant_currencies`); `(platform)/platform-admin/tenants`; `docs/runbooks/tenant-isolation.md` | Isolation and tenant admin work. The tax settings are not used: `tax_profiles` (VAT/EWT/retention bps, VAT-registered flag) is read only by `A/roadmap/roadmap.service.ts`, while invoices and POs hardcode 12% / 2% / 10%. Wire the tenant/client tax profile into the invoice and PO math. Needed for government clients (5% final VAT withholding) and non-VAT payees. **S** |
| rbac | 0 | exists | `S/users.ts`, `T/authorization.ts` (13 roles, 91 capabilities); `A/auth/capability.guard.ts`; `W/admin/users`, `(auth)/auth/accept-invite` | — (SSO later) |
| audit-log | 0 | exists | `S/audit-log.ts`; `M/20260509164538_audit_triggers.sql` (hash chain); `W/audit`, `W/projects/[id]/audit`; `A/audit/audit.service.ts` | — |
| approvals | 0 | partial | `S/process-sla.ts` (`approval_rules` amount bands/sequence/escalation, `approvals`); `S/tenant-memberships.ts` (`approval_delegations`); `A/process/process.controller.ts` (`POST approvals`, `PATCH …/decision`, route preview); `W/process` | The engine exists in the API, but the web only previews a PO route (`L/erp-core-client.ts:1866-1880`). PO, VO, invoice and budget approvals each use their own hardcoded state machine. `approval_delegations` has no code reading it. Drive PO/VO/budget approvals from `approval_rules`, and add delegation. The matrix content is blocked by O-03. **M** |
| contacts | 0 | partial | `S/accounts.ts`, `S/contacts.ts`, `S/vendors.ts`; `W/crm/accounts`; vendor insert at `W/procurement/actions.ts:131` | `vendors` has only name/contact/TIN. Add: payee type (supplier / subcontractor / service), VAT-registered flag, EWT ATC/rate, and PCAB licence for subcontractors. Needed for correct PO EWT, supplier 2307s and subcontract tracking. **S** |
| projects | 0 | exists | `S/projects.ts`, `S/project-locations.ts`; `W/projects`, `W/projects/[id]`; `A/projects/projects.service.ts`; `O/signed-bom-award.ts` | — |
| documents | 0 | exists | `S/documents.ts`, `S/design.ts` (`design_file_versions`), `S/takeoff-imports.ts` (`drawing_revisions`); `apps/web/src/app/api/documents/[id]/route.ts` (signed URL); `W/documents`, `W/projects/[id]/documents` | — (general project documents have no supersede chain; drawings do) |
| notifications | 0 | exists | `S/notifications.ts` (outbox + deliveries); `A/notifications/notification-email.service.ts`; `L/operations/integrations/resend.ts`; `C/nav/notifications-dropdown.tsx` | — |
| cost-db | 1 | partial | `S/dupa-libraries.ts` (`crew_roles`, `equipment_catalog`, `material_catalog`, `price_history`); `S/bom-extras.ts` (`rate_cards`); `W/admin/rate-cards`, `W/admin/material-items`; `L/procurement/rfq-workflow-service.ts:272-341` | No screen or action writes `crew_roles` or `equipment_catalog`. Crew and plant rates can only be set by SQL, though the trigger that recomputes DUPAs on a rate change exists. `material_catalog` is fed only by RFQ awards. Add crew/equipment/material rate maintenance with effective dates and a 90-day staleness flag. **S** |
| assemblies | 1 | partial | `S/dupa-libraries.ts` (`assemblies`, `assembly_*_templates`); apply-template in `C/bom/dupa-editor.tsx:270`; `W/projects/[id]/bom/actions.ts:446` | Assemblies can be applied but not authored: there is no create/edit UI. Add an assembly library editor (material/labour/equipment skeleton + productivity). **S** |
| boq | 1 | partial | `S/boms.ts`, `S/bom-line-items.ts`, `S/dupas.ts`, `S/takeoff-imports.ts` (`boq_divisions`); `W/projects/[id]/bom`; `C/bom/bom-builder.tsx`, `C/bom/dupa-editor.tsx`; `T/bom/dupa.ts`; `P/bom/[token]` (client approval) | (1) Quantity is `integer`. It must become `numeric(18,4)` (defect D-5). (2) Cost and sell are not separated: DUPA H overwrites `unit_cost_cents` (D-1). (3) No provisional sums, prime-cost sums or allowances. (4) Versions exist (`boms.version`) but there is no revision diff. **M** |
| boq-validation | 1 | partial | `L/operations/bom-pricing-breakdown.ts` (unpriced count); approval gates in `W/projects/[id]/bom/actions.ts:810-930` (unresolved takeoff, AI line without DUPA, grain/location review) | No zero-quantity, missing-rate, outlier-rate or stale-rate rules, and no traffic-light report. **S** |
| boq-export | 1 | partial | Import: `apps/web/src/app/api/bom/takeoff-import/route.ts`, `C/bom/takeoff-import-wizard.tsx`, Togal import. Export: only `apps/web/src/app/api/exports/opportunities-csv/route.ts` | No BOQ Excel/CSV/PDF export and no BOQ print route (only invoice/PO/2307/WAR prints in `(print)/`). Guard CSV formula injection. **S** |
| tendering | 2 | exists | `S/bom-extras.ts` (`rfqs`, `rfq_quotes`); `W/procurement/rfqs` (`createRfqFromBom`, `logQuote`, `awardRfqQuote`); `A/procurement/rfq-bid-leveling.service.ts`; `S/tenders.ts` + `A/tenders/tenders.service.ts` (weighted evaluation, deviations) | — (quotes are keyed in by staff; there is no bidder portal, see O-13) |
| contracts | 2 | partial | `S/pre-con.ts` (`contracts`: project, bom, DocuSeal status, signed doc); `P/sign/[token]`; `A/documents/public-signing.service.ts` | `contracts` is only an e-signature record. Add: contract sum (VAT-in/ex flag), retention %, down-payment % and recoupment method, payment terms, DLP / retention release terms, and subcontract agreements. Payment apps cannot be correct without these. **M** |
| procurement | 2 | partial | `S/purchase-orders.ts`, `S/po-line-items.ts`, `S/deliveries.ts`, `S/supplier-bills.ts`; `A/procurement/purchase-order-creation.service.ts`, `purchase-order-workflow.service.ts`, `delivery-workflow.service.ts`; `W/purchase-orders`, `W/procurement/deliveries`; budget commitment guard `W/procurement/actions.ts:411-414`; supplier portal `P/purchase-order/[token]` | No purchase-requisition (RFPO) screen. `procurement_requisitions` exists only behind `A/roadmap/roadmap.service.ts`, and `W/roadmap/page.tsx` is descriptive. Add the requisition UI. PO-from-BOM pricing is wrong (D-4). **S** |
| variations | 2 | partial | `S/construction.ts` (`variation_orders`: one `cost_impact_cents`, `time_impact_days`); `W/projects/[id]/vos/actions.ts` (create → price → client sign → signed) | A signed VO changes only its own status (`vos/actions.ts:260-312`). Missing: revised contract sum fed to billing, budget revision, sell vs cost split, VO lines linked to BOQ items. **M** |
| rfi | 2 | exists | `S/project-rfis.ts`; `A/projects/project-rfis.service.ts`; `W/projects/[id]/rfis` | — (no cost-impact flag → VO link) |
| submittals | 2 | exists | `S/project-submittals.ts`, `S/project-submittal-documents.ts`; `A/projects/project-submittals.service.ts`; `W/projects/[id]/submittals` | — (no transmittal register) |
| schedule | 3 | partial | `S/project-schedule.ts` (`master_schedules`, `project_schedule_tasks`: parent, single predecessor, % complete, labour minutes); `A/projects/project-schedule.service.ts`, `ms-project-xml-import.service.ts`; `C/progress/gantt-chart.tsx`; `W/projects/[id]/schedule` | Activities do not link to BOQ lines (needed for progress valuation and 4D). Each task allows only one predecessor. **M** |
| cost-model | 3 | exists | `S/budgets.ts`, `S/cost-entries.ts`; `L/operations/project-cost-control.ts` (budget / PO committed / bill actual / forecast per cost code); `T/cost/calculations.ts`; `W/projects/[id]/cost`, `W/projects/[id]/cost/budget` (approval + lock) | — (forecast and baseline math wrong: D-3, D-10) |
| progress | 3 | partial | `S/project-weekly-progress.ts` (WAR), `S/construction.ts` (`progress_updates.percent_by_category`); `A/projects/project-weekly-progress.service.ts`; `C/progress/s-curve-chart.tsx`; `W/projects/[id]/progress` | Progress is a category percentage only. Add measured quantity / % to date per BOQ line, which is the input a valuation needs. **M** |
| evm | 3 | exists | `A/projects/project-performance.service.ts`; `T/erp-api/project-performance.ts:111-210` (PV, EV, AC, CV, SV, CPI, SPI, EAC, ETC, VAC); `C/cost/project-performance-card.tsx` | — (no TCPI; project level only; BAC inherits the sell-price baseline, D-3) |
| risk | 3 | missing | No risk table, service or route | — |
| payment-apps | 3 | partial | `S/progress-claims.ts` (milestone %, typed amount, certify → finance → invoice → paid); `W/claims`; `A/projects/claim-transition.service.ts`, `project-billing-milestones.service.ts` (WAR → COC → claim → invoice) | The claim amount is typed and unrelated to the contract. Missing: valuation from BOQ % to date, less previously certified, down-payment recoupment, contract-driven retention, retention release, IPC print. **L** |
| invoicing | 3 | exists | `S/invoices.ts`, `S/cash.ts`, `S/accounting.ts`; `A/finance/customer-invoice-*.service.ts`, `finance-receivables.service.ts`; `M/20260726210500_customer_receivables_foundation.sql` (posting); `W/invoices`, `W/projects/[id]/billing`, `W/finance/receivables`, `W/finance/cash`; `(print)/invoices/[id]/print`, `/bir2307` | — (no cashflow forecast curve; math defects D-2, D-6, D-7, D-8) |
| cvr | 3 | partial | Project-level EV vs AC on the "Earned value / CVR" card (`C/cost/project-performance-card.tsx`) | No per-cost-head reconciliation of valuation against cost to date, accruals or forecast. **M** |
| site-diary | 4 | partial | `S/site-diary.ts` (weather, manpower count, work done, constraints, safety notes); `A/projects/site-diary.service.ts`; `W/projects/[id]/diary` | No plant/equipment lines, labour by trade or photos. **S** |
| timesheets | 4 | partial | Planned vs actual labour minutes on schedule tasks: `S/project-schedule.ts`; `A/projects/project-labour-reconciliation.service.ts`; `cost_entries` category `labour` | No daily crew or worker timesheet, and no hours × rate posted to labour cost codes. **M** |
| equipment | 4 | partial | `S/assets.ts`, `S/asset-maintenance.ts`; `A/assets/*`; `W/assets` | Register and maintenance exist. No usage log (hours/days per project) and no plant cost charged to cost codes. **S** |
| inventory | 4 | exists | `S/inventory*.ts`, `S/deliveries.ts`; `A/inventory/*`; `W/inventory/receipts`, `W/inventory/movements`; three-way match `M/20260726240000_supplier_bill_three_way_match.sql` | — |
| punch-list | 4 | exists | `S/post-construction.ts` (`punchlist_items`, `punchlist_photos`); `W/punchlist`; IWR handoff `S/quality-hold-points.ts` | — |
| quality | 4 | partial | `S/quality-hold-points.ts` (IWR hold points → punchlist handoff); `A/projects/quality-hold-points.service.ts`; `W/projects/[id]/quality`, `W/projects/[id]/checklist` (pre-con) | No NCR register (raise → root cause → disposition → close). **S** |
| hse | 4 | missing | Only `site_diary_entries.safety_notes` and a `safety` role | — |
| meetings | 4 | missing | None | — |
| dashboards | 5 | exists | `W/dashboard`, `W/reports`, `W/projects/[id]/reports`; `L/dashboard-queries.ts`; `(print)/weekly-report/[id]` | — |
| api-webhooks | 5 | defer | The Core API (`A/`) is internal (user Supabase JWT). No API keys, no outgoing webhook table. `sap_posting_outbox` in `S/roadmap.ts` | Not needed for MVP. Revisit with SAP (O-02). |
| i18n | 5 | defer | No i18n library; English-only UI | English is the working language of PH construction documents. Revisit if users ask for it. |
| client-portal | 5 | exists | `P/project/[token]` (billing, documents, photos, progress), `P/bom/[token]`, `P/sign/[token]`, `P/warranty/[token]`; `S/customer-portal-sessions.ts` | — |
| pdf-takeoff | D | defer | Togal/CSV takeoff import exists (`S/takeoff-imports.ts`, `C/bom/togal-import-wizard.tsx`); no PDF measuring | — |
| cad-bim | D | defer | DXF ingest exists (`apps/workers/dxf-parser`, `A/cad/document-processing.*.ts`); no DWG/RVT/IFC or viewer | — |
| clash | D | defer | None | — |
| point-cloud | D | defer | None | — |
| carbon | D | defer | None | — |
| ai-estimate | D | defer | Pieces exist: `S/embeddings.ts`, `apps/web/src/app/api/ai/similar-items/route.ts`, AI-drafted BOM lines, Cortex | — |

Counts: **15 exists · 19 partial · 3 missing · 8 defer** (45 rows).

## 2. Calculation defects

Each one was verified by reading the code. P1 = wrong money reaches a client document, the ledger, a
budget or a PO. Sizes are rough.

**D-1 · P1 · DUPA sell rate is stored as cost, so GP shows ≈ 0 on every DUPA-priced line.**
`M/20260812180000_wo_06_dupa_engine.sql:554,571-573` writes `bom_line_items.unit_cost_cents = H`
(Direct + OCM + Profit + VAT per unit) and `line_total = H × qty`. Then
`W/projects/[id]/bom/actions.ts:2101-2108` computes `total_cost_cents = Σ unit_cost × qty` and
`tcv = Σ line_total`. For a DUPA line, cost = TCV, so `gp_cents ≈ 0` and `gp_margin_bps ≈ 0`, and cost
is overstated by OCM, profit and VAT.
*Correct rule:* cost = DUPA D (direct), or D + OCM if overhead is treated as cost. Sell = H. GP = sell
excluding VAT − cost. Keep cost and unit rate in separate columns.

**D-2 · P1 · Output VAT is charged twice on DUPA-priced contracts, and EWT is taken on a VAT-inclusive
base.** H already includes F (12% VAT, `wo_06_dupa_engine.sql:552-554`), so `boms.tcv_cents` includes
VAT. `A/finance/customer-invoice-draft-create.service.ts:248-257` bills `billing% × TCV`, then adds
`computeVAT` and deducts `computeEWT` on that base. The legacy path does the same
(`W/procurement/actions.ts:913-923`), and so does the preview (`C/billing/create-invoice-form.tsx:28-33`).
*Correct rule:* the invoice base is the VAT-exclusive contract value (Σ (D+E) × qty). Add VAT once. Take
EWT on the VAT-exclusive amount. If the contract sum is VAT-inclusive, extract VAT as gross × 12/112;
never add it again.

**D-3 · P1 · The award budget baseline is the selling price including profit and output VAT.**
`O/signed-bom-award.ts:499` sets `project_budget_lines.amount_cents = line_total_cents` (H × qty). Cost
control then compares this baseline with VAT-exclusive PO commitments (`L/operations/project-cost-control.ts:92,123`),
which inflates remaining budget. EVM uses the same baseline as BAC (`A/projects/project-performance.service.ts:126`),
which inflates PV and EV.
*Correct rule:* the allowable budget is cost (D, or D + OCM) excluding VAT, per BOQ line. VAT is never
a project cost for a VAT-registered contractor.

**D-4 · P1 · PO-from-BOM is priced at the client sell rate and its header does not foot to its lines.**
- `A/procurement/purchase-order-creation.service.ts:805-820` selects every BOM row with no `is_group` or
  `parent_line_item_id` filter.
- The header subtotal is `bom.totalCostCents`, top-level lines only (`:860`), but the PO lines are all
  rows (`:914-931`). Σ lines ≠ subtotal whenever material child lines exist.
- DUPA work items are priced at H (VAT included), and 12% VAT is added again (`:861`).
- The rate-card path picks the vendor by rate-card price but prices the lines at BOM `unit_cost_cents`,
  not the rate-card `unit_price_cents` (`:454-458`, `:544-547`).

*Correct rule:* PO line price = the supplier quote or rate-card price excluding VAT, for purchasable
lines (material lines, not work items). Header subtotal = Σ PO lines.

**D-5 · P1 · BOQ quantity is an integer.** `M/20260509164536_initial_schema.sql:136`
(`quantity integer`), `S/bom-line-items.ts:50`. `T/bom/calculations.ts:88` rejects fractional quantities
(`exactInteger`), and so does `T/erp-api/togal-bom.ts:12` (`z.number().int()`). Takeoff areas
(12.5 sqm) and the PRD §4.2 example (qty 0.10 cu.m) cannot be stored. Rounding them to integers
misstates every amount.
*Correct rule:* `numeric(18,4)` quantity. Amount = half-up round of (persisted H × qty) using the
existing `deriveBoqLineAmount` (`T/bom/dupa.ts:278`).

**D-6 · P1 · Progress billing has no cumulative cap and no down-payment recoupment.**
`customer-invoice-draft-create.service.ts:248` bills `billing% × full TCV` on every invoice. It does not
deduct previous billings and does not check that Σ `billing_percent_bps` ≤ 10 000 (nothing queries
prior invoices). The award DP invoice bills `downPaymentBps × TCV` (`O/signed-bom-award.ts:532`), and
later invoices never recoup it. Total billed can exceed the contract sum.
*Correct rule:*
- This-period gross = cumulative % to date × revised contract sum − previously billed.
- Less DP recoupment (DP% × this-period gross, until the DP is fully recovered).
- Less retention.
- Then VAT / EWT.
- Cumulative billing ≤ 100%.

**D-7 · P1 (needs Finance/BIR confirmation; conflicts with PRD assumption A13) · The VAT and EWT base
excludes retention, but revenue includes it, and retention is never billed later.**
`customer-invoice-draft-create.service.ts:253-255` computes VAT and EWT on (subtotal − retention).
Posting credits revenue with the full subtotal (`M/20260726210500_customer_receivables_foundation.sql:725`)
and output VAT with only the reduced VAT (`:750`). No retention-release invoice exists anywhere in the
code, so the 12% output VAT on retention is never recorded. The 2307 print comment claims retention
"is not yet income" (`(print)/invoices/[id]/bir2307/page.tsx:67-69`), which contradicts the revenue posting.
*Correct rule:* since RA 11976 (EOPT, 2024) VAT on services is invoice-based. Either charge VAT on the
gross billed amount including retention, or bill the retention at release with its own VAT and EWT. The
second option needs a release flow.

**D-8 · P1 · BIR 2307 parties are reversed.** `(print)/invoices/[id]/bir2307/page.tsx:223-228` prints the
tenant (the contractor) as "Payor (Withholding Agent)", and `:249-251` prints the client as "Payee". On
a customer invoice the client withholds, and ABI is the payee.
*Correct rule:* Payor = client (name, TIN, address). Payee = tenant (name, TIN). Add the ATC (WC/WI 2%
contractor code) and the quarter.

**D-9 · P1 (needs tax confirmation; PRD A13/WO-15 say to carry this forward unchanged) · Every PO gets
a flat 12% VAT and 2% EWT.** `A/procurement/purchase-order-creation.service.ts:502-503, 861-862, 1195-1196`.
Under RR 2-98 as amended by RR 11-2018, a Top Withholding Agent withholds 1% on goods and 2% on
services. Non-VAT suppliers must not get 12% VAT added.
*Correct rule:* VAT and EWT come from the payee's tax profile (VAT-registered flag, ATC). Construction
materials are goods: 1% if ABI is a TWA.

**D-10 · P1 · Forecast cost ignores the uncommitted budget.** `T/cost/calculations.ts:93` and `:126-127`
set forecast = max(committed, actual). At project start forecast ≈ 0 and projected GP ≈ TCV, so GP
erosion stays invisible until everything is bought. That defeats the PRD goal of real-time erosion
detection.
*Correct rule:* per open cost line, EAC = max(budget, committed, actual), or actual + ETC with ETC ≥
remaining budget. Use actuals alone only once a line is closed.

**D-11 · P2 · The down-payment invoice is drafted with VAT 0 and EWT 0, and issuing it is not blocked.**
`O/signed-bom-award.ts:547-548`. The issue check only reconciles totals
(`customer_receivables_foundation.sql:508-523`).
*Correct rule:* a DP invoice of a VAT-registered contractor carries 12% output VAT when invoiced. Block
issue until a tax treatment is set.

**D-12 · P2 · A flat 30% markup is still applied on Togal commits.** `A/procurement/togal-bom-commit.service.ts:41,264`
default `markupBps = 3000`, contrary to PRD WO-06/07 (no line-level markup; price from DUPA). The math
itself is consistent: markup is applied as markup, and margin is derived as GP / TCV.
*Correct rule:* commit the takeoff at cost with markup 0, and price through a DUPA.

**D-13 · P2 · Retention is a hardcoded 10%.** `customer-invoice-draft-create.service.ts:42`,
`W/procurement/actions.ts:913`. Contract terms and `tax_profiles.retention_rate_bps` are ignored.
*Correct rule:* use the retention % from the contract.

**D-14 · P3 · The DP subtotal is truncated.** `O/signed-bom-award.ts:532` uses bigint `/`, which floors.
Policy (PRD §4.4) is half-up.
*Correct rule:* use the shared half-up helper.

**D-15 · P3 · Floats are used in billing input and preview.**
- The preview multiplies floats (`C/billing/create-invoice-form.tsx:28-33`) and can differ from the
  server by ₱0.01.
- Percent → bps via `Math.round(parseFloat(x) * 100)` (`W/projects/[id]/billing/actions.ts:22,32`;
  `C/bom/bom-builder.tsx:544-549`) turns 12.345% into 1234 bps.

Same root cause as baseline BL-24.
*Correct rule:* one decimal-string parser in `packages/shared-types`, and a preview that calls the
shared integer functions.

Checked and correct:
- DUPA cascade, rounding and §4.2 test (`T/bom/dupa.ts`, SQL mirror).
- Integer/half-up helpers in `T/bom/calculations.ts`.
- TCV from margin (`cost / (1 − m)`).
- Weighted pipeline.
- EAC = AC + (BAC − EV) × AC / EV (`T/erp-api/project-performance.ts:156-165`).
- Invoice journal balance.
- Persisted money is never a float.

## 3. Recommended next modules

The P1 defects above sit in shipped code (boq, invoicing, procurement, cost-model). Fix them as
defects now, before or alongside these builds. Fix D-5 first, since every BOQ amount depends on it.
D-1 and D-2 also underlie every BOQ, invoice and budget, but the correct fix depends on owner
answers Q1 and Q2 (section 4). Fix them as soon as those land.

Dependency order through Wave 2. A dependency counts as satisfied only when it is `exists`.

1. **tenancy (S).** It has no dependencies. Apply `tax_profiles` (VAT/EWT/retention bps,
   VAT-registered, government final-VAT withholding) in the invoice and PO math, replacing the
   constants. This is the foundation for fixing D-9 and D-13.
2. **approvals (M).** Its dependencies (rbac, audit-log) exist. Drive PO, VO and budget approvals from
   `approval_rules` and turn on `approval_delegations`. Build it configurable now; ABI's matrix
   (O-03) fills the rules later.
3. **contacts (S).** Depends on tenancy. Add payee type, VAT status, ATC/EWT rate and the subcontractor
   PCAB licence. PO tax (D-9), supplier 2307s and subcontract tendering all need these.
4. **cost-db (S).** Depends on tenancy. Add crew, equipment and material rate maintenance with
   effective dates and a staleness flag. Without it, DUPA rates can only be changed by SQL.
5. **assemblies (S).** Depends on cost-db. Add the assembly template editor. This is where most of the
   PRD's estimator-keystroke saving comes from.

Next after these: **boq (M)** (fractional quantity, cost/sell split, provisional sums). Then
**contracts (M)**, which becomes eligible once boq and contacts are done (it no longer depends on
tendering), and must be in place before payment-apps.

## 4. Open questions for the business owner

1. **Contract sum and VAT:** ABI's DUPA puts 12% VAT inside every unit rate (H). Is the contract and BOQ
   sum VAT-inclusive, so invoices extract VAT at 12/112, or should BOQ rates be VAT-exclusive with VAT
   added only on the invoice? (Decides the D-2 fix. Related to O-01.)
2. **Allowable budget:** is the cost baseline D only, D + OCM, or TCV minus the target margin? (D-3)
3. **Retention:** VAT and EWT on the retained 10% at each billing, or when retention is released? Is 10%
   standard? Is it released in one go, or split (e.g. 5% at completion and 5% after the defects
   period)? Are retention bonds accepted? (D-7, O-10)
4. **Down payment:** the standard DP %, its VAT treatment, and the recoupment method (pro-rata per
   billing or first billings)? (D-6, D-11)
5. **Billing basis:** cumulative % per BOQ item certified by the client's engineer or QS, or milestone
   %? Which IPC template? (O-04)
6. **Client tax types:** does ABI bid government (DPWH/LGU) work, where the agency withholds 5% final
   VAT plus EWT? Which clients are non-VAT or zero-rated (PEZA)?
7. **Supplier tax:** is ABI a Top Withholding Agent (1% goods / 2% services)? Which suppliers are
   non-VAT? (D-9)
8. **Variations:** does a client-signed VO immediately revise the billable contract sum and the budget?
9. **Togal 30% markup:** confirm it can be retired in favour of DUPA pricing. (D-12)
10. **Scope calls:** is a Filipino UI needed for MVP? Is a public API or webhooks needed before SAP
    integration? (O-02)
