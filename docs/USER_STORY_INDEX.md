# User Story Index

This index maps every user story in
[`apps/web/REFACTOR.md`](../apps/web/REFACTOR.md) to the UI pages,
server actions, and schema tables that implement it. Use it as the
canonical jump-off when you need to find "where does this live".

Status legend:

- Live — feature is functional end-to-end against production schema
- Dev-stub — UI + actions exist but rely on placeholder data or
  partial flow
- Pending — not yet implemented

Routes are rooted at `apps/web/src/app`. Server actions are colocated
with their route under `actions.ts` unless noted.

---

## M1 — CRM: Accounts & Pipeline

| Story | UI Page | Server Actions | Tables | Status |
|---|---|---|---|---|
| US-001 — Create Account with KYC | `/(dashboard)/crm/accounts`, `/(dashboard)/crm/kyc-queue` | `crm/accounts/actions.ts` | `accounts`, `contacts`, `kyc_documents` | Live |
| US-002 — Manage Opportunity Pipeline | `/(dashboard)/crm/opportunities`, `/(dashboard)/pipeline` | `pipeline/actions.ts` | `opportunities`, `pipeline_stages` | Live |
| US-003 — Record Financial Evaluation | `/(dashboard)/crm/opportunities/[id]/proposal` | `crm/opportunities/[id]/proposal/actions.ts` | `financial_evaluations`, `opportunities` | Live |
| US-004 — Pipeline Dashboard | `/(dashboard)/dashboard`, `/(dashboard)/pipeline` | `pipeline/actions.ts` (read) | `opportunities`, `accounts`, `users` | Live |
| US-005 — Won → Project Auto-Conversion | `/(dashboard)/pipeline` (stage transition) | `pipeline/actions.ts` (`markWon`) | `opportunities`, `projects`, `audit_log` | Live |

---

## M2 — Proposal Workflow

| Story | UI Page | Server Actions | Tables | Status |
|---|---|---|---|---|
| US-006 — Digital PPRF Form | `/(dashboard)/crm/opportunities/[id]/proposal` (PPRF tab) | `crm/opportunities/[id]/proposal/actions.ts` | `proposals`, `pprf_responses` | Live |
| US-007 — Site Inspection Report | `/(dashboard)/crm/opportunities/[id]/proposal` (inspection tab) | `crm/opportunities/[id]/proposal/actions.ts` | `site_inspections`, `documents` | Live |
| US-008 — Design Upload & Approval | `/(dashboard)/crm/opportunities/[id]/proposal` (design tab) | `crm/opportunities/[id]/proposal/actions.ts` | `design_uploads`, `documents` | Live |
| US-009 — Client Change Request Log | `/(dashboard)/crm/opportunities/[id]/proposal` (changes tab) | `crm/opportunities/[id]/proposal/actions.ts` | `client_changes` | Dev-stub |

---

## M3 — BOM Engine

| Story | UI Page | Server Actions | Tables | Status |
|---|---|---|---|---|
| US-010 — Togal.ai Import & Auto-Generation | `/(dashboard)/bom`, `/(dashboard)/projects/[id]/bom` | `projects/[id]/bom/actions.ts`, `apps/workers/dxf-parser` | `boms`, `bom_lines`, `documents` | Live |
| US-011 — BOM Review & Edit | `/(dashboard)/bom/[bomId]` | `projects/[id]/bom/actions.ts` | `boms`, `bom_lines`, `rate_cards` | Live |
| US-012 — Client BOM Portal & E-Sign | `/portal/bom/[token]`, `/portal/sign/[token]` | `portal/sign/[token]/actions.ts` | `boms`, `signature_sessions`, `documents` | Live |

---

## M4 — Pre-Construction Hub

| Story | UI Page | Server Actions | Tables | Status |
|---|---|---|---|---|
| US-Pre-001 — Auto-Generated Pre-Con Checklist | `/(dashboard)/projects/[id]/checklist` | `projects/[id]/checklist/actions.ts` | `checklists`, `checklist_items` | Live |
| US-Pre-002 — Permit Tracker | `/(dashboard)/permits`, `/(dashboard)/projects/[id]/permits` | `projects/[id]/permits/actions.ts` | `permits`, `sla_logs` | Live |
| US-Pre-003 — Purchase Order Generation | `/(dashboard)/procurement`, `/(dashboard)/purchase-orders` | `procurement/actions.ts` | `rfqs`, `purchase_orders`, `po_lines`, `vendors` | Live |
| US-013 — RFQ Auto-Dispatch | `/(dashboard)/procurement` | `procurement/actions.ts` (`dispatchRfq`) | `rfqs`, `vendors`, `sla_logs` | Live |

---

## M5 — Construction Cadence

| Story | UI Page | Server Actions | Tables | Status |
|---|---|---|---|---|
| US-Con-001 — Daily Task View | `/(dashboard)/tasks`, `/(dashboard)/projects/[id]/progress` | `tasks/actions.ts` | `tasks`, `task_assignments` | Live |
| US-Con-002 — Variation Orders | `/(dashboard)/projects/[id]/vos` | `projects/[id]/vos/actions.ts` | `variation_orders`, `bom_lines` | Live |
| US-Con-003 — Weekly Progress & S-Curve | `/(dashboard)/projects/[id]/progress` | `projects/[id]/progress/actions.ts` | `progress_snapshots`, `tasks` | Live |

---

## M6 — Post-Construction

| Story | UI Page | Server Actions | Tables | Status |
|---|---|---|---|---|
| US-Post-001 — Punchlist Management | `/(dashboard)/punchlist`, `/(dashboard)/projects/[id]/turnover` | `punchlist/actions.ts` | `punchlist_items`, `documents` | Live |
| US-Post-002 — Turnover Package & COC | `/(dashboard)/projects/[id]/turnover`, `/(dashboard)/projects/[id]/coc` | `projects/[id]/turnover/actions.ts`, `projects/[id]/coc/actions.ts` | `turnover_packages`, `coc`, `signature_sessions` | Live |

---

## M7 — Post-Handover & Warranty

| Story | UI Page | Server Actions | Tables | Status |
|---|---|---|---|---|
| US-WA-001 — Client Warranty Portal | `/portal/warranty/[token]` | `portal/warranty/[token]/actions.ts` | `warranty_tickets`, `documents` | Live |
| US-WA-002 — CX Ticket Management | `/(dashboard)/warranty` | `warranty/actions.ts` | `warranty_tickets`, `sla_logs` | Live |
| US-WA-003 — Auto CNPS Survey | `/portal/cnps/[token]` | `portal/cnps/[token]/actions.ts`, Inngest `warranty.cnps` | `cnps_surveys`, `warranty_tickets` | Live |

---

## Cross-Cutting Integrations

These are not user stories of their own — they are the plumbing that
several stories depend on. Listed here so engineers can trace the
moving parts.

| Capability | UI Surface | Server / Worker | Tables | Status |
|---|---|---|---|---|
| Hash-chained audit log | n/a (read-only UI in admin) | `supabase/migrations/20260509164538_audit_triggers.sql` | `audit_log` | Live |
| RAG retrieval (BOM suggestions) | BOM editor right rail | `packages/ai`, `apps/workers/rag-indexer` | `embeddings` | Dev-stub |
| Signing (canvas + DocuSeal) | `/portal/sign/[token]`, turnover flow | `portal/sign/[token]/actions.ts`, `/api/webhooks/docuseal` | `signature_sessions` | Live |
| Resend email notifications | none (background) | Inngest `sla.tick`, `permits.staleness`, `warranty.cnps` | `notifications` | Live (no-ops without `RESEND_API_KEY`) |
| Semaphore SMS | none (background) | Inngest `sla.tick`, `warranty.cnps` | `notifications` | Dev-stub |
| Realtime dashboard | `/(dashboard)/dashboard` | Supabase Realtime channels | `opportunities`, `projects`, `boms`, `invoices` | Live |

---

## How to Use This Index

1. Find the user story by ID (search `US-` in this file).
2. Open the listed UI page first — that is the source of truth for
   "what does the user see".
3. Follow the colocated `actions.ts` to read the mutations.
4. Cross-reference the listed tables in
   `packages/database/src/schema/` for the Drizzle definitions.
5. Confirm status — if `Dev-stub` or `Pending`, check
   [`NEXT_STEPS.md`](../NEXT_STEPS.md) for the queued work.

When a new story lands, add it to the table for its module and mark
status. Stories that span multiple modules go in
**Cross-Cutting Integrations**.
