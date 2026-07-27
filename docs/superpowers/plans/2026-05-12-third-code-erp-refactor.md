# Third Code ERP Refactor — Historical Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes. Each phase ends with verification + drizzle push + commit + push.

**Goal:** Transform the original construction ERP foundation into Third Code
ERP, a unified multi-tenant operations platform, as specified in
`apps/web/REFACTOR.md`.

**Architecture:** Surgical, additive refactor. Preserve the strong foundation (Next.js 15 + Supabase + Drizzle + RLS + hash-chained audit log + Inngest + dashboard scaffolding). Insert a new `accounts` entity layer between `tenants` and `opportunities`. Replace pipeline stage taxonomy. Add 7 new modules (M1–M7) with new schemas, server actions, UI surfaces, RLS policies, and tests. Reuse the `auth_tenant_id()` RLS helper, hash-chained audit pattern, and bigint-cents money model throughout.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM (postgres-js), Supabase (Postgres + Auth + Storage + Realtime + Edge Functions), Tailwind v4 (CSS-first), shadcn/ui patterns, Inngest, Playwright, Vitest, FastAPI (Python workers), DocuSeal (self-hosted), Resend, OpenAI (RAG/chat), Semaphore SMS.

**Branch:** Work directly on `main` (matches the existing development pattern visible in `git log`).

**Verification gates per phase:**
1. `pnpm --filter @third-code-erp/database typecheck` passes
2. `pnpm --filter @third-code-erp/shared-types typecheck && pnpm --filter @third-code-erp/shared-types test` passes
3. `pnpm --filter @third-code-erp/web typecheck` passes
4. `pnpm --filter @third-code-erp/web build` produces no errors
5. RLS policies present for every new table (`SELECT/INSERT/UPDATE/DELETE` × tenant pattern)
6. Audit trigger attached to every new write-heavy table
7. Drizzle migration generated + applied (`pnpm --filter @third-code-erp/database generate` then push to Supabase)
8. Phase commits: `git commit -m "feat(third-code-erp): phase N — <module>"` + `git push origin main`

---

## Gap Map: Current → Target

| Domain | Original foundation | Third Code ERP target | Strategy |
|---|---|---|---|
| Roles | 6: owner/admin/estimator/sales/pm/viewer | 9: Admin/Sales/Commercial/Design/SD-PM-PE/Finance/Procurement/Safety/CX | Extend enum; map legacy values |
| Entity hierarchy | tenants → projects → opportunities | tenants → **accounts** → opportunities → projects | Insert `accounts` layer |
| Pipeline stages | 7 stages, project-linked | 8 stages, account-linked, KYC-gated, SLA-clocked | Replace enum + transitions table |
| Account KYC | None | AFS×3, BIR 2303, VAT cert, suppliers/clients, Finance review | New `accounts` + `account_kyc` |
| PPRF | None | Digital, versioned, embedded in Opportunity | New schema |
| Site Inspection | None | Form + 30 photos + RFI + PDF generation | New schema |
| Design Loop | None | File versioning + approval + change requests | New schema |
| BOM | DXF/PDF/XLSX/CSV/DOCX extract + RAG + PH catalog | + Togal.ai mapping, rate cards, mapping config, client portal (DocuSeal), RFQ | Extend |
| Pre-Con Checklist | None | 12-item auto-checklist on project creation, SLA-tracked | New schema |
| Permits | None | LGU/Building/DOLE tracker | New schema |
| Variation Orders | None | Full VO flow with e-sign | New schema |
| Progress + S-curve | None | Weekly progress + master schedule + Gantt | New schema |
| Punchlist | None | Photo-based, PE sign-off | New schema |
| Turnover + COC | None | Auto-compilation + e-sign | New schema |
| Warranty Tickets | None | Portal + queue + SLA enforcement | New schema |
| CNPS | None | Auto-survey 48h after close + dashboard | New schema |
| SLA Engine | None | Edge Functions every 30 min | New |
| Email | None | Resend + 11 templates | New |
| Notifications | None | In-app + email + SMS | New |
| Design tokens | Navy custom + no gold | Navy `#0F2D4A` + Gold `#E07B2A` per spec | Update |
| Storage RLS | Bucket policies present | All storage paths tenant-prefixed | Already OK |
| Audit triggers | 6 tables | All write-heavy tables | Extend |

---

## Phase Sequence

The plan executes in 10 phases. Each is committed/pushed independently. Phases
1–7 align to Third Code ERP modules M1–M7. Phases 0/8/9 are foundation +
cross-cutting + polish.

```
Phase 0 → Foundation (rebrand, tokens, roles, accounts schema)
Phase 1 → M1 CRM (Accounts + KYC + 8-stage Pipeline + Won→Project)
Phase 2 → M2 Proposal (PPRF + Site Inspection + Design Loop)
Phase 3 → M3 BOM Engine (Togal Import + Rate Cards + Client Portal + DocuSeal)
Phase 4 → M4 Pre-Construction (Checklist + Permits + POs + Contract)
Phase 5 → M5 Construction (Daily Tasks + VOs + Progress + S-curve)
Phase 6 → M6 Post-Construction (Punchlist + Turnover + COC)
Phase 7 → M7 Warranty + CX (Tickets + CNPS)
Phase 8 → Cross-Cutting (SLA Engine + Resend + Notifications + DocuSeal Webhook)
Phase 9 → Polish (Design System + Responsive + A11y + Perf + Security + Docs)
```

---

## Chunk 1: Phase 0 — Foundation

### Task 0.1: Update package + project naming where appropriate

**Files:**
- Modify: `apps/web/src/app/layout.tsx` (page title)
- Modify: `apps/web/src/components/nav/sidebar.tsx` (header text)
- Modify: `package.json` (root name — keep "third-code-erp" workspace name, but add display name)

**Rationale:** Do not rename workspace packages without a dedicated compatibility
migration. Update user-visible branding independently.

- [ ] Replace user-visible legacy branding in layout title, sidebar, and login page header
- [ ] Verify typecheck passes

### Task 0.2: Update design tokens to Navy + Gold per REFACTOR.md §5.1

**Files:**
- Modify: `apps/web/src/app/globals.css`

Apply:
```css
--color-navy-700: #0F2D4A;  /* spec primary */
--color-gold-500: #E07B2A;  /* new accent */
--color-gold-50, 100, 200, 600, 700  /* derived ladder */
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
```

- [ ] Update navy ladder so `--color-navy-700` = `#0F2D4A`
- [ ] Add gold scale (50–950) using L*c*h interpolation from #E07B2A
- [ ] Add `--radius-sm/md/lg` tokens; replace inlined radii in shells and chrome
- [ ] Verify pages still render OK; commit

### Task 0.3: Expand role enum to 9 Third Code ERP roles

**Files:**
- Modify: `packages/database/src/schema/enums.ts` (role enum)
- Modify: `packages/auth/src/server.ts` (AppRole union + ROLE_RANK)
- New SQL migration: `supabase/migrations/20260512<HHMMSS>_tenant_roles.sql`

New roles: `admin, sales, commercial, design, sd_pm_pe, finance, procurement, safety, cx`

Legacy mapping:
- `owner` → `admin`
- `estimator` → `commercial`
- `pm` → `sd_pm_pe`
- `viewer` → keep (read-only fallback)

- [ ] Add new enum values via `ALTER TYPE role ADD VALUE 'commercial'` etc.
- [ ] Update `users.role` for existing rows: `UPDATE users SET role='admin' WHERE role='owner'`, etc.
- [ ] Update `roleEnum` in Drizzle schema to new value list
- [ ] Update `AppRole` union + `ROLE_RANK` map
- [ ] Update any UI that lists roles (signup form, settings page)
- [ ] Typecheck + commit

### Task 0.4: Add `accounts` + `contacts` + `account_kyc` schemas

**Files:**
- New: `packages/database/src/schema/accounts.ts`
- New: `packages/database/src/schema/contacts.ts`
- New: `packages/database/src/schema/account-kyc.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/schema/opportunities.ts` (add nullable `account_id`)
- Modify: `packages/database/src/schema/projects.ts` (add nullable `account_id`)
- New SQL migration: `supabase/migrations/20260512<HHMMSS>_accounts.sql` (tables + RLS + audit triggers)

**Schema highlights:**
```ts
// accounts
id, tenant_id, name, industry, billing_address, primary_contact_id,
kyc_status enum('pending'|'approved'|'flagged'|'rejected'|'not_required'),
kyc_notes, kyc_decided_at, kyc_decided_by,
bir_2303_doc_id, vat_cert_doc_id,
created_at, updated_at, created_by

// contacts
id, tenant_id, account_id, full_name, email, phone, role_title, is_primary, created_at, updated_at

// account_kyc (line-items for KYC artifacts: AFS×3, top-10 suppliers, top-10 clients)
id, tenant_id, account_id, artifact_type enum('afs_year_1'|'afs_year_2'|'afs_year_3'|'top_suppliers'|'top_clients'|'bir_2303'|'vat_cert'),
document_id, notes, uploaded_at, uploaded_by
```

- [ ] Write Drizzle schemas
- [ ] Generate migration: `pnpm --filter @third-code-erp/database generate`
- [ ] Write hand-written SQL migration adding RLS + audit triggers
- [ ] Push to local Supabase (`supabase db reset` if available) or apply via `psql $DATABASE_URL`
- [ ] Typecheck passes
- [ ] Commit + push

### Task 0.5: Save the master plan + update task list

- [ ] Save this plan to `docs/superpowers/plans/2026-05-12-third-code-erp-refactor.md` (done)
- [ ] Commit + push the plan
- [ ] Move Phase 0 task to completed; move Phase 1 to in_progress

---

## Chunk 2: Phase 1 — M1 CRM (Accounts + KYC + 8-stage Pipeline)

### Task 1.1: Update opportunity stage enum to 8-stage Third Code ERP taxonomy

**Stages (REFACTOR.md M1):** `lead → site_survey → design → bom_submission → negotiation → contract → won → lost`

(Note: PRD doesn't explicitly enumerate; derived from US-001..005 + tabs. Will refine during impl.)

Map old → new:
- `opportunity_creation` → `lead`
- `scoping` → `site_survey`
- `bom_submission` → `bom_submission`
- `resubmission` → `negotiation`
- `negotiation` → `negotiation`
- `closed_won` → `won`
- `closed_lost` → `lost`

**Files:**
- Modify: `packages/database/src/schema/enums.ts`
- Modify: `packages/shared-types/src/opportunities.ts` (`STAGE_TRANSITIONS`, `STAGE_PROBABILITY`)
- New SQL migration: stage enum updates + UPDATE existing rows

**Subtasks:**
- [ ] Write new enum + transitions table
- [ ] Add KYC-gate: cannot advance past `site_survey` until `accounts.kyc_status='approved'`
- [ ] Add regression-reason field (already partial via `lost_reason`; generalize to `stage_change_reason`)
- [ ] SLA clock: track stage transitions in new `opportunity_stage_history` table with `entered_at`, `exited_at`, `sla_breached`
- [ ] Update server actions to enforce KYC gate + capture reason on regression
- [ ] Update `STAGE_TRANSITIONS` tests in `packages/shared-types`
- [ ] Drizzle generate + SQL migration + push
- [ ] Commit

### Task 1.2: Account CRUD + KYC review workflow

**Files:**
- New: `apps/web/src/app/(dashboard)/crm/accounts/page.tsx` (list)
- New: `apps/web/src/app/(dashboard)/crm/accounts/new/page.tsx` (create form)
- New: `apps/web/src/app/(dashboard)/crm/accounts/[id]/page.tsx` (detail)
- New: `apps/web/src/app/(dashboard)/crm/accounts/[id]/actions.ts` (server actions)
- New: `apps/web/src/app/(dashboard)/crm/kyc-queue/page.tsx` (Finance queue)
- New: `apps/web/src/components/accounts/*` (form, kyc-doc-upload, primary-contact-picker, duplicate-warning)
- Modify: `apps/web/src/components/nav/sidebar.tsx` (add CRM section)

**Subtasks:**
- [ ] Create form with all KYC fields (AFS×3 upload, BIR 2303, VAT cert, top-10 suppliers/clients lists)
- [ ] Server action `createAccount` with duplicate detection on email domain + company name
- [ ] Finance KYC queue page lists `accounts WHERE kyc_status='pending'` ordered by `created_at`
- [ ] `updateKycStatus` server action: Approved/Flagged/Rejected with notes; notification dispatch
- [ ] In-app notification (initially: render in topbar; email later in Phase 8)
- [ ] Account detail shows: contacts list, linked opportunities, projects, tickets summary
- [ ] Add CRM section to sidebar above existing Pipeline section
- [ ] Role gating: Sales/Admin create accounts; Finance updates KYC
- [ ] E2E test: create account → Finance approves → opportunity unblocked

### Task 1.3: Pipeline Kanban (8 stages) + dashboard upgrades

**Files:**
- New: `apps/web/src/app/(dashboard)/pipeline/board/page.tsx` (Kanban)
- New: `apps/web/src/components/pipeline/pipeline-board.tsx` (drag-to-stage)
- New: `apps/web/src/components/pipeline/opportunity-card.tsx`
- New: `apps/web/src/components/pipeline/regression-reason-dialog.tsx`
- Modify: `apps/web/src/app/(dashboard)/pipeline/page.tsx` (redirect → `/pipeline/board`)
- Modify: `apps/web/src/app/(dashboard)/pipeline/conversion/page.tsx` (rebuild for 8 stages or remove)
- Modify: `apps/web/src/components/dashboard/stage-distribution.tsx` (8 stages)
- New: `apps/web/src/components/dashboard/conversion-rate-table.tsx` (US-004 #2)
- New: `apps/web/src/components/dashboard/forecast-chart.tsx` (US-004 #5)
- New: `apps/web/src/components/dashboard/export-csv-button.tsx` (US-004 #4)

**Subtasks:**
- [ ] Kanban with drag-to-advance + KYC gate validation
- [ ] Card shows: client, forecast TCV, assigned rep, days in stage, SLA dot
- [ ] Quick-add in each column header
- [ ] Toggle to list/table view (keep existing table)
- [ ] Real-time stage updates via Supabase Realtime (extend `realtime-refresher`)
- [ ] Dashboard: conversion-rate between stage pairs
- [ ] Dashboard: monthly close forecast by rep (computed from `opportunities.closing_date`)
- [ ] CSV export (server action returns CSV with all opp fields)
- [ ] Update stage hardcoded constants in all 4 dashboard files
- [ ] E2E: drag opp through stages

### Task 1.4: Won → Project auto-conversion

**Files:**
- New: `apps/web/src/lib/operations/won-conversion.ts`
- Modify: `apps/web/src/app/(dashboard)/pipeline/actions.ts` (advanceOpportunityStage)
- New SQL migration: `signed_contracts` + `down_payments` tables (if not folded into documents)

**Subtasks:**
- [ ] Won trigger requires: signed-contract doc upload + Finance down-payment confirmation
- [ ] Server action validates both prerequisites before allowing `won` transition
- [ ] On Won: auto-create Project with linked Account, all Opp data, PPRF, Inspection Report, design files, signed BOM
- [ ] Notify SD-PM (in-app + email-stub for Phase 8)
- [ ] Notify Finance to create AR code + Project code
- [ ] Auto-generate Pre-Con checklist (template applied — full impl in Phase 4)
- [ ] Lock Opportunity stage to Won (validation in stage machine)
- [ ] E2E: sign-contract + confirm-down-payment + mark won → project created

### Task 1.5: Phase 1 verification + commit

- [ ] Run all typechecks
- [ ] Run unit tests in `packages/shared-types`
- [ ] Run E2E `pipeline.spec.ts` + `dashboard.spec.ts`
- [ ] Drizzle push to remote DB (Supabase)
- [ ] `git add . && git commit -m "feat(third-code-erp): phase 1 — M1 CRM + Accounts + KYC + 8-stage pipeline"`
- [ ] `git push origin main`
- [ ] Mark task #7 completed; move Phase 2 to in_progress

---

## Chunk 3: Phase 2 — M2 Proposal Workflow

### Task 2.1: Schema — PPRF + Site Inspection + Design Files + Change Requests

**Files:**
- New: `packages/database/src/schema/pprf-submissions.ts` (versioned)
- New: `packages/database/src/schema/site-inspections.ts`
- New: `packages/database/src/schema/site-inspection-photos.ts`
- New: `packages/database/src/schema/site-inspection-rfis.ts`
- New: `packages/database/src/schema/design-files.ts` (file_type enum: initial_layout/final_rendering/animation/revised)
- New: `packages/database/src/schema/design-file-versions.ts`
- New: `packages/database/src/schema/change-requests.ts` (priority: minor/major)
- New: `packages/database/src/schema/change-logs.ts`
- New SQL migration with RLS + audit triggers

**Subtasks:**
- [ ] Schemas with `opportunity_id` FK and tenant_id
- [ ] PPRF versioning via `(opportunity_id, version)` unique
- [ ] Drizzle generate + SQL migration + push
- [ ] Typecheck

### Task 2.2: PPRF digital form embedded in Opportunity

**Files:**
- New: `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/page.tsx`
- New: `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/pprf/page.tsx`
- New: `apps/web/src/components/proposal/pprf-form.tsx`
- New: `apps/web/src/components/proposal/pprf-version-diff.tsx`

**Subtasks:**
- [ ] PPRF form with required fields: site address, floor area, landlord contact, as-built availability
- [ ] Save creates new version row; diff log shows field-level changes
- [ ] Submit: notify Commercial + Finance
- [ ] Render version history with diff viewer

### Task 2.3: Site Inspection Report

**Files:**
- New: `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/inspection/page.tsx`
- New: `apps/web/src/components/proposal/site-inspection-form.tsx`
- New: `apps/web/src/components/proposal/photo-uploader.tsx` (up to 30 images, auto-compress to 2MB)
- New: `apps/web/src/components/proposal/rfi-list.tsx`
- New: `apps/web/src/lib/pdf/site-inspection-pdf.ts` (server-side PDF generation)

**Subtasks:**
- [ ] Block submission until PPRF is submitted
- [ ] Photo upload component: drag-drop, client-side compress to 2MB JPEG, max 30 images
- [ ] Inline RFI flag → creates RFI log entries
- [ ] Auto-generate PDF on submit; store in Document Vault as `document_type='site_inspection_report'`
- [ ] Notify Design on submit

### Task 2.4: Design Loop (upload + versioning + approval)

**Files:**
- New: `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/design/page.tsx`
- New: `apps/web/src/components/proposal/design-file-uploader.tsx` (PDF, PNG, JPG, DWG; max 50MB)
- New: `apps/web/src/components/proposal/design-version-list.tsx`
- New: `apps/web/src/components/proposal/change-request-form.tsx`
- New: `apps/web/src/components/proposal/change-request-log.tsx`

**Subtasks:**
- [ ] File upload (reuse existing 3-step upload flow, extend to 50MB limit)
- [ ] File type selector: Initial Layout / Final Rendering / Animation / Revised
- [ ] "Mark as Ready for Presentation" button → notify Sales
- [ ] Version history table
- [ ] Approved files lock (read-only)
- [ ] Change Request form: description, requested by, date, files affected, priority
- [ ] Each CR creates Change Log entry linked to design version
- [ ] "Approved without changes" button → lock design + trigger BOM generation task

### Task 2.5: Phase 2 verification + commit

- [ ] All typechecks
- [ ] E2E: file PPRF → inspection (with photos) → design upload → CR log → approve
- [ ] Drizzle push
- [ ] Commit + push: `feat(third-code-erp): phase 2 — M2 Proposal (PPRF + Inspection + Design)`
- [ ] Move Phase 3 to in_progress

---

## Chunk 4: Phase 3 — M3 BOM Engine

### Task 3.1: Schema — Material Items + Rate Cards + Mapping Config + Client Portals

**Files:**
- New: `packages/database/src/schema/material-items.ts` (master catalog: code, description, category, unit, wastage_pct)
- New: `packages/database/src/schema/rate-cards.ts` (per-tenant, per-supplier, with effective_from/to)
- New: `packages/database/src/schema/mapping-config.ts` (Togal column → material_item_id)
- New: `packages/database/src/schema/bom-portal-tokens.ts` (token hash, expires_at, used_at)
- Modify: `packages/database/src/schema/bom-line-items.ts` (add material_item_id, vendor_id, justification, is_flagged)
- Modify: `packages/database/src/schema/boms.ts` (add `submitted_for_client_at`, `client_signed_at`, `docuseal_submission_id`)

**Subtasks:**
- [ ] Schemas
- [ ] Drizzle generate + SQL migration with RLS
- [ ] Push

### Task 3.2: Togal.ai Import Parser (Python worker)

**Files:**
- New: `apps/workers/dxf-parser/src/parsers/togal_parser.py` (or new bom-importer service)
- New: `apps/web/src/app/api/bom/togal-import/route.ts` (upload endpoint)
- New: `apps/web/src/components/bom/togal-import-form.tsx`

**Subtasks:**
- [ ] Python parser using pandas/openpyxl
- [ ] Normalize column names; validate required cols (Element Type, Quantity, Unit)
- [ ] Apply mapping config; flag unmapped items
- [ ] Apply wastage % from material_items
- [ ] Apply rate card pricing
- [ ] Create BOM with status `Pending Review` within 30s
- [ ] Red-flag items without rate card entry

### Task 3.3: Rate Card + Mapping Config admin UIs

**Files:**
- New: `apps/web/src/app/(dashboard)/admin/material-items/page.tsx` + CRUD
- New: `apps/web/src/app/(dashboard)/admin/rate-cards/page.tsx` + CRUD
- New: `apps/web/src/app/(dashboard)/admin/mapping-config/page.tsx`

**Subtasks:**
- [ ] CRUD tables with inline edit
- [ ] Bulk import (CSV) for material items + rate cards
- [ ] Admin-only role gate

### Task 3.4: Commercial BOM Review screen (inline edit, supplier switcher, variance alert)

**Files:**
- Modify: `apps/web/src/components/bom/bom-builder.tsx` (extend existing)
- New: `apps/web/src/components/bom/supplier-switcher-panel.tsx`
- New: `apps/web/src/components/bom/variance-banner.tsx`
- New: `apps/web/src/components/bom/justification-dialog.tsx`

**Subtasks:**
- [ ] Inline cell editing with Tab to next
- [ ] Side panel: supplier switcher (lists active rates for selected item)
- [ ] Quantity override requires justification (max 200 chars, audit-logged)
- [ ] Price override shows delta vs preferred rate
- [ ] Bottom bar: total, variance vs Opp forecast (>15% flagged), red-flag count
- [ ] Disable "Submit for Client Approval" if red flags present

### Task 3.5: Client BOM Portal (token-based) + DocuSeal e-sign

**Files:**
- New: `apps/web/src/app/portal/bom/[token]/page.tsx` (public, no auth)
- New: `apps/web/src/app/portal/bom/[token]/sign-action.ts`
- New: `apps/web/src/app/api/webhooks/docuseal/route.ts`
- New: `packages/integrations/docuseal/` (new package or `apps/web/src/lib/docuseal/`)

**Subtasks:**
- [ ] Token generation on "Submit for Client Approval" (48hr expiry, hashed in DB)
- [ ] Public portal page: project summary, BOM by category (collapsed), milestones, validity date
- [ ] DocuSeal `POST /submissions` creates signing flow; embed slug in portal
- [ ] Webhook receives `submission.completed`; downloads signed PDF, stores in Vault, updates BOM status `signed`, notifies Sales + Commercial
- [ ] "Already Signed" + "Expired" portal states
- [ ] Audit log on every portal action

### Task 3.6: RFQ Auto-Dispatch

**Files:**
- New: `packages/database/src/schema/rfqs.ts` + `rfq-line-items.ts` + `rfq-quotes.ts`
- New: `apps/web/src/app/(dashboard)/procurement/rfqs/page.tsx`
- New: `apps/web/src/components/procurement/rfq-task-row.tsx`
- New: `apps/web/src/components/procurement/quote-entry-form.tsx`
- New: `apps/web/src/components/procurement/price-comparison-table.tsx`

**Subtasks:**
- [ ] On BOM internally-approved: create RFQ tasks for each line item not flagged contracted-rate
- [ ] Procurement logs received quotes per item (supplier, price, lead time, validity)
- [ ] Auto-build price comparison table
- [ ] On completion: notify Commercial

### Task 3.7: Phase 3 verification + commit

- [ ] Typecheck, build, E2E
- [ ] Drizzle push
- [ ] Commit + push: `feat(third-code-erp): phase 3 — M3 BOM (Togal + Rate Cards + Client Portal + DocuSeal)`

---

## Chunk 5: Phase 4 — M4 Pre-Construction Hub

### Task 4.1: Schema — Checklist + Permits + Contract

**Files:**
- New: `packages/database/src/schema/pre-con-checklist-templates.ts` (configurable in admin)
- New: `packages/database/src/schema/pre-con-checklists.ts` (one per project)
- New: `packages/database/src/schema/pre-con-checklist-items.ts` (12 items per checklist)
- New: `packages/database/src/schema/permits.ts` (type, status, dates, escalation)
- New: `packages/database/src/schema/permit-documents.ts`
- New: `packages/database/src/schema/contracts.ts` (project-level, with DocuSeal submission id)

### Task 4.2: Auto-generated 12-item checklist on project creation

- [ ] Trigger on `projects` insert: copy template items
- [ ] Each item: title, owner role, SLA days, depends_on, status (not_started/in_progress/blocked/done)
- [ ] SLA clock starts when depends_on item is done
- [ ] Blocked requires blocker description
- [ ] Done requires file or confirmation

### Task 4.3: Permit Tracker

- [ ] CRUD with 3 types: Building Admin Vetting, LGU Building Permit, DOLE
- [ ] Status options + status history
- [ ] File attachments per submission
- [ ] Escalation: alert PM + GM if no update in 7 business days
- [ ] On Approved: auto-mark linked checklist item Done

### Task 4.4: PO generation from approved BOM (grouped by supplier) + PM→Commercial→SCM approval

**Files:**
- Modify: `apps/web/src/app/(dashboard)/procurement/actions.ts` (extend createPoFromBom)
- Modify: `packages/database/src/schema/purchase-orders.ts` (add approver fields + new statuses)

**Subtasks:**
- [ ] Status enum expansion: `draft → pending_pm_approval → pending_commercial_approval → pending_scm_issuance → issued → partial_delivered → fully_delivered`
- [ ] BOM line items get `vendor_id` (best-rate by default, overridable)
- [ ] "Generate POs" action: groups BOM lines by vendor_id, creates one PO per supplier
- [ ] Three approval steps with role gates + audit
- [ ] Supplier email dispatch on Issue (stub in Phase 4, full in Phase 8 with Resend)

### Task 4.5: Contract module + Finance AR code

- [ ] Contract template generation from signed BOM
- [ ] DocuSeal e-sign
- [ ] AR code creation workflow (Finance role)

### Task 4.6: Phase 4 verification + commit

---

## Chunk 6: Phase 5 — M5 Construction

### Task 5.1: Schema — Cadence + Daily Tasks + VOs + Master Schedule + Progress

- `cadence_templates` (per role per project phase)
- `daily_tasks` (auto-generated per role per project per day)
- `variation_orders` (with cost_impact, time_impact, change_type)
- `vo_documents` (e-sign artifacts)
- `master_schedules` (Level 1, imported via CSV)
- `progress_updates` (weekly, % by WBS category: Civil/Electrical/MEP/Finishes)

### Task 5.2: My Tasks view (cadence engine)

- [ ] Background job (Inngest cron) generates daily tasks per project per role
- [ ] "My Tasks" page: today's tasks grouped by project
- [ ] Single-tap complete + optional notes
- [ ] Overdue badge on nav icon

### Task 5.3: Variation Orders

- [ ] Create form: description, change_type (client/site/design), cost_impact, time_impact
- [ ] Commercial pricing review before client routing
- [ ] DocuSeal e-sign via existing flow
- [ ] On approval: add to project cost tracker; extend schedule if time_impact > 0
- [ ] VO log shows running totals

### Task 5.4: Weekly Progress + S-curve

- [ ] Form: % per WBS category
- [ ] Pull planned % from imported Master Schedule
- [ ] S-curve chart (planned vs actual)
- [ ] Schedule variance computed (days ahead/behind)
- [ ] Milestone completion triggers billing notification

### Task 5.5: Master Schedule import + Gantt

- [ ] CSV import with task name, start, finish, predecessor
- [ ] Gantt view (read-only initially)

### Task 5.6: Phase 5 verification + commit

---

## Chunk 7: Phase 6 — M6 Post-Construction

### Task 6.1: Schema — Punchlist + Turnover + COC

- `punchlist_items` (description, location, trade, priority, due_date, assigned_to, status, pe_signed_off_at)
- `punchlist_photos` (up to 5 per item)
- `turnover_packages` (compiled bundle of as-builts, O&M, warranties, keys)
- `certificates_of_completion` (auto-drafted, DocuSeal e-signed)

### Task 6.2: Punchlist management

- [ ] Photo upload (up to 5 per item, max 5MB each)
- [ ] Status workflow: Open → In Progress → For Inspection → Closed
- [ ] Closed requires PE sign-off (separate action)
- [ ] PM dashboard: punchlist % complete by trade
- [ ] Auto-notify assigned party on create + 3 days before due
- [ ] CX notified at 100% closed

### Task 6.3: Turnover Package + COC

- [ ] Check Document Vault for required docs (as-builts, O&M, warranties, keys log)
- [ ] Missing-doc checklist shown to PM
- [ ] COC draft auto-generated with project details pre-filled
- [ ] Client e-sign via DocuSeal
- [ ] On COC signing: warranty period starts + M7 CX onboarding triggered

### Task 6.4: Phase 6 verification + commit

---

## Chunk 8: Phase 7 — M7 Warranty + CX

### Task 7.1: Schema — Warranty Tickets + Messages + CNPS

- `warranty_tickets` (with token-based client access)
- `ticket_messages` (internal vs client-visible)
- `service_reports` (uploaded on close)
- `cnps_surveys` (sent 48h after close, NPS 0-10 + comment)
- `account_cnps_scores` (rolling average per account)
- `warranty_portal_tokens` (one-time, no login)

### Task 7.2: Client warranty portal

- [ ] Public route: `/portal/warranty/[token]`
- [ ] Ticket form: category (dropdown), description, up to 5 photos, location within site
- [ ] Confirmation email sent immediately (stub)
- [ ] Portal returns "Already submitted" if reused

### Task 7.3: CX Ticket Management

- [ ] Queue sorted by age; overdue red
- [ ] Ticket detail: full thread, attachments
- [ ] Internal notes vs client-visible
- [ ] Schedule repair: templated email; client confirms in portal
- [ ] Close ticket: Service Report upload required
- [ ] SLA: 24hr ack, 48hr schedule; breach alert to CX Manager

### Task 7.4: Auto CNPS Survey

- [ ] Edge Function cron (Phase 8 wiring): 48h post-close
- [ ] One-question NPS email with one-click rating
- [ ] Response stored + rolled into Account CNPS
- [ ] Score < 7 → alert to CX Manager

### Task 7.5: CX Dashboard

- [ ] Score distribution, trend over time, low-score ticket list

### Task 7.6: Phase 7 verification + commit

---

## Chunk 9: Phase 8 — Cross-Cutting Infrastructure

### Task 8.1: SLA Engine (Supabase Edge Functions)

**Files:**
- New: `supabase/functions/sla-checker/index.ts` (every 30 min)
- New: `supabase/functions/permit-staleness-checker/index.ts` (daily 08:00 PHT)
- New: `supabase/functions/cnps-survey-sender/index.ts` (every hour)

**Subtasks:**
- [ ] sla-checker: query all active sla_logs not breached; compute elapsed business days; at 80% → at-risk notification; at 100% → breach + notify BU head
- [ ] permit-staleness-checker: alert if permit no update > 7 business days
- [ ] cnps-survey-sender: send pending surveys
- [ ] Deploy via Supabase CLI; cron via Supabase pg_cron or external scheduler

### Task 8.2: Resend Email Integration + 11 Templates

**Files:**
- New: `packages/integrations/resend/` package (or `apps/web/src/lib/email/`)
- New: `apps/web/src/emails/*.tsx` (React Email components for each template)

**Templates:**
- [ ] kyc-request, kyc-result, design-ready, bom-portal-link, bom-signed
- [ ] rfq-dispatch, po-issued, ticket-ack, ticket-schedule, cnps-survey, sla-breach

### Task 8.3: Notifications System

- New: `packages/database/src/schema/notifications.ts`
- [ ] In-app inbox in topbar (already has Bell icon)
- [ ] Email dispatch via Resend
- [ ] SMS via Semaphore for SLA breaches + client schedules

### Task 8.4: DocuSeal Webhook + Submission Tracking

- [ ] Centralize webhook handler in `apps/web/src/app/api/webhooks/docuseal/route.ts`
- [ ] Track all submissions: BOM, VO, Contract, COC
- [ ] On `submission.completed`: route to appropriate handler

### Task 8.5: Audit Log Coverage

- [ ] Attach audit trigger to all new tables (accounts, contacts, account_kyc, pprf_*, site_inspections, design_*, change_requests, material_items, rate_cards, mapping_config, bom_portal_tokens, rfqs, pre_con_checklists, permits, contracts, variation_orders, progress_updates, punchlist_items, warranty_tickets, ticket_messages, service_reports, cnps_surveys, notifications)

### Task 8.6: Phase 8 verification + commit

---

## Chunk 10: Phase 9 — Polish

### Task 9.1: Design system pass

- [ ] Audit all components for Navy/Gold token usage
- [ ] Inter font system-wide (verify)
- [ ] Radii from `--radius-sm/md/lg` everywhere

### Task 9.2: Mobile responsiveness

- [ ] Tablet (768px+): all screens fully functional
- [ ] Mobile (375px+): dashboards, daily tasks, photo uploads, notifications

### Task 9.3: WCAG 2.1 AA compliance pass

- [ ] All inputs labeled
- [ ] Color never sole indicator of status
- [ ] Keyboard navigation for all primary workflows
- [ ] axe DevTools clean

### Task 9.4: Performance — k6 tests

- [ ] BOM generation < 30s (500-row Togal)
- [ ] Page load < 2s P95
- [ ] API response < 500ms P95
- [ ] 50 concurrent users

### Task 9.5: Security — OWASP ZAP scan

- [ ] Run ZAP baseline scan
- [ ] Fix High/Critical findings

### Task 9.6: E2E coverage

- [ ] Add E2E specs for all critical user paths (Account create → KYC → Won → Project → Pre-Con → Construction → Punchlist → Warranty → CNPS)

### Task 9.7: Documentation

- [ ] Update README.md
- [ ] Update CLAUDE.md to reference REFACTOR.md as spec
- [ ] Add ADRs for major decisions (accounts entity, DocuSeal, Togal parser approach)

### Task 9.8: Final commit + push

---

## Notes on Execution Strategy

1. **Sequential phases, parallel within phase.** Phases must complete in order due to dependencies (schema first, then UI). Within a phase, dispatch parallel subagents for independent file groups: schema authors, UI builders, test writers, RLS migration writers.

2. **Frequent commits.** Every working subtask commits. Every phase ends with a `git push origin main`.

3. **Database push cadence.** After each phase's schema changes: `pnpm --filter @third-code-erp/database generate` → review SQL → apply to Supabase via `psql $DATABASE_URL -f <migration>`. Migration files committed alongside schema changes.

4. **Never break the build.** If a phase's typecheck fails, fix before commit. Use `build-error-resolver` agent if stuck.

5. **Preserve existing patterns.** Always use `auth_tenant_id()`, hash-chained audit log, bigint cents, Drizzle schema-first, server actions with `revalidatePath`.

6. **Migration safety.** New enum values use `ALTER TYPE ADD VALUE`. Schema additions are always nullable initially; backfill via UPDATE; then NOT NULL constraint in a follow-up migration. Never destructive ops without backup.

7. **Role expansion safety.** Add new role enum values via `ALTER TYPE`. Map legacy: `owner→admin`, `estimator→commercial`, `pm→sd_pm_pe`, keep `viewer`. Old values left in enum for safety (PG enums cannot DROP values without table rewrites).

8. **Stop conditions.** Phase complete = typecheck green + tests green + drizzle push success + git push success. Anything else = continue debugging within phase.

---

**End of master plan.**
