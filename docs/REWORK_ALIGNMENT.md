# Rework alignment — closing the showcase gaps

## Context
Rework.com pitched ABI Philippines with a unified BOS focused on
endorsement/procurement + project implementation. This doc maps each
Rework-recommended feature to our shipped surface.

## Mapping

| Rework feature | Our schema | Our route(s) | Status |
|---|---|---|---|
| Tracker (Project Award → Creation → Approval) | boms + bom_line_items + scope_items | /bom + /projects/[id]/bom | Equivalent (called BOM here) |
| RFQ → 3 vendors → evaluation | rfqs + rfq_quotes | /procurement/rfqs | Live |
| Head Commercial / Head Procurement approval | purchase_orders status flow | /purchase-orders/[id] | Live (PM→Commercial→SCM) |
| Vendor Confirmation | (deferred — out of scope per user) | — | Not built |
| Delivery scheduling | delivery_schedules | /procurement/deliveries | Live (new) |
| Site preparation | delivery_schedules.site_prepared_* | /procurement/deliveries/[id] | Live (new) |
| Inspection + acceptance | delivery_inspections | /procurement/deliveries/[id] | Live (new) |
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
- /claims (list + new + [id])
- /projects/[id]/reports (per-project weekly report list)
- /projects/[id]/access (admin: mint/revoke client tokens)
- /(print)/weekly-report/[id]
- /portal/project/[token]/{overview, progress, documents, photos, billing}

## What's intentionally not built
- Vendor Confirmation inbound loop (deferred per ABI scope)
- Mobile native app for on-site daily updates (REFACTOR.md Phase 5)
- Real-time customer Realtime sync (clients see snapshot, not live cursor)
