# Rework alignment — closing the showcase gaps

## Context
The reference workflow proposed a unified business operating system focused on
endorsement/procurement + project implementation. This doc maps each
Rework-recommended feature to our shipped surface.

## Mapping

| Rework feature | Our schema | Our route(s) | Status |
|---|---|---|---|
| Tracker (Project Award → Creation → Approval) | boms + bom_line_items + scope_items | /bom + /projects/[id]/bom | Equivalent (called BOM here) |
| RFQ → 3 vendors → evaluation | rfqs + rfq_quotes | /procurement/rfqs | Live |
| Head Commercial / Head Procurement approval | purchase_orders status flow | /purchase-orders/[id] | Live (PM→Commercial→SCM) |
| Vendor Confirmation | planned `vendor_confirmation_sessions` + replay ledger | planned M3.28 | Scoped; not built |
| Delivery scheduling | delivery_schedules | /procurement/deliveries | Live (new) |
| Site preparation | delivery_schedules.site_prepared_* | /procurement/deliveries/[id] | Live (new) |
| Inspection + acceptance | delivery_inspections | /procurement/deliveries/[id] | Live (new) |
| Project budget by Cost Code | cost_codes + project_budgets + project_budget_lines | /projects/[id]/cost/budget | Implemented locally; release-gated |
| Budget commitment control | project_budgets + po_line_items + supplier_bill_lines + cost_entries | /projects/[id]/cost + /purchase-orders/[id] | Implemented locally; release-gated |
| Warehouse receipt and perpetual stock | warehouses + stock_receipts + stock_receipt_lines + stock_ledger_entries | /inventory + /inventory/receipts | Implemented locally; release-gated |
| Transfer, project consumption, and count adjustment | stock_movements + stock_movement_lines + stock_ledger_entries | /inventory/movements | Implemented locally; release-gated |
| PO → receipt → Supplier Bill match | po_line_items + stock_receipt_lines + supplier_bill_lines | /finance/payables + /inventory/receipts/[id] | Implemented locally; release-gated |
| Progress Milestone Claim (6-step) | progress_claims + progress_claim_documents | /claims + /claims/[id] | Live (new) |
| Gantt timeline | master_schedules.tasks JSONB | /projects/[id]/progress?view=gantt | Live (new) |
| Weekly auto-report (PPT/PDF) | weekly_reports | /projects/[id]/reports + /(print)/weekly-report/[id] | Live (new) |
| Customer portal (read-only continuous) | customer_portal_sessions | /portal/project/[token]/* | Live (new) |

## Workflow state machines

### Delivery (9 states)
scheduled → site_preparing → site_ready → in_transit → received → inspecting → accepted / rejected / cancelled

### Progress Claim (9 states)
draft → submitted → certificate_pending → certified → handed_over_finance → invoiced → paid / rejected / cancelled

## Production routes added
- /procurement/deliveries (list + new + [id])
- /inventory (control center)
- /inventory/receipts (list + new + [id])
- /inventory/movements (list + new + [id])
- /projects/[id]/cost/budget (versioned cost baseline and control)
- /claims (list + new + [id])
- /projects/[id]/reports (per-project weekly report list)
- /projects/[id]/access (admin: mint/revoke client tokens)
- /(print)/weekly-report/[id]
- /portal/project/[token]/{overview, progress, documents, photos, billing}

## What's intentionally not built
- Vendor confirmation inbound loop (planned M3.28; source-only scope is defined)
- Mobile native app for on-site daily updates (REFACTOR.md Phase 5)
- Real-time customer Realtime sync (clients see snapshot, not live cursor)
