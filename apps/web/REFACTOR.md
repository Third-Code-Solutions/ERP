# ABI Ops Platform — Software Product Requirements Document

**Engineering Reference — User Stories, API Specs, Sprint Plan**

**Th/rd Code Solutions Inc.**
**Client:** Actuate Builders Inc.
**Version:** 1.0 | May 2026 | CONFIDENTIAL

| Version | Date | Status | Author |
|---|---|---|---|
| 1.0 | May 2026 | Draft — Pending Client Review | Th/rd Code Solutions |

> *Th/rd Code Solutions Inc. | Confidential | Not for Distribution*

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [Roles & Permissions Matrix](#2-roles--permissions-matrix)
3. [User Stories](#3-user-stories)
4. [API Specification](#4-api-specification)
5. [UI / UX Requirements](#5-ui--ux-requirements)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [Integration Technical Specifications](#7-integration-technical-specifications)
8. [Testing Strategy](#8-testing-strategy)
9. [Sprint Delivery Plan](#9-sprint-delivery-plan)
10. [Open Technical Items](#10-open-technical-items)

---

## 1. Purpose & Scope

This document defines the software product requirements for **ABI Ops** — a unified fit-out operations platform for Actuate Builders Inc. It is written for the engineering team at Th/rd Code Solutions and covers all specifications needed to design, build, test, and deploy the system.

This PRD covers: user stories with acceptance criteria per module, system architecture, API contract, integration specs, non-functional requirements, security model, testing strategy, and a sprint-level delivery plan.

> **Note on Database Schema:** The database schema is intentionally not specified in this document. The implementation team (via Claude Code with Drizzle ORM migrations) will derive the schema directly from the user stories, API contract, and entity relationships described herein. Schema-as-code is the source of truth.

### Companion Document

This Software PRD should be read alongside the **ABI Ops Business PRD (v1.0)** which defines the process context, business rules, SLA framework, and module-level feature descriptions. This document defines the **HOW**; the Business PRD defines the **WHAT** and **WHY**.

---

## 2. Roles & Permissions Matrix

Permissions are enforced at two layers: UI routing (Next.js middleware) and database RLS policies (Supabase). The backend never trusts the frontend for authorization.

| Permission | Admin | Sales | Commercial | Design | SD / PM / PE | Finance | Procurement | Safety | CX |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| View all Accounts | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | — | ✓ |
| Create / Edit Accounts | ✓ | ✓ | — | — | — | — | — | — | — |
| View all Opportunities | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| Create / Edit Opportunities | ✓ | ✓ | — | — | — | — | — | — | — |
| Submit PPRF | ✓ | ✓ | — | — | — | — | — | — | — |
| Submit Site Inspection | ✓ | — | ✓ | — | — | — | — | — | — |
| Upload Design Files | ✓ | — | — | ✓ | — | — | — | — | — |
| Generate BOM | ✓ | — | ✓ | — | — | — | — | — | — |
| Edit BOM Line Items | ✓ | — | ✓ | — | — | — | — | — | — |
| Approve BOM (internal) | ✓ | — | ✓ | — | — | — | — | — | — |
| Dispatch RFQ | ✓ | — | — | — | — | — | ✓ | — | — |
| View / Upload KYC Docs | ✓ | — | — | — | — | ✓ | — | — | — |
| Create AR Code | ✓ | — | — | — | — | ✓ | — | — | — |
| Manage Pre-Con Checklist | ✓ | — | ✓ | — | ✓ | — | — | — | — |
| Create / Approve POs | ✓ | — | ✓ | — | ✓ | — | ✓ | — | — |
| SD Daily/Weekly Tasks | ✓ | — | — | — | ✓ | — | — | ✓ | — |
| Manage Punchlist | ✓ | — | — | — | ✓ | — | — | — | ✓ |
| Manage Warranty Tickets | ✓ | — | — | — | — | — | — | — | ✓ |
| Rate Card Admin | ✓ | — | ✓ | — | — | — | — | — | — |
| User Management | ✓ | — | — | — | — | — | — | — | — |
| System Config / SLAs | ✓ | — | — | — | — | — | — | — | — |

✓ = Full access. — = No access. Partial access rules defined in RLS policies.

---

## 3. User Stories

### M1 — CRM: Accounts & Pipeline

*User stories for Sales, Finance, and Management roles.*

#### US-001 — Create Account with KYC
> As a **Sales rep**, I want to create a new Account with all KYC fields so that Finance can start the evaluation without waiting for a separate email.

**Acceptance Criteria:**
1. Account form captures all required fields: company name, industry, billing address, primary contact, AFS upload (3 files), BIR 2303, VAT cert, top-10 suppliers/clients.
2. On save, Finance receives an in-app notification and email: *"New account [name] pending KYC review."*
3. Account status defaults to **KYC: Pending** until Finance acts.
4. Duplicate detection: warn if email domain or company name matches existing account.

#### US-002 — Manage Opportunity Pipeline
> As a **Sales rep**, I want to create an Opportunity linked to an Account and move it through pipeline stages so that the whole team can see where each deal stands.

**Acceptance Criteria:**
1. Opportunity requires linked Account before saving.
2. Stage changes are timestamped and logged in the activity feed.
3. SLA clock starts automatically on stage change (per SLA config).
4. Kanban board updates in real time without page refresh.
5. Stage regression (moving backwards) requires a reason field.

#### US-003 — Record Financial Evaluation
> As a **Finance officer**, I want to record the financial evaluation result on an Account so that Sales is unblocked to proceed to site visit.

**Acceptance Criteria:**
1. Finance sees a task queue of accounts pending KYC.
2. Can mark: **Approved / Flagged / Rejected** with a notes field.
3. On **Approved**: Sales receives notification; Opportunity stage can advance to Site Survey.
4. On **Flagged/Rejected**: Sales receives notification with Finance notes; stage is locked until resolved.
5. Financial Evaluation Report PDF can be attached.

#### US-004 — Pipeline Dashboard
> As a **Sales manager**, I want a pipeline dashboard showing deal count and PHP value per stage so that I can forecast revenue accurately.

**Acceptance Criteria:**
1. Dashboard shows count and total PHP value per pipeline stage.
2. Conversion rate % shown between each stage pair.
3. Expected close date filter available.
4. Export to CSV/Excel with one click.
5. Revenue forecast chart: expected monthly close value by rep.

#### US-005 — Won → Project Auto-Conversion
> As a **System (auto)**, when an Opportunity is marked **Won**, I want a Project to be created automatically so that no data needs to be re-entered.

**Acceptance Criteria:**
1. Won trigger requires: signed contract file upload + Finance confirmation of down payment receipt.
2. Project record auto-created with: linked Account, all Opportunity data, PPRF, Inspection Report, approved design files, signed BOM.
3. SD-PM assigned receives in-app + email notification.
4. Finance receives notification to create AR code and Project code.
5. Pre-Construction checklist auto-generated (see US-Pre-001).
6. Opportunity stage locked to **Won**; cannot be edited after this point.

---

### M2 — Proposal Workflow

*PPRF, Site Inspection, Design Loop, Contract.*

#### US-006 — Digital PPRF Form
> As a **Sales rep**, I want to fill a digital PPRF inside the Opportunity so that Commercial gets everything they need for the site survey without an email attachment.

**Acceptance Criteria:**
1. PPRF form embedded in the Opportunity detail page under a **"Proposal"** tab.
2. All required fields validated before submission (site address, floor area, landlord contact, as-built availability).
3. On submit: Commercial and Finance receive task notifications.
4. PPRF stored as a versioned record; edits after submission create a new version with diff log.
5. PPRF data is readable by the BOM Engine for scope pre-fill.

#### US-007 — Site Inspection Report
> As a **Commercial officer**, I want to submit a Site Inspection Report inside the platform so that Design is notified immediately and can start layouts.

**Acceptance Criteria:**
1. Inspection form accessible from the Opportunity; requires PPRF to be submitted first.
2. Photo upload: up to 30 images, max 10MB each, auto-compressed to 2MB for storage.
3. RFI items can be flagged inline and generate a separate RFI log.
4. On submit: Design receives notification; Design stage SLA clock starts.
5. Report PDF auto-generated on submit and stored in Document Vault.

#### US-008 — Design Upload & Approval
> As a **Designer**, I want to upload layout files and mark them as ready for client presentation so that Sales knows when to schedule the client meeting.

**Acceptance Criteria:**
1. File upload component supports PDF, PNG, JPG, DWG; max 50MB per file.
2. Uploader sets file type: **Initial Layout / Final Rendering / Animation / Revised**.
3. **"Mark as Ready for Presentation"** button sends notification to Sales.
4. Version history visible: v1, v2, v3 with upload timestamps.
5. Approved files are locked (read-only) once client signs off.

#### US-009 — Client Change Request Log
> As a **Sales rep**, I want to log client feedback and change requests so that design revisions are tracked without a separate document.

**Acceptance Criteria:**
1. Change Request form on the Opportunity: description, requested by (client name), date, files affected, priority (**Minor/Major**).
2. Each change request creates a Change Log entry linked to the design version it affects.
3. Design is notified of each new change request.
4. **"Approved without changes"** button locks the current design version and triggers BOM generation task.

---

### M3 — BOM Engine

*Import, generation, pricing, approval.*

#### US-010 — Togal.ai Import & Auto-Generation
> As a **Commercial officer**, I want to import a Togal.ai takeoff export and have the BOM auto-generated so that I don't spend 5–7 days building it manually.

**Acceptance Criteria:**
1. Upload accepts CSV and XLSX; max file size 20MB.
2. Parser validates required columns are present; shows error list if columns are missing or misnamed.
3. Quantity mapping applied automatically using current mapping table config.
4. Wastage % applied per material item settings.
5. Preferred supplier pricing applied from rate card.
6. Draft BOM created in status **Pending Review** within 30 seconds of upload.
7. If any material item has no rate card entry, it is flagged in red for manual price entry.

#### US-011 — BOM Review & Edit
> As a **Commercial officer**, I want to review and edit the auto-generated BOM before submitting it for client approval so that I can correct any errors.

**Acceptance Criteria:**
1. BOM table shows: item code, description, qty, unit, unit price, supplier, total — all editable inline.
2. Row-level actions: delete row, duplicate row, override supplier (dropdown of active suppliers).
3. **Add row** opens item picker with search across material item database.
4. Quantity override requires a justification text field (max 200 chars) — logged in audit trail.
5. Price override shows delta vs. preferred rate card price.
6. BOE total updates in real time as edits are made.
7. Variance alert shown if BOE total is >15% above or below the Opportunity forecast cost.
8. **"Submit for Client Approval"** button disabled until all red-flagged items are resolved.

#### US-012 — Client BOM Portal & E-Sign
> As a **Client (external)**, I want to review and sign the BOM via a secure link so that I can approve the project scope without needing to log in to the platform.

**Acceptance Criteria:**
1. Client portal accessible via one-time token URL (48-hour expiry).
2. Portal shows: project summary, BOM by category (collapsed by default, expandable), milestone schedule, validity date.
3. E-sign via DocuSeal: client types name, date auto-filled, signs.
4. On sign: Signed BOM PDF generated; stored in Document Vault; Sales and Commercial notified.
5. Portal shows **"Already Signed"** if accessed again after signing.
6. Token expiry shows: *"This link has expired. Please contact your sales rep."*

#### US-013 — RFQ Auto-Dispatch
> As a **Procurement officer**, I want to receive auto-generated RFQ tasks when a BOM is approved so that I can start supplier quotes immediately.

**Acceptance Criteria:**
1. RFQ task created for each line item not flagged as **"contracted rate."**
2. Task shows: item description, qty, unit, current preferred rate as reference.
3. Procurement logs received quote(s) per item: supplier name, price, lead time, validity date.
4. Price comparison table auto-built from received quotes.
5. On completion: Commercial receives notification that quotes are ready for BOM price review.

---

### M4 — Pre-Construction Hub

*Checklist, Documents, Permits, POs.*

#### US-Pre-001 — Auto-Generated Pre-Con Checklist
> As a **System (auto)**, when a Project is created, I want a Pre-Construction checklist auto-generated so that nothing is missed in the handoff from Commercial to SD.

**Acceptance Criteria:**
1. 12-item checklist created from template (configurable in Admin).
2. Each item has: title, owner role, SLA days, depends-on field, status (**Not Started / In Progress / Blocked / Done**).
3. SLA clock for each item starts when its depends-on item is marked **Done**.
4. **Blocked** status requires a blocker description.
5. **Done** requires a file attachment or a confirmation checkbox depending on item type.

#### US-Pre-002 — Permit Tracker
> As an **SD Project Manager**, I want to track LGU building permit status with document uploads so that I have a clear record of every submission and approval.

**Acceptance Criteria:**
1. Permit tracker sub-module within the Pre-Con Hub.
2. Permit types: **Building Admin Vetting, LGU Building Permit, DOLE permit** (if required).
3. Each permit has: status, submission date, expected approval date, file attachments per submission.
4. Status options: **Not Started / Submitted / Additional Docs Required / Under Review / Approved**.
5. Escalation alert sent to PM and GM if permit status has not been updated in 7 business days.
6. On **Approved**: linked checklist item auto-marked Done.

#### US-Pre-003 — Purchase Order Generation
> As a **Procurement / SCM**, I want to generate Purchase Orders from the approved BOM so that supplier orders are placed accurately and quickly.

**Acceptance Criteria:**
1. PO generation triggered from the BOM module after BOM client approval.
2. PO auto-populated: supplier details, line items, quantities, unit prices from BOM.
3. PO grouped by supplier (one PO per supplier).
4. PO approval workflow: **PM recommends → Commercial approves → SCM issues**.
5. Approved PO PDF generated and stored in Document Vault.
6. Supplier receives PO via email (generated from Resend with PO PDF attached).
7. PO status tracked: **Draft / Pending Approval / Issued / Partially Delivered / Fully Delivered**.

---

### M5 — Construction Cadence

*Daily/Weekly tasks, VOs, Progress.*

#### US-Con-001 — Daily Task View
> As a **Site Support Staff**, I want to see my daily tasks for all active projects in one view so that I know exactly what to do each day.

**Acceptance Criteria:**
1. **My Tasks** view shows all tasks due today, grouped by project.
2. Tasks auto-generated from cadence template per role per project stage.
3. Task completion: single tap/click to mark done; optional notes field.
4. Overdue tasks (past due date) shown in red with count badge on nav icon.
5. Daily task completion % visible to PM in project dashboard.

#### US-Con-002 — Variation Orders
> As a **Project Manager**, I want to create and manage Variation Orders so that scope changes are tracked, priced, and approved before work proceeds.

**Acceptance Criteria:**
1. VO creation: description, change type (**Client Initiated / Site Condition / Design Error**), cost impact (PHP), time impact (days).
2. VO routed for Commercial pricing review before going to client.
3. Client e-signs VO via same portal mechanism as BOM approval.
4. Approved VO: cost added to project cost tracker; schedule extended if time impact > 0.
5. VO log shows: VO number, description, amount, status, cumulative total vs. original BOM.
6. VO count and cumulative amount visible on project dashboard.

#### US-Con-003 — Weekly Progress & S-Curve
> As a **Project Engineer**, I want to update construction progress weekly so that the S-curve stays current and billing milestones are tracked.

**Acceptance Criteria:**
1. Weekly progress update: % complete per WBS/category (**Civil, Electrical, MEP, Finishes**).
2. Planned % pulled from Level 1 Master Schedule (imported at Pre-Con phase).
3. S-curve chart auto-updates on save: planned line vs. actual line.
4. Schedule variance calculated: days ahead / behind.
5. Milestone completion: PE marks milestone done → triggers billing workflow notification to PM.

---

### M6 — Post-Construction

*Punchlist, Turnover, COC.*

#### US-Post-001 — Punchlist Management
> As a **Project Manager / PE**, I want to create and assign punchlist items with photos so that all defects are tracked to closure.

**Acceptance Criteria:**
1. Punchlist item fields: description, location (room/zone), trade, photo (required, up to 5 per item), priority, due date, assigned to (subcon/team).
2. Status workflow: **Open → In Progress → For Inspection → Closed**.
3. **Closed** requires PE sign-off (separate action from status change).
4. PM dashboard shows punchlist % complete by trade.
5. Auto-notification to assigned party when item is created or due date is approaching (3 days before).
6. CX notified when punchlist reaches 100% closed.

#### US-Post-002 — Turnover Package & COC
> As a **CX Manager**, I want the Turnover Package auto-compiled when punchlist hits 100% so that handover is not delayed by manual document collection.

**Acceptance Criteria:**
1. System checks for required documents in Document Vault: as-built drawings, O&M manuals, warranty certificates, keys log.
2. Missing document checklist shown to PM if any required docs are absent.
3. On all docs confirmed present: COC draft auto-generated from template with project details pre-filled.
4. PM reviews and sends COC to client for e-sign via DocuSeal.
5. On COC signing: Warranty period starts; M7 CX onboarding triggered automatically.

---

### M7 — Post-Handover & Warranty

*Tickets, NPS, CX.*

#### US-WA-001 — Client Warranty Portal
> As a **Client (external)**, I want to submit a warranty support ticket via a simple portal so that I don't need to email a support address.

**Acceptance Criteria:**
1. Client portal accessible from onboarding email link; no login required (token-based).
2. Ticket form: issue category (dropdown), description (text), photos (up to 5), location within site.
3. Submission confirmation email sent to client immediately.
4. CX team sees new ticket in their queue within seconds.
5. Client receives acknowledgment email from CX within 24 hours (SLA enforced by platform).

#### US-WA-002 — CX Ticket Management
> As a **CX Support officer**, I want to manage warranty tickets with a clear workflow so that every ticket is resolved within SLA.

**Acceptance Criteria:**
1. Ticket queue shows: all open tickets sorted by age; overdue tickets flagged red.
2. Ticket detail: full history thread, all communications logged, file attachments.
3. Internal notes (not visible to client) for coordination with subcons/vendors.
4. Schedule repair: sends templated email to client with proposed date; client confirms in portal.
5. Close ticket: requires Service Report upload; client acknowledgment auto-requested via email.
6. SLA breach alert: sent to CX Manager if 24-hr acknowledge or 48-hr schedule SLA is missed.

#### US-WA-003 — Auto CNPS Survey
> As a **System (auto)**, after a warranty ticket is closed, I want to send a CNPS survey automatically so that CX quality is measured consistently.

**Acceptance Criteria:**
1. CNPS survey sent 48 hours after ticket closure confirmation.
2. Survey: 1-question NPS (0–10 scale) + optional comment field; delivered via email with one-click rating.
3. Response stored against ticket and rolled into Account CNPS score (rolling average).
4. Score < 7 triggers alert to CX Manager with ticket context.
5. Survey results visible in CX dashboard: score distribution, trend over time, low-score ticket list.

---

## 4. API Specification

The platform exposes a REST API consumed by the Next.js frontend. Supabase auto-generates REST endpoints for all tables (via PostgREST), and the FastAPI BOM Engine provides additional endpoints for import processing. All API calls require a valid JWT (Supabase session token) in the `Authorization` header **except** the client BOM portal and client ticket portal (token-based).

### 4.1 Authentication

```
POST   /auth/sign-in       -- email + password; returns JWT + refresh token
POST   /auth/sign-out      -- invalidates session
POST   /auth/refresh       -- refreshes JWT using refresh token
GET    /auth/me            -- returns current user profile + role
```

### 4.2 Accounts & Contacts

```
GET    /accounts                    -- list (paginated, filtered by name/industry/kyc_status)
POST   /accounts                    -- create account
GET    /accounts/:id                -- get account with contacts, projects, tickets summary
PATCH  /accounts/:id                -- update account fields
PATCH  /accounts/:id/kyc            -- Finance: update kyc_status + financial_status

GET    /accounts/:id/contacts       -- list contacts
POST   /accounts/:id/contacts       -- add contact
PATCH  /contacts/:id                -- update contact
DELETE /contacts/:id                -- soft delete
```

### 4.3 Opportunities & Pipeline

```
GET    /opportunities               -- list (filtered by stage, assigned_to, account_id)
POST   /opportunities               -- create opportunity
GET    /opportunities/:id           -- get full detail + related records
PATCH  /opportunities/:id           -- update fields
PATCH  /opportunities/:id/stage     -- advance/change stage; validates transition rules
POST   /opportunities/:id/won       -- trigger Won conversion; creates Project

GET    /pipeline/summary            -- stage counts + PHP totals for dashboard
GET    /pipeline/forecast           -- monthly close forecast by rep
```

### 4.4 BOM Engine (FastAPI)

```
POST   /bom/import                  -- upload Togal CSV/XLSX; returns import_id
  Body: multipart/form-data { file, opportunity_id }
  Response: { import_id, row_count, mapped_count, unmapped_items[] }

POST   /bom/generate                -- generate BOM draft from import_id
  Body: { import_id, opportunity_id }
  Response: { bom_id, status, total_amount, flagged_count }

GET    /bom/:id                     -- get BOM with all line items
PATCH  /bom/:id/line-items          -- bulk update line items (Commercial review)
POST   /bom/:id/submit              -- submit for client approval; generates token + portal URL

GET    /bom/portal/:token           -- public endpoint: returns BOM for client portal
POST   /bom/portal/:token/sign      -- public endpoint: records client e-sign via DocuSeal

GET    /bom/:id/export/pdf          -- generate and return signed BOM PDF

GET    /rate-cards                  -- list material items with preferred rates
POST   /rate-cards                  -- create rate card entry
PATCH  /rate-cards/:id              -- update price

GET    /mapping-config              -- get Togal column → material item mapping
PATCH  /mapping-config              -- update mapping config
```

### 4.5 Projects & Checklist

```
GET    /projects                    -- list (filtered by stage, pm_id)
GET    /projects/:id                -- get project with checklist, docs, team
PATCH  /projects/:id                -- update project fields

GET    /projects/:id/checklist      -- get all checklist items
PATCH  /checklist-items/:id         -- update status / mark done

GET    /projects/:id/permits        -- get permit tracker items
PATCH  /permits/:id                 -- update permit status + upload docs

POST   /projects/:id/pos            -- generate PO(s) from approved BOM
GET    /projects/:id/pos            -- list POs
PATCH  /pos/:id/approve             -- Commercial approves PO
PATCH  /pos/:id/issue               -- SCM issues PO; triggers supplier email
```

### 4.6 Tickets (Warranty)

```
POST   /tickets/portal              -- public: client submits ticket (token auth)
GET    /tickets                     -- CX queue (filtered by status, project_id)
GET    /tickets/:id                 -- ticket detail with message thread
POST   /tickets/:id/messages        -- add message (internal or client-visible)
PATCH  /tickets/:id/status          -- update status; triggers SLA checks
POST   /tickets/:id/close           -- close ticket; triggers CNPS survey dispatch

GET    /cnps/summary                -- CX dashboard: score distribution, trend
```

### 4.7 Notifications & SLA

```
GET    /notifications               -- current user's unread notifications
PATCH  /notifications/:id/read      -- mark as read

GET    /sla/health                  -- SLA health per project (traffic-light summary)
GET    /sla/breaches                -- list of current SLA breaches across all projects
```

---

## 5. UI / UX Requirements

### 5.1 Design System

| Token | Value | Usage |
|---|---|---|
| Primary Color | `#0F2D4A` (Navy) | Nav, headings, primary buttons |
| Accent Color | `#E07B2A` (Gold) | CTAs, highlights, active states |
| Surface | `#FFFFFF` / `#F8FAFC` | Page backgrounds, cards |
| Border | `#CBD5E1` | Table borders, dividers |
| Font | Inter (Google Fonts) | All text; fallback: Arial |
| Base Font Size | 14px (body), 16px (input) | Adjust per context |
| Border Radius | 8px (cards), 6px (buttons), 4px (inputs) | Consistent rounded corners |
| Shadow | `0 1px 3px rgba(0,0,0,0.1)` | Card elevation only |

### 5.2 Navigation

Left sidebar navigation, collapsible. Role-scoped: users only see modules relevant to their role. Nav items with unread counts (tasks overdue, SLA breaches, new notifications) show badge numbers.

| Nav Item | Roles Who See It | Badge Source |
|---|---|---|
| Dashboard | All | Overdue tasks count |
| CRM / Pipeline | Sales, Admin, Management | Overdue SLA opportunities |
| Proposals | Sales, Commercial, Design, Finance | Pending approval items |
| BOM Engine | Commercial, Procurement | Flagged items, pending RFQs |
| Projects | SD, Commercial, Finance, Design | Active project count |
| Pre-Construction | SD, Commercial, Procurement | Overdue checklist items |
| Construction | SD, Safety | Overdue tasks today |
| Post-Construction | SD, CX | Open punchlist items |
| Warranty / CX | CX | Open ticket count |
| Admin | Admin only | — |

### 5.3 Key Screen Requirements

**Pipeline Board**
- Kanban columns per stage; drag-and-drop stage change with validation
- List toggle view for bulk filtering
- Quick-add opportunity button in each column header
- Card shows: client name, forecast cost (PHP), assigned rep, days in stage, SLA status dot

**BOM Review Screen**
- Full-width data table; sticky header and category subtotal rows
- Inline editing: click any cell to edit; Tab to next editable cell
- Unsaved changes banner with **Save** and **Discard** buttons
- Side panel: supplier switcher showing all active rates for selected item
- Bottom bar: running total, variance vs. forecast, flagged item count

**Project Dashboard**
- SLA health traffic lights for each stage (Pre-Con, Construction, Post-Con)
- Key dates: NTP, target handover, actual progress %
- Document Vault quick-access by category
- Active tasks widget: today's pending tasks by role
- VO tracker: count and cumulative amount vs. original BOM

### 5.4 Responsiveness

All screens must be fully functional on tablet (768px+). Mobile (375px+) must support: viewing dashboards, completing daily tasks, uploading photos to punchlist/inspection, and reading notifications. BOM generation and full table editing are desktop-only features.

### 5.5 Accessibility

- WCAG 2.1 AA compliance for all interactive elements
- All form inputs have associated labels
- Color is never the only indicator of status — always paired with text or icon
- Keyboard navigation for all primary workflows

---

## 6. Non-Functional Requirements

### 6.1 Performance

| Metric | Target | Notes |
|---|---|---|
| Page load (initial) | < 2 seconds (P95) | Vercel Edge CDN; SSR for dashboard pages |
| API response time | < 500ms (P95) | Supabase PostgREST; indexed queries |
| BOM generation (auto) | < 30 seconds | FastAPI; 500-row Togal import |
| File upload (50MB) | < 60 seconds | Supabase Storage; direct-to-storage upload |
| PDF generation | < 10 seconds | Server-side; cached for repeat requests |
| Concurrent users | 50 simultaneous | Initial scale target; Vercel serverless handles bursts |

### 6.2 Availability & Reliability

- **Uptime target:** 99.5% (excludes scheduled maintenance)
- **Scheduled maintenance windows:** Sundays 02:00–04:00 PHT
- **Database backups:** daily automated via Supabase, retained 30 days
- **File storage:** Supabase Storage with redundancy; versioned document vault
- **Error tracking:** Sentry alerts to engineering Slack channel for P1 errors within 5 minutes

### 6.3 Security

- **Authentication:** Supabase Auth with JWT; sessions expire after 8 hours of inactivity
- **Authorization:** Supabase RLS enforced at database layer — backend cannot be bypassed
- **Transport:** HTTPS enforced on all endpoints; HSTS enabled
- **Client portal:** one-time token links; 48-hour expiry; tokens hashed in DB
- **File access:** signed URLs only; expire after 1 hour; no public bucket
- **PII handling:** client KYC documents stored encrypted at rest (Supabase AES-256)
- **Audit log:** all write operations on sensitive tables (BOMs, contracts, accounts) logged with user ID, timestamp, before/after values
- **OWASP Top 10:** input sanitization, parameterized queries via Drizzle, CSRF protection via SameSite cookies
- **Data residency:** Supabase Singapore region (closest to PH with compliance posture)

### 6.4 Scalability

- **Database:** Supabase Pro plan; connection pooling via PgBouncer
- **Frontend:** Vercel auto-scales; no configuration needed
- **BOM Engine:** Railway scales horizontally; stateless FastAPI workers
- **File storage:** Supabase Storage scales without configuration
- Designed for **500 concurrent projects** and **10,000 stored documents** in v1.

---

## 7. Integration Technical Specifications

### 7.1 Togal.ai Import Parser

The FastAPI BOM Engine handles Togal.ai CSV/XLSX imports. Validated column expectations:

```python
# Expected Togal export columns (configurable via mapping-config API)
Required columns:
  - "Element Type" or "Category"  : string
  - "Quantity"                    : float
  - "Unit"                        : string (sqm, lm, pcs, etc.)

Optional columns (used if present):
  - "Level" / "Floor"             : string — used for location tagging
  - "Room" / "Zone"               : string
  - "Notes"                       : string

Parser behavior:
  1. Read file using pandas (CSV) or openpyxl (XLSX)
  2. Normalize column names (strip whitespace, lowercase)
  3. Validate required columns present — return 400 with missing cols if not
  4. For each row: look up mapping config by Element Type
  5. If no mapping found: add to unmapped_items[] in response
  6. Apply wastage % from material_items config
  7. Insert rows to BOM line items with is_flagged=true if no rate found
```

### 7.2 DocuSeal E-Sign Integration

DocuSeal is self-hosted on Railway. Integration via REST API:

```
POST /api/v1/submissions
  -- Creates a signing submission from a pre-built template
  Body: { template_id, submitters: [{ email, name, role }], send_email: false }
  Response: { submission_id, slug (portal URL) }

# ABI Ops embeds the DocuSeal slug in the client BOM portal
# On signing, DocuSeal POSTs to our webhook:

POST /webhooks/docuseal (our endpoint)
  Body: { event: "submission.completed", submission_id, documents: [{ url }] }
  Action: download signed PDF, store in Supabase Storage,
          update BOM status = "signed", notify Sales + Commercial
```

### 7.3 Resend Email

All transactional emails use React Email templates compiled server-side. Key templates:

| Template ID | Trigger | Recipients |
|---|---|---|
| `kyc-request` | Account created by Sales | Finance (KYC queue) |
| `kyc-result` | Finance sets KYC status | Sales (assigned rep) |
| `design-ready` | Designer marks files ready | Sales |
| `bom-portal-link` | BOM submitted for client approval | Client primary contact |
| `bom-signed` | Client e-signs BOM | Sales + Commercial |
| `rfq-dispatch` | BOM approved internally | Procurement |
| `po-issued` | PO status = Issued | Supplier (with PDF attachment) |
| `ticket-ack` | CX acknowledges warranty ticket | Client |
| `ticket-schedule` | CX sends repair schedule | Client |
| `cnps-survey` | Ticket closed | Client (48-hr delay) |
| `sla-breach` | SLA timer exceeds threshold | BU head of responsible role |

### 7.4 Supabase Edge Functions (Background Jobs)

```
# Runs on cron schedule via Supabase Edge Functions

sla-checker (every 30 minutes):
  - Query all active SLA logs where status != breached
  - For each: calculate elapsed business days
  - At 80% of SLA: send at-risk notification
  - At 100%: mark breached, send breach notification to BU head

permit-staleness-checker (daily at 08:00 PHT):
  - Query permits where status NOT IN (approved, rejected)
  - If last_updated > 7 business days ago: send escalation alert

cnps-survey-sender (every hour):
  - Query tickets where status=closed AND closed_at <= now()-48h
    AND cnps_score IS NULL AND survey_sent = false
  - Send CNPS email; set survey_sent = true
```

---

## 8. Testing Strategy

### 8.1 Testing Levels

| Level | Tool | Coverage Target | Who Runs It |
|---|---|---|---|
| Unit Tests | Vitest (frontend), pytest (FastAPI) | 80% line coverage on business logic | Engineering (automated) |
| Integration Tests | Playwright + Supabase test DB | All user stories: happy path + key error paths | Engineering (automated) |
| API Tests | pytest + httpx | All API endpoints; auth checks; RLS enforcement | Engineering (automated) |
| UAT | Manual + test scripts | All modules; all roles; SLA enforcement | ABI Ops team (client) |
| Performance Tests | k6 | BOM generation, concurrent pipeline board load | Engineering (pre-launch) |
| Security Scan | OWASP ZAP | OWASP Top 10 surface scan | Engineering (pre-launch) |

### 8.2 Definition of Done (per Story)

- Code reviewed and approved by at least one other engineer
- Unit tests written and passing (where applicable)
- Integration test covering happy path written and passing
- No new Sentry errors in staging after deployment
- Acceptance criteria from user story verified in staging environment
- Feature accessible only to correct roles (RLS tested)
- Mobile responsiveness verified on 768px width

### 8.3 UAT Plan

UAT is conducted per phase before production deployment. ABI Ops team runs through role-specific test scripts in the staging environment. UAT sign-off per phase is required before production release.

| Phase | UAT Duration | UAT Participants | Sign-off Owner |
|---|---|---|---|
| Phase 1 (CRM + BOM) | 5 business days | Sales rep, Commercial officer, Finance officer, Procurement | Commercial Lead + Sales Head |
| Phase 2 (Pre-Con + Contract) | 4 business days | SD-PM, Commercial, Finance, Design | SD Head |
| Phase 3 (Construction + VO) | 5 business days | PM, PE, Safety Officer, Commercial | SD Head + GM |
| Phase 4 (Warranty + Analytics) | 3 business days | CX Manager, CX Support, Management | CX Head + GM |

---

## 9. Sprint Delivery Plan

Sprints are 2-week cycles. Total Phase 1 estimate: **10 weeks (5 sprints)**. Full platform: **~32 weeks across 4 phases**. Estimates assume 1 full-stack lead (Kurt) + support from Th/rd Code team.

### Phase 1 — CRM Foundation + BOM Engine (Weeks 1–10)

#### Sprint 1 — Weeks 1–2: Project Setup + CRM Core
- Repo setup, CI/CD pipeline (GitHub Actions → Vercel + Railway)
- Supabase project init: schema migration for `accounts`, `contacts`, `users`
- Auth: login, role-based redirect, session management
- Account CRUD: create, list (paginated), detail view
- Contact CRUD within Account
- RLS policies: accounts and contacts scoped by role
- Basic nav shell with role-scoped menu items

#### Sprint 2 — Weeks 3–4: Pipeline + Opportunity Management
- Opportunity schema + API endpoints
- Pipeline Kanban board (all 8 stages)
- Stage change with validation + SLA clock trigger
- Activity feed on Opportunity detail
- KYC status update flow (Finance role)
- Pipeline dashboard: count + PHP value per stage
- Won trigger: Project auto-creation + notification dispatch

#### Sprint 3 — Weeks 5–6: PPRF + Site Inspection + Design Loop
- Digital PPRF form (embedded in Opportunity)
- PPRF versioning + diff log
- Site Inspection Report form + photo upload (30 images)
- Inspection PDF auto-generation (stored in Document Vault)
- Design file upload component (version history)
- Change Request log within Opportunity
- Design approval lock + BOM generation task trigger

#### Sprint 4 — Weeks 7–8: BOM Engine + Rate Cards
- FastAPI BOM Engine service setup on Railway
- Togal.ai CSV/XLSX parser with column validation
- Material item database CRUD (Admin)
- Supplier rate card database CRUD (Admin)
- Quantity mapping config UI (Admin)
- BOM auto-generation from Togal import
- Commercial BOM review screen (inline editing, supplier switcher)
- BOM flagged items resolution workflow

#### Sprint 5 — Weeks 9–10: BOM Approval + RFQ + Phase 1 UAT
- Client BOM portal (one-time token, public route)
- DocuSeal e-sign integration
- Signed BOM PDF generation + Document Vault storage
- Procurement RFQ auto-dispatch + quote logging
- Price comparison table
- Resend email integration (all Phase 1 templates)
- SLA engine: Proposal Stage SLA checks (Edge Function)
- Phase 1 UAT + bug fixes + production release

---

### Phase 2 — Pre-Construction + Contract (Weeks 11–18)

#### Sprint 6 — Weeks 11–12: Contract Module + Pre-Con Setup
- Contract template generation from signed BOM
- Contract e-sign via DocuSeal
- Pre-Con checklist schema + auto-creation on Won
- Checklist UI: status updates, SLA tracking, blocker flags
- Document Vault: full UI with category tabs, versioning, search
- Finance AR code creation workflow

#### Sprint 7 — Weeks 13–14: Permits + POs + Phase 2 UAT
- Permit Tracker module
- PO generation from approved BOM (grouped by supplier)
- PO approval workflow (PM → Commercial → SCM)
- Supplier email dispatch on PO issue (with PDF)
- CARI request tracking
- Allowable Budget submission and approval
- SLA engine: Pre-Con SLA checks
- Phase 2 UAT + bug fixes + production release

---

### Phase 3 — Construction + Post-Construction (Weeks 19–28)

#### Sprint 8 — Weeks 19–20: SD Cadence + Daily Tasks
- Cadence task engine: auto-generate role tasks per project per day
- My Tasks view (role-scoped, project-grouped)
- Task completion + notes
- Daily site report form
- Safety module: toolbox meeting log, incident report

#### Sprint 9 — Weeks 21–22: Progress + VOs + Schedule
- Level 1 Master Schedule: import (CSV) + Gantt view
- Weekly progress update form (% by category)
- S-curve chart (planned vs. actual)
- Variation Order creation and approval workflow
- VO e-sign via DocuSeal
- VO tracker on project dashboard

#### Sprint 10 — Weeks 23–24: Punchlist + Turnover + Phase 3 UAT
- Punchlist module (create, assign, photo upload, PE sign-off)
- Punchlist completion dashboard per trade
- Turnover package auto-compilation check
- COC generation + client e-sign
- P&L closeout workflow
- Project archive
- Phase 3 UAT + bug fixes + production release

---

### Phase 4 — Warranty + Analytics (Weeks 29–34)

#### Sprint 11 — Weeks 29–30: Warranty Ticket System
- Client warranty portal (token-based, no login)
- Ticket creation + category + photo upload
- CX ticket queue with SLA enforcement
- Ticket message thread (internal + client-visible)
- Ticket close + Service Report upload
- CX SLA breach alerts (24hr ack, 48hr schedule)

#### Sprint 12 — Weeks 31–34: NPS + Analytics + Final UAT
- CNPS auto-survey (Edge Function + Resend)
- NPS survey on COC signing
- CX dashboard: score distribution, trend, low-score alerts
- Analytics: project performance (cycle times, SLA adherence)
- Analytics: sales funnel metrics (conversion rates)
- Analytics: client health scores per Account
- SMS notifications via Semaphore (SLA breaches, client schedules)
- Mobile responsiveness pass across all screens
- Performance testing (k6) + security scan (OWASP ZAP)
- Full platform UAT + production release

---

## 10. Open Technical Items

These items require decisions or external input before implementation can begin. Each blocks specific sprint work as noted.

| # | Item | Blocks | Owner | Due |
|---|---|---|---|---|
| T01 | Confirm exact Togal.ai export column names and format — needed to finalize import parser | Sprint 4 | Kurt + Togal account holder | Before Sprint 4 |
| T02 | DocuSeal: self-host on Railway (recommended) vs. DocuSeal Cloud — cost and setup trade-off | Sprint 5 | Masshi / Kurt | Before Sprint 4 |
| T03 | Supabase region selection: confirm SG (`ap-southeast-1`) is acceptable for data residency | Infra setup | Masshi | Before Sprint 1 |
| T04 | Initial rate card data: Commercial team must populate Supplier Rate Card DB before Phase 1 UAT | Sprint 5 UAT | Commercial Lead (ABI) | Before Week 9 |
| T05 | Checklist item template: get final list of Pre-Con checklist items and SLA days from SD Lead | Sprint 6 | SD Lead (ABI) | Before Sprint 6 |
| T06 | Contract template: obtain ABI's standard contract Word template for digitization | Sprint 6 | Sales Head (ABI) | Before Sprint 6 |
| T07 | Resend domain verification: set up SPF/DKIM for `notifications@abiops.ph` (or existing ABI domain) | Sprint 5 | Kurt | Before Sprint 5 |
| T08 | DocuSeal template design: BOM signing template and Contract template to be designed in DocuSeal admin before integration | Sprint 5 | Kurt | Before Sprint 5 |
| T09 | Semaphore SMS: confirm API key availability and sender name registration for PH SMS | Sprint 12 | Kurt | Before Sprint 12 |
| T10 | Togal.ai webhook: confirm if Togal API supports outbound webhooks for auto-import trigger | Future | Kurt + Togal | Post-launch |

---

**— END OF DOCUMENT —**

*ABI Ops Software PRD v1.0 | Th/rd Code Solutions Inc. | Confidential*