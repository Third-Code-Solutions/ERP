# BUILD OPS PRD v1.4

> Repository execution authority, reconciled with current source and provider evidence on 2026-08-14.
> Historical PDF exports remain reference material; they do not override this file, the current code,
> migration ledger, or timestamped release evidence.
BUILD OPS — Refactor PRD (Execution Edition)
Construction ERP for Actuate Builders Inc. (ABI) · product brand ABI OPS.
Version 1.4 · 14 August 2026 · Supersedes v1.0–v1.3
Execution: Codex desktop/CLI or any equivalent engineering agent. Tool-agnostic in substance.
Companion files:
In the repo Purpose
AGENTS.md (root) Auto-loaded by Codex every session. Lean guardrails only
docs/PRD.md (this file) Implementation authority. Opened on demand
docs/PROMPTS.md Copy-paste prompts, one per work order, plus drift-recovery
fixtures/abi/ (gitignored)Real ABI Excel templates and Togal exports
BUILD_OPS_Blueprint.md — the why: evidence, audit, contradictions, reasoning record.
Keep this out of the repo; it contains competitor analysis, an audit of the current build, and
a named error in a client-facing document.
What changed in v1.4: current frontend, Core API, routing, storage, hosting and deployment
surfaces are recorded so the refactor does not erase working product behavior. Local repository
edits, tests, documentation and reversible build work are executable from the requesting task
without an interactive go-ahead. Hosted data, provider configuration and irreversible actions
still require exact targets, rollback evidence and a release gate.
What changed in v1.1: every work order is now a self-contained implementation ticket
(Context / Do / Do NOT / Files / Acceptance / Rollback), so a session can execute one ticket
without reading the whole document. A pre-flight checklist (§0.3) and a drift-recovery
protocol (§0.4) were added. No architectural decision changed.
0. How to use this document
This PRD is written to be seeded into a fresh coding-agent session with no other
context. Everything needed to act is contained here. The reference toolchain is OpenAI
Codex; the document is tool-agnostic and works with any agent that reads a project
instruction file.
Recommended opening prompt:

You are a senior engineer working on BUILD OPS, a construction ERP for Actuate Builders
Inc. Read docs/PRD.md in full before writing any code. It contains confirmed schema
facts, locked architectural decisions, and a numbered work-order sequence. Do not
propose rebuilding anything marked LOCKED. Do not introduce entities the PRD explicitly
forbids. Start with Work Order WO-01, record the migration plan and rollback, then
execute the smallest verified slice without waiting for a conversational approval.
The full prompt set lives in docs/PROMPTS.md.
Rules for any session working from this PRD:
1. This is a refactor, not a rewrite. The existing codebase is sound where it matters (§2).
Additive migrations only. No downstream foreign key is re-pointed at any stage.
2. Do not create a second scope model. The legacy `scope_items` table already exists in the
initial schema and remains a compatibility input for CAD evidence. New refactor work uses the
existing `bom_line_items` spine; no new `scope_items` table or `scope_item_id` column may be
introduced.
3. Work orders are numbered and ordered. WO-01 → WO-18. Do not skip forward; later
orders assume earlier invariants hold.
4. Every work order has explicit acceptance criteria. A work order is not done until its
criteria pass as automated tests.
5. Where this PRD says [BLOCKED: O-n], the work order cannot be completed without an
answer from ABI. Build to the labelled default, mark it configurable, and flag it.
6. All money is BIGINT centavos. All percentages are integer basis points. Never
introduce a float into a monetary path.
7. Existing production-facing features stay available unless a replacement path has
equivalent automated, browser and release evidence. Documentation drift is fixed by adding
confirmed current behavior and removing stale claims, not by deleting working routes.
8. A work order may proceed locally when its acceptance criteria are testable. Missing ABI
templates, policy decisions or provider evidence become explicit BLOCKED boundaries; they do
not trigger a silent substitute or an indefinite wait.
0.1 Two ways to run this
Codex CLI (recommended for WO-01 → WO-18). Commit this PRD as docs/PRD.md and
commit AGENTS.md at the repo root. Codex reads AGENTS.md automatically at session start
and builds its instruction chain once per session; this PRD is opened on demand when a
work order touches schema, pricing or migrations.
Start each session with the kickoff prompt from docs/PROMPTS.md, then paste the single
matching work-order prompt. One work order per session — context stays clean and the
agent cannot wander into WO-12 while doing WO-04.
A chat assistant (for design review, migration review, and the D-1/D-2 conversations
with Commercial). Attach this PRD plus the relevant screenshots. Good for reasoning and
for arguing a decision through; do not use it to generate large migrations you then paste in
blind.
Execution details that matter for this refactor:

1. Do not put this PRD into AGENTS.md. Codex stops adding project guidance once the
concatenated instruction files reach project_doc_max_bytes (32 KiB by default), and
files discovered later are silently dropped. This PRD alone would exceed that. Keep
AGENTS.md lean and reference docs/PRD.md per work order.
2. Markdown is guidance, not enforcement. Do not use it as a substitute for bounded target
checks, migration dry-runs, backups, rollback plans or provider identity checks. Structural
migrations and production releases must fail closed when their evidence is missing; local
implementation and verification must not pause for a conversational approval.
3. Editing AGENTS.md mid-session does nothing. The instruction chain is built once at
session start. Restart the session after any edit.
4. Launch from the repo root. The agent walks from the git root toward the working directory;
starting in a subdirectory can leave root-level instructions outside the walk path.
Verify the instruction file is loaded before the first work order. Check hard constraints
directly from the repository; do not rely on a response ritual or wait state.
0.2 The one-paragraph version, for anyone joining mid-refactor
The database spine is already correct: money is integer centavos, tenancy is enforced, and
bom_line_items.id is a stable UUID that cost, budget, PO and RFQ records already point
at. What is wrong is grain and pricing. bom_line_items mixes work items with material
lines at the same level, room names are baked into description strings, and every line is
priced at a flat 30% markup instead of a real cost build-up. The refactor adds a kind
discriminator, a location dimension, and DUPA child tables underneath the existing rows —
additive migrations, no foreign key ever moves.
0.3 Pre-flight checklist — do these before WO-01
Database backup taken, restore tested. Every work order below has a rollback, but a
backup is the real one.
For any hosted data mutation, an isolated staging or restore replay exists first. Local
backfills use the disposable PostgreSQL lane when hosted staging is unavailable; no local
result is presented as production evidence.
CI runs the test suite on every PR. If it does not, this is WO-00 — the invariants in §6
are worthless as prose and valuable only as failing builds.
The five blocking open questions are sent to ABI (§11): O-01 VAT base, O-03

Delegation matrix, O-04 Excel templates, O-05 Togal export, O-14 rate owner. They
gate WO-06, WO-09 and WO-15. Send them on day one; they take days to come back.
One estimator is identified as the design partner for WO-06/07. The DUPA engine
cannot be validated without one.
Decide the tenancy/branding question (O-01b). It is cheap now.
0.4 Drift-recovery protocol
Long refactors drift. If a session starts proposing a rewrite, inventing a second scope model, or
reaching for a general ledger, stop and paste the Drift Reset prompt from the Prompt Pack.
If output already contains drifted code, discard it rather than repairing it — repaired drift is
harder to review than fresh work.
Three red flags that mean stop immediately:
1. Any migration containing DROP COLUMN, DROP TABLE, or an ALTER that re-points an
existing foreign key.
2. Any new scope model or any new column named scope_item_id.
3. Any monetary value typed as float, double precision, numeric without explicit
scale, or a JS number used for currency.
1. Context brief (for a cold session)
The company. Actuate Builders Inc. (ABI) is a Philippine design-and-build, fit-out and MEP
contractor. Business units: Sales (Business Development), Commercial (Estimation), Design,
Procurement/SCM, Service Delivery (SD: Project Manager, Project Engineer, Site Support,
Safety Officer, QA/QC), Finance (GA / AR / Treasury), CX, and Management/President.
The product. BUILD OPS is ABI’s construction operating system — one connected system
from lead to handover. It currently exists as a working build (“ABI OPS”, Next.js on
Vercel, Supabase/Postgres) with a NestJS Core API, Redis-backed jobs and a Railway CAD
evidence worker. The following current-state inventory is source-backed as of 2026-08-14;
provider claims require the release evidence in §14.

Current runtime surfaces that this refactor must preserve:
- Frontend: Next.js 15 App Router, React 19, Tailwind v4, authenticated `(dashboard)` routes,
  public `(auth)` routes, client portals, server actions and compatibility API routes.
- Backend: NestJS Core modules under `apps/api/src` for auth, CRM, projects, procurement,
  documents, CAD evidence, process/SLA, inventory, finance, notifications, search, Today and
  Cortex. Legacy Next handlers remain adapters until their Core authority gates close.
- Routing/API: health/readiness, upload/document processing, CAD evidence, Togal/takeoff,
  Cortex, search, notifications, inspection, finance and webhook route handlers, plus protected
  `/v1/*` Core endpoints with tenant-derived capability checks and Zod/shared contracts.
- Data: Supabase Postgres 17, Drizzle schema, additive `supabase/migrations`, tenant-scoped
  RLS, append-only audit coverage, business calendar, BOM/DUPA/takeoff, KYC, inspection,
  award, budget, commitment, permit, cost-control, inventory, finance and Cortex tables.
- Storage: private Supabase Storage objects for documents, drawings, signatures, inspection
  media and bank-statement sources; upload sessions and short-lived signed URLs; object paths
  are tenant/project scoped and never trusted from caller-supplied tenant values.
- Jobs/integrations: Redis/BullMQ for Core queues, Inngest/legacy Edge Function compatibility
  for scheduled work, Railway CAD evidence parsing, optional DocuSeal/Resend/Semaphore and
  provider-backed AI behind explicit feature flags and tenant allowlists.
- Hosting: Vercel project `thirdcode-erp` for Web, Railway for Core API and CAD worker,
  Supabase for database/Auth/Storage/Realtime, and Redis for readiness/queue coordination.

Current product modules include CRM/accounts/opportunities/KYC/PPRF/proposal inspection,
projects/documents/comments/access, BOM and Togal/takeoff intake, procurement/RFQ/PO/delivery,
inventory, permits/process/SLA, cost/budget/commitments, tasks/progress/variation orders,
claims/billing/invoices, punchlist/turnover, warranty/CX/portals, finance, Cortex, admin and
reports. Existing modules are retained; this PRD defines additive refactor work and release
gates, not a route deletion list.
ABI’s four stages and the documents that gate them:
1. Proposal (Sales-led) — PPRF → KYC/financial standing → SI Report + RFI → layout &
perspective → RFQ → BOM + BOE → Level 1 Master Schedule → signed BOM →
Contract → NTP + down payment + AR/Project code + CARI
2. Pre-Construction (Commercial + SD) — Project Tracker → Planning Phase 1 & 2 →
FCD/CSD → Building Admin vetting (15 d) → LGU building permit (45–60 d) → CARI →

Allowable Budget → RFPO → PO (BAFO, price comparison, SSJ) → subcontracts → CX
onboarding → mobilization
3. Construction (SD-led) — kickoffs → materials & goods receipt → WAR with Thursday
cut-off → weekly meetings → Variation Orders (Site Instruction → priced proposal →
client sign-off) → QA/QC hold points, IWR, punchlist → Milestone COC → progress
billing
4. Handover — practical handover, COC at 90%/100%, punchlist close-out (30 d),
Occupancy Permit, full payment, construction bond refund, P&L close-out (30 d),
warranty + CX ticketing (24h ack / 48h scheduling) + CNPS
Philippine realities the system must respect: LGU permitting and Building Admin vetting,
BIR 2303 and VAT zero-rated certification, CARI and construction-bond lifecycle through to
refund, an existing SAP goods-receipt touchpoint, the ABI Delegation of Approval matrix,
and business-day SLAs on every process step.
The core problem. A quantity is measured once in Togal, then re-typed into a BOE, whose
unit rate is re-typed into a BOQ, whose total is re-typed into a proposal, then an Allowable
Budget, then a Project Tracker, then an RFPO, then a PO, then a billing forecast, then an
invoice — across separately versioned Excel files (_PPRF_Ver3, _SI_Ver1, _BOE_Ver2)
owned by five business units. BUILD OPS’s job is to type it once.
2. Confirmed schema facts (verified against repository migrations and
available database replay/hosted evidence; recheck exact target at release)
#Fact Status Consequence
1
Money stored as BIGINT centavos;
percentages as integer basis points. No
monetary floats anywhere.
 VERIFIED
The DUPA percentage
cascade can be made
exactly reproducible. No
money-type migration
needed.
2
tenant_id is NOT NULL on tenant-scoped
application tables; tenants is the root; RLS scoping
already in place.
 VERIFIED
Multi-tenancy is solved.
Every new table inherits
the same pattern — no
exceptions.
3
bom_line_items.id is a stable UUID,
already referenced by cost, budget, PO and
The relational spine
exists. This is the single
most expensive thing to

RFQ records. Normal saves update/delete
by id.
VERIFIEDbuild and it is already
built.
4
The legacy initial schema contains
scope_items for CAD evidence; the
refactor spine uses bom_line_items and
no scope_item_id column.
 VERIFIED
Keep the legacy input for compatibility.
Do not add another scope model or
re-point downstream foreign keys.
Therefore: refactor, not rebuild. The three conditions that would have forced a greenfield
rewrite — float money, missing tenancy, unstable line identity — all came back clean.
3. Architectural Decision Records (LOCKED)
ADR-01 — Refactor the existing build. LOCKED. Keep: auth, app shell, navigation,
tenancy/RLS, Purchase Orders (approval timeline + PH tax handling are production-quality),
Inventory (perpetual, immutable movements, UOM, warehouses), Invoices, Claims, KYC
Queue, Documents, design system, dashboard metric selection. Everything else is additive
or a rewiring of a view over new tables.
ADR-02 — bom_line_items is promoted to the Scope Item spine. LOCKED. It already
carries a stable UUID referenced by four downstream domains. It stays the anchor. Domain
language in the UI may say “Scope Item”; the table does not change name in v1.
ADR-03 — Do NOT create a second scope model. LOCKED. The legacy initial schema already
contains scope_items and current CAD evidence routes still use it. New refactor work uses
bom_line_items as the downstream commercial spine; do not add scope_item_id or re-point
cost, budget, PO or RFQ foreign keys.
ADR-04 — The real defect is grain, not naming. LOCKED. bom_line_items currently
mixes two different levels of abstraction in one table:
Entrance Hall — Suspended Ceiling, Mineral Fibre 600×600 · sqm · 1 · ₱850 → a
work item, priced as though it were a material
Entrance Hall — LED Panel Light 600×600 · pc · 3 · ₱1,500 → a material line
A work item is the unit of scope, schedule, progress, billing and margin. A material line
belongs underneath it, inside the DUPA. The fix is a kind discriminator plus DUPA child
tables — additive, no FK movement (§5).
ADR-05 — The DUPA is the atomic commercial object. LOCKED. Every downstream
number in ABI’s business descends from a unit rate: proposal price, contract value,

allowable budget, procurement target, VO price, margin. The current build prices at a flat
1.30 markup (COST ₱49,450 → TCV ₱64,285, with MARKUP % defaulting to 30 in the Add Line
form). That is not a cost model. See §4.
ADR-06 — Room/location must leave the description string. LOCKED. Descriptions are
currently concatenated: Entrance Hall — Vinyl Plank Flooring. The same material
appears as three unrelated rows across three rooms, each independently priced and each
unassigned. Location becomes a dimension; the item becomes a reference. Without this,
“total vinyl plank across the project” is unanswerable and procurement cannot consolidate.
ADR-07 — No new general-ledger expansion in this refactor. LOCKED. ABI runs SAP as
statutory book of record while BUILD OPS owns project financial truth (commitments, costs,
billings, collections forecast and project P&L). Existing Finance ledger, journals, cash and
reconciliation routes are retained for compatibility and are not removed; new work must not
expand or silently replace that accounting authority. Build the GR interface, not a second
statutory book of record.
ADR-08 — Togal is one input to a generic pipeline, never a dependency. LOCKED. The
takeoff importer accepts CSV/XLSX with a saved per-source column-mapping profile. A
Togal export is one such source. Manual entry is always available. The cost chain must
never be blocked by one vendor’s export fidelity.
ADR-09 — Money and percentage conventions. LOCKED. BIGINT centavos; integer
basis points (8% = 800, 7% = 700, 12% = 1200). Intermediate DUPA values are
computed unrounded and rounded only at presentation and at the persisted unit rate
— this is required to reproduce ABI’s own workbooks (§4.3).
4. The DUPA engine — full specification
This is the heart of the refactor. Build it correctly before anything reads from it.
4.1 Structure
One DUPA per work item. Recovered verbatim from ABI’s MNHPI Reefer Facility
submission:
Header:  Project · Item No./Description · Unit of Measurement · Quantity
A  Material   : item · qty · unit · unit_rate · amount        → Subtotal for Material
B  Labour     : item · no_of_persons · hourly_rate ·
                productivity_rate_per_hour · amount           → Subtotal for Manpower
C  Equipment  : item · no_of_units · hourly_rate ·
                productivity_rate_per_hour · amount           → Subtotal for Equipment

Labour and equipment amounts: amount = count × hourly_rate ÷
productivity_rate_per_hour. ABI’s standard crew is Foreman / Skilled / Non-Skilled;
observed rates ₱272.02 / ₱199.09 / ₱173.79 per hour. These live in a crew library, not typed
per sheet.
4.2 Canonical worked example — use as the regression test
From the MNHPI submission, item “Stair footing concrete inc. forms”, unit cu.m, header
quantity 0.10:
Section Detail Amount
A MaterialStair footing concrete inc. forms — 1.00 cu.m @ ₱5,951.00₱5,951.00
B Labour
Foreman 1.00 @ ₱272.02, productivity 1.00 → ₱272.02 ·
Skilled 1.00 @ ₱199.09 → ₱199.09 · Non-Skilled 2.00 @
₱173.79 → ₱347.57
₱818.685
C
Equipment
One-Bagger Concrete Mixer — 1 unit @ ₱600.00/hr,
productivity 0.10 → 600 ÷ 0.10 ₱6,000.00
D DirectA + B + C
₱12,769.685
(displays
12,769.69)
E IndirectOCM 8% of D = ₱1,021.5748 (displays 1,021.57) · Profit 7%
of D = ₱893.8780 (displays 893.88) ₱1,915.45
F VAT 12% × D = ₱1,532.3622 (displays 1,532.36) ₱1,532.36
G Total D + E + F ₱16,217.50
H Unit
rate G ÷ 0.10 ₱162,175.00
Test assertion: given these inputs, the engine must return G = 1621750 centavos and H =
16217500 centavos, exactly.
D  DIRECT COST        = A + B + C
E  INDIRECT COST      = OCM/Contingency (8% of D) + Profit (7% of D)
F  VAT                = 12% × [base — see 4.3]
G  TOTAL COST         = D + E + F
H  UNIT RATE          = G ÷ header quantity

4.3 Two discrepancies found in ABI’s own workbook — both must be handled
explicitly
D-1 — The VAT base is labelled (D+E) but computed on D. The sheet’s row F reads
“12% (D+E)”. Arithmetic proves otherwise: 12% of (D+E) would be ₱1,762.22, but the sheet
shows ₱1,532.36, which is exactly 12% of D — and only that value makes G foot to
₱16,217.50. → Implementation: vat_base is a configurable enum (direct_only |
direct_plus_indirect), defaulting to direct_only to reproduce ABI’s existing books.
Surface the label honestly in the UI. [BLOCKED: O-01] — Commercial must confirm which
is intended; the difference is ~1.4% of every unit rate.
D-2 — A 10× transcription error is visible in the shipped BOQ. The DUPA yields H =
₱162,175.00 per cu.m. The BOQ line reads qty 0.10 · unit cost ₱16,217.50 · amount
₱1,621.75. The estimator carried G into the BOQ’s unit-cost column instead of H,
understating that line by a factor of ten — roughly ₱14,600 on one item, in a document that
went to a client. → This is the single most persuasive argument for the whole refactor.
When the BOQ unit cost is derived from H rather than typed, this class of error becomes
structurally impossible. Ship D-2 as a named regression test.
4.4 Rounding policy
Compute A, B, C, D, E, F in unrounded rational arithmetic (integer centavos with a
scale factor, or exact decimal — never float).
Round half-up to centavos only when: persisting unit_rate_centavos, persisting
total_centavos, or rendering.
H is persisted rounded; all BOQ amounts derive from the persisted H so the client-
facing document always foots.
Test: re-deriving a BOQ from persisted rates must reproduce the printed total to the
centavo.
4.5 Libraries (what makes the engine fast rather than merely correct)
Library Contents Why
Assembly
A reusable DUPA template per work type
(e.g. “suspended ceiling, mineral fibre
600×600, sqm”) with its
material/labour/equipment skeleton and
productivity factors
ABI hand-builds ~55 DUPA
sheets per project, most
structurally identical. This
removes 60–80% of estimator
keystrokes
Rates stop being retyped 55

Crew Foreman / Skilled / Non-Skilled (extensible)
with current hourly rates, effective-dated
times and start being
maintained once
EquipmentItem, hourly rate, typical productivitySame
Material
catalog
Item, base UOM, current rate, source (RFQ
/ PO / manual), last_updated_at
Feeds DUPA material lines and
gives the staleness flag
Price
history
Every quoted and awarded price, by
vendor, by date
Makes the rate suggestion
defensible rather than a guess
Every rate displays “last updated” beside it. A rate older than a configurable threshold
(default 90 days) renders with a staleness warning.
5. Schema changes
Migration principles. Additive only. No existing column is dropped in v1. No downstream
foreign key is re-pointed. Every new table carries tenant_id NOT NULL with the same RLS
policy shape as existing tables. Every new table carries created_at, updated_at,
created_by, and participates in the audit trail.
M-01 · Discriminate the grain on bom_line_items
ALTER TABLE bom_line_items
  ADD COLUMN kind text NOT NULL DEFAULT 'work_item'
    CHECK (kind IN ('work_item','material_line')),
  ADD COLUMN parent_line_item_id uuid REFERENCES bom_line_items(id),
  ADD COLUMN location_id uuid REFERENCES project_locations(id),
  ADD COLUMN division_id uuid REFERENCES boq_divisions(id),
  ADD COLUMN item_no text,                       -- BOQ numbering, e.g. 'B.2.0'
  ADD COLUMN drawing_revision_id uuid REFERENCES drawing_revisions(id),
  ADD COLUMN takeoff_import_id uuid REFERENCES takeoff_imports(id),
  ADD COLUMN unit_rate_source text NOT NULL DEFAULT 'manual'
    CHECK (unit_rate_source IN ('dupa','manual','client_boq'));
CREATE INDEX ON bom_line_items (tenant_id, parent_line_item_id);
CREATE INDEX ON bom_line_items (tenant_id, kind);
Backfill. Classify existing rows by UOM: area/volume/lot units (sqm, cu.m, lot, lm, m2)
→ work_item; discrete/weight units (pc, pcs, kg, liters, set) → material_line. Flag
every ambiguous row for estimator review rather than guessing. No row is auto-

reparented — attaching a material line to the wrong work item silently corrupts a cost
hierarchy. Reparenting is an explicit, reviewed action in the UI (WO-04).
Invariant: kind = 'material_line' ⟹ parent_line_item_id IS NOT NULL (enforced by
trigger after backfill review completes, not before).
M-02 · Location dimension (ADR-06)
Migration parses the leading "<Room> — " prefix out of existing descriptions into
project_locations, leaving the item description clean. Original string retained in
description_original for audit.
M-03 · The DUPA tables
CREATE TABLE project_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  parent_id uuid REFERENCES project_locations(id),   -- building > floor > zone > room
  name text NOT NULL,
  level text CHECK (level IN ('building','floor','zone','room','area')),
  sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE dupas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  bom_line_item_id uuid NOT NULL REFERENCES bom_line_items(id) ON DELETE CASCADE,
  assembly_id uuid REFERENCES assemblies(id),
  header_quantity numeric(18,4) NOT NULL,       -- quantity the analysis is built for
  uom text NOT NULL,
  ocm_bps int NOT NULL DEFAULT 800,             -- 8%
  profit_bps int NOT NULL DEFAULT 700,          -- 7%
  vat_bps int NOT NULL DEFAULT 1200,            -- 12%
  vat_base text NOT NULL DEFAULT 'direct_only'
    CHECK (vat_base IN ('direct_only','direct_plus_indirect')),   -- D-1
  direct_cost_centavos bigint NOT NULL DEFAULT 0,
  indirect_cost_centavos bigint NOT NULL DEFAULT 0,
  vat_centavos bigint NOT NULL DEFAULT 0,
  total_cost_centavos bigint NOT NULL DEFAULT 0,
  unit_rate_centavos bigint NOT NULL DEFAULT 0,   -- H, the value the BOQ consumes
  computed_at timestamptz,
  UNIQUE (bom_line_item_id)
);

Migration of existing material lines. Rows classified material_line in M-01 that have a
reviewed parent move down into dupa_material_lines under that parent’s DUPA. The
original bom_line_items row is retained but marked superseded_by_dupa_line_id — never
hard-deleted, because downstream POs and RFQs may already reference it. Those
references remain valid and resolvable.
CREATE TABLE dupa_material_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  dupa_id uuid NOT NULL REFERENCES dupas(id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES material_catalog(id),
  description text NOT NULL,
  quantity numeric(18,4) NOT NULL,
  uom text NOT NULL,
  unit_rate_centavos bigint NOT NULL,
  rate_source text CHECK (rate_source IN ('catalog','rfq','history','manual')),
  rate_as_of date,
  sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE dupa_labour_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  dupa_id uuid NOT NULL REFERENCES dupas(id) ON DELETE CASCADE,
  crew_role_id uuid REFERENCES crew_roles(id),
  description text NOT NULL,                     -- 'FOREMAN','SKILLED','NON-SKILLED'
  no_of_persons numeric(10,2) NOT NULL,
  hourly_rate_centavos bigint NOT NULL,
  productivity_per_hour numeric(18,4) NOT NULL CHECK (productivity_per_hour > 0),
  sort_order int NOT NULL DEFAULT 0
);
CREATE TABLE dupa_equipment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  dupa_id uuid NOT NULL REFERENCES dupas(id) ON DELETE CASCADE,
  equipment_id uuid REFERENCES equipment_catalog(id),
  description text NOT NULL,
  no_of_units numeric(10,2) NOT NULL,
  hourly_rate_centavos bigint NOT NULL,
  productivity_per_hour numeric(18,4) NOT NULL CHECK (productivity_per_hour > 0),
  sort_order int NOT NULL DEFAULT 0
);

M-04 · Libraries
assemblies (reusable DUPA templates with child template tables mirroring M-03),
crew_roles (name, hourly_rate_centavos, effective_from, effective_to),
equipment_catalog, material_catalog (item, base UOM, current rate, source,
last_updated_at), price_history (catalog_item_id, vendor_id, quoted/awarded rate,
source_document, occurred_at), boq_divisions (code, name, sort_order, is_preliminaries).
M-05 · Budget and cost baseline
cost_codes (derived from BOQ divisions), budgets (project_id, status, baseline_locked_at,
locked_by), budget_lines (budget_id, cost_code_id, bom_line_item_id,
budgeted_centavos). Commitments and actuals both resolve to budget_lines.
bom_line_item_id is the join — not a new key.
M-06 · Process and SLA engine
process_steps (code e.g. PR-L, stage, name, responsible_bu, input, input_from, output,
output_by, sla_days, is_business_days, template_link, predecessor_code),
task_instances, sla_clocks (started_at, due_at, at_risk_at, breached_at,
paused_reason), approval_rules (object_type, amount_band_low, amount_band_high,
approver_role, sequence, escalation_after_days), approvals.
Seeded from ABI’s SD Framework deck — roughly 70 steps already specify responsible BU,
input, output and SLA in business days. That deck is a state machine written in
PowerPoint. Load it as data.
M-07 · Business-day service
A shared business_days service with a Philippine holiday calendar. Every SLA in the deck is
expressed in business days except CX’s 24h/48h ticket clocks, which are calendar hours.
Model both.
6. Invariants (enforce as constraints, triggers or tests — not
conventions)
# Invariant Enforcement
I-
01No float in any monetary path Lint rule + type check in CI

I-
02
Every application table has tenant_id NOT NULL
and an RLS policy
Migration test that scans
information_schema
I-
03
kind='material_line' ⟹
parent_line_item_id IS NOT NULLTrigger (after backfill review)
I-
04
A work_item with unit_rate_source='dupa'
has exactly one DUPA Unique constraint + test
I-
05
dupa.unit_rate_centavos recomputes on any
child-line change
Trigger or explicit service call;
computed_at must be ≥ latest
child updated_at
I-
06
BOQ line amount = unit_rate_centavos ×
quantity, always derived, never typed
No editable unit-cost field
where
unit_rate_source='dupa'
I-
07productivity_per_hour > 0 Check constraint (prevents
divide-by-zero)
I-
08
A locked budget baseline cannot be edited — only
a VO or a logged transfer changes it
Trigger on
budgets.baseline_locked_at
IS NOT NULL
I-
09
PO commitment cannot be created without a
budget_line_id FK NOT NULL on commitment
I-
10
Takeoff re-import never deletes and reinserts
bom_line_items — it upserts by
(takeoff_import_id, source_row_key)
Importer test: assign a vendor,
re-run import, vendor survives
I-
11
Every state change writes an immutable audit
event Trigger on all mutable tables
I-
12
Rounding is half-up to centavos, applied only at
persistence and presentation Unit tests including §4.2
I-
13
A BOM cannot be submitted for client approval
while its Unresolved queue is non-empty
Guard on the submit action +
test
I-
14
An AI-drafted line never carries a unit rate until a
DUPA is attached
Check constraint on
kind='work_item' AND
ai_drafted

7. Work orders
Ordered. Each is a self-contained ticket — a session can execute one without reading the
rest. Do not skip forward; later orders assume earlier invariants hold.
Global constraints applying to every work order below:
Additive migrations only. No DROP. No foreign key re-pointed.
Every new table: tenant_id NOT NULL, matching RLS policy,
created_at/updated_at/created_by, audit participation.
No float in any monetary path.
Every acceptance criterion ships as an automated test, not a manual check.
WO-00 · CI gate (prerequisite — half a day)
Context. The invariants in §6 are only real if a build fails when they break. Do. Ensure CI
runs the full test suite on every PR. Add three static checks: (a) no float/double
precision in any migration touching money; (b) no new table without tenant_id NOT NULL;
(c) no record with an E2E_ prefix in a non-demo tenant. Acceptance. A deliberately-broken
PR for each of the three checks fails CI.
WO-01 · Purge and separate demo data (1 day — do this first)
Context. The live build shows E2E_QA_20260513_dd8a07a1_acct1 across Accounts, Projects
and Documents; four identical PO-0002 rows in Deliveries; a duplicated TH/RD CODE FINAL
PHASE lead; and E2E_QA_..._vendor1 sitting in the production vendor picker beside Daikin
Phils. Trading and Powermatic Industries. Do. Inventory every QA/E2E-seeded record. Move
demo data to a dedicated demo tenant. Purge from the ABI tenant. Fix the duplicate PO-
0002 rows (determine whether they are genuine duplicates or a join fanout in the Deliveries
query — check this before deleting anything). Do NOT. Delete anything referenced by a real
record without first checking the reference. Files. Seed scripts, Deliveries query/repository,
tenant configuration. Acceptance. No E2E_-named record is reachable from any ABI-
tenant screen. The vendor picker returns only real vendors. Deliveries shows the correct row
count for its POs. Rollback. Restore from the pre-purge snapshot. Rationale: management
will be shown this build. Every number they see has to be one they believe.

WO-02 · Business-day service + audit events (2–3 days)
Context. Every SLA in ABI’s process deck is in business days; CX ticket clocks are calendar
hours. Both are needed before WO-03. Do. Build businessDays.add(date, n) /
.between(a, b) with a Philippine holiday calendar (national regular + special non-working,
maintainable as data, not code). Add immutable audit events on all mutable tables: actor,
table, row, before, after, timestamp. Acceptance. Holiday arithmetic is correct across a year
boundary and across Holy Week. Every mutation on a covered table produces exactly one
audit row. Audit rows cannot be updated or deleted.
WO-03 · Process & SLA engine, seeded from the SD Framework deck (1–1.5
weeks)
Context. ABI’s deck already specifies ~70 steps with responsible BU, input, input-from,
output, output-by and SLA in business days. It is a state machine written in PowerPoint. Do.
Implement M-06 tables. Seed process_steps from the deck. Implement clocks with at-risk
(80%), breach (100%) and escalation (150%) thresholds. Separate internal clocks
(enforceable) from external clocks (LGU, Building Admin, client — tracked, never escalated
against a BU). Do NOT. Seed any step whose owner is recorded as a question mark — C-
05’s “Commercial or SD – PM?” — until the workshop resolves it. Never automate an
unowned step. Acceptance. A step can be created, assigned, clocked, breached and
escalated end-to-end. A process-health view shows breaches by BU. External-clock
breaches never generate a BU escalation. Launch note. Ship in observe mode for 4–6
weeks: report at BU level, not individual level, and tune thresholds with BU heads before
enforcement (R-07).
WO-04 · Grain discrimination + reparenting review UI (1 week)
Context. ADR-04. bom_line_items currently holds Entrance Hall — Suspended Ceiling ·
sqm · 1 · ₱850 (a work item priced as a material) beside Entrance Hall — LED Panel
Light · pc · 3 · ₱1,500 (a material line) at the same level. Do. Run migration M-01.
Backfill kind by UOM: sqm, cu.m, m2, lm, lot → work_item; pc, pcs, kg, set,
liters → material_line. Route every ambiguous row to a review queue. Build the UI for
an estimator to confirm classification and explicitly attach a material line to a work item. Do
NOT. Auto-reparent anything. Attaching a material line to the wrong work item silently
corrupts a cost hierarchy and is very hard to detect later. Do not enable the I-03 trigger until
the review queue is empty. Files. Migration, bom_line_items repository, BOM Builder line
list. Acceptance. Every existing row is classified or queued. No row was auto-reparented.
No downstream FK changed — verify by asserting PO, RFQ, cost and budget row counts and

target ids are identical before and after. Rollback. kind and parent_line_item_id are new
nullable columns; reverting is dropping them.
WO-05 · Location dimension (3–4 days)
Context. ADR-06. The same LED panel appears as three unrelated rows across Entrance
Hall, GM’s Office and Reception Room, each independently priced at ₱1,500 and each
unassigned. Procurement cannot consolidate; rollup is impossible. Do. Run M-02. Parse
the leading "<Room> — " prefix out of descriptions into project_locations. Retain the
original string in description_original. Build a location picker on the line editor. Do NOT.
Discard the original description. Parsing is heuristic and will need review. Acceptance.
Entrance Hall — Vinyl Plank Flooring becomes item Vinyl Plank Flooring at location
Entrance Hall. A query returns total vinyl plank sqm across all locations in a project.
Unparseable descriptions are queued, not silently mangled.
WO-06 · DUPA engine + libraries (2–3 weeks — the critical path)
Context. ADR-05. This is the heart of the refactor. Currently the build prices everything at
flat markup: the Add Line form defaults MARKUP % to 30, and COST ₱49,450 → TCV ₱64,285
is exactly ×1.30. Do. Run M-03 and M-04. Implement §4 exactly: material + labour (crew ×
hourly rate ÷ productivity) + equipment → Direct → OCM 800 bps + Profit 700 bps → VAT
1200 bps → Total → Unit Rate. Implement §4.4 rounding: unrounded intermediates, half-up
to centavos only at persistence and presentation. Build the assembly, crew, equipment,
material-catalog and price-history libraries. Implement D-1’s configurable vat_base,
defaulting to direct_only. Do NOT. Write any UI before the engine passes the §4.2 test.
Do not introduce a float anywhere in the cascade. Acceptance.
§4.2 worked example returns G = 1621750 and H = 16217500 centavos, exactly.
D-2 regression test: a BOQ unit cost sourced from G instead of H fails the build.
Changing a crew rate in the library recomputes every DUPA referencing it.
A DUPA can be built from an assembly template in under 60 seconds.
Re-deriving a full BOQ from persisted rates reproduces the printed total to the centavo.
Blocked by. O-01 (VAT base) for the default; build configurable and proceed. O-14 (rate
owner) for sign-off. Assign the most senior engineer. Validate against ABI’s ~55 MNHPI
DUPA sheets before writing UI.

WO-07 · Rebuild BOM Builder as a view over the new model (1.5–2 weeks)
Context. The current screen is a flat table with an editable UNIT COST and a MARKUP %
field. That form is where D-2’s 10× error becomes possible. Do. New structure: BOQ
divisions with sub-totals → work items with derived unit rates → DUPA detail behind
progressive disclosure. Keep the existing versioning, the “Submit for Client Approval” flow,
and the supplier switcher — those instincts are correct. Fix the supplier switcher’s rate-card
matching to join on catalog_item_id, not description text (it currently returns “No rate
cards match this line” on every AI-drafted row). Do NOT. Retain an editable unit-cost field
where unit_rate_source='dupa'. Do not keep MARKUP % as a line-level input. Acceptance.
I-06 holds. The pricing-breakdown chips (RAG / Catalog / Manual / Unpriced) report real
state rather than zeros. Margin derives from the DUPA cascade. Rate cards match by
foreign key.
WO-08 · Takeoff importer (1.5 weeks)
Context. ADR-08. Togal is one producer, never a dependency. Do. Build: file → preview →
saved column-mapping profile per source → validation (UOM recognised? division
assigned? duplicate detected?) → upsert to bom_line_items keyed on
(takeoff_import_id, source_row_key). Bind every imported line to a
drawing_revision_id. Do NOT. Delete-and-reinsert on re-import. That orphans every
downstream PO and vendor assignment. Acceptance. I-10 is the blocking test: assign a
vendor to an imported line, re-run the same import, the vendor survives. A Togal export
works as a mapped XLSX on day one. Manual entry remains available.
WO-08a · Disposition of the existing AI CAD auto-draft — decided, do not re-open
The current build ships “Auto-drafted from CAD upload”, which produces AI-tagged lines
such as Entrance Hall — Suspended Ceiling, Mineral Fibre 600×600 · sqm · 1 · ₱850
with vendor: unassigned, and a pricing breakdown reading RAG 0 / Catalog 0 / Manual 0 /
Unpriced 0 against 13 lines. The feature is retained and keeps running. It is not switched
off, and it is not deleted.
What changes: its output stops writing directly to a priced BOM line and instead becomes
one more producer feeding the same pipeline as any other takeoff source. Concretely:
1. Route it through the identical validation gate. AI-drafted rows get no privileged path.
Same UOM check, same division assignment, same duplicate detection, same
(takeoff_import_id, source_row_key) upsert key.
2. Land every AI row as a work_item in draft state with unit_rate_source='manual'

and no unit rate, rather than as a priced line. An AI-extracted description is a scope
candidate, not a price. Pricing happens when a DUPA is attached (WO-06).
3. Unmapped and unpriced rows are visibly queued, never silently accepted. The
current failure mode is a line sitting at qty 1 with an unassigned vendor and no rate card
match, looking finished. Every such row appears in an Unresolved queue with the
reason (no UOM match, no division, no catalog match, quantity defaulted) and a
count badge on the BOM header.
4. Retain the AI provenance tag on the row, and record the source model, the drawing
revision and the extraction timestamp. This is the corpus the post-MVP mapping layer
trains and is evaluated against — do not discard it.
5. A BOM cannot be submitted for client approval while the Unresolved queue is non-
empty. Hard gate. This is the structural fix for lines reaching a client at qty 1 with a
defaulted quantity.
Do NOT. Do not build the AI mapping layer in this work order — free-text description
normalisation, UOM inference, automatic division assignment and assembly matching are
post-MVP, first item after the MVP line. Do not let AI-drafted lines bypass validation on the
argument that the model was confident. Do not delete the existing feature to “clean up” —
its output is the evaluation set.
Acceptance.
A CAD upload produces work_item rows in draft, with no unit rate and no vendor,
each carrying an AI provenance record.
Every row that fails any validation check appears in the Unresolved queue with a stated
reason; none is silently accepted.
Submitting for client approval is blocked while that queue is non-empty, with the
blocking rows listed.
Re-running a CAD extraction over the same drawing revision upserts — it does not
duplicate rows and does not clear vendor assignments (I-10 applies here too).
A row that has been given a DUPA in WO-06 is not overwritten by a subsequent re-
extraction.
Rationale. The AI draft is genuinely valuable at the top of the chain — it turns a drawing into
candidate scope in seconds. What made it untrustworthy was that its output looked like a
finished priced line when it was an unvalidated guess. Keeping the feature while forcing its
output through the same gate as every other source preserves the speed and removes the
false confidence.

WO-09 · Excel importers (2 weeks — ship alongside WO-06/07, not after)
Context. ABI’s operating history is in _PPRF_Ver3, _SI_Ver1, _BOE_Ver2 files. These are
simultaneously the adoption barrier and the seed corpus — importing historical BOEs
populates the assembly, crew and material libraries that make WO-06 fast on day one. Do.
Importers for PPRF, SI Report, BOQ/BOM, BOE, Level 1 schedule. Each with preview,
mapping, validation and a rejected-rows report. Acceptance. A real *_BOE_Ver2_*.xlsx
imports into DUPAs with rates and productivity intact. A real *_PPRF_Ver3_*.xlsx creates a
client and an opportunity. Nothing imports silently — every skipped row is reported.
Blocked by. O-04 (the actual templates).
WO-10 · RFQ intake → price comparison → price history → DUPA rates (1
week)
Do. Capture supplier quotes as structured lines. Build the comparison matrix. Write awarded
and quoted prices to price_history. Surface suggestions inside the DUPA material line
with source and date. Acceptance. A captured quote updates the catalog rate and appears
as a dated, sourced suggestion in the DUPA. Rates older than 90 days render with a
staleness warning.
WO-11 · PPRF form + KYC dual-track gate (1 week)
Do. Structured PPRF creating Client + Opportunity. Two independent 2-day tracks: Financial
Evaluation Report (Finance-GA; FC recommends → President approves) and Credit
Investigation Report (Finance-AR; FC notes → President endorses). Keep the existing KYC
Queue UI — the gating concept is already right. Acceptance. An opportunity cannot
advance past Site Survey until both tracks clear. A flag or rejection locks downstream
stages with a visible reason.
WO-12 · Mobile SI Report + RFI (1 week)
Do. Pre-filled from the PPRF. Photo capture. RFI raised from the same screen. Offline-
tolerant with sync. Acceptance. Completable one-handed on a phone. Survives loss of
signal mid-form. Findings attach permanently to the opportunity.
WO-13 · Award automation — the demo moment (1 week)

Context. This is where the value becomes obvious to management. It is also ABI’s single
most expensive hand-off today. Do. Signed BOM → in one atomic transaction: create
Project, Budget baseline from the approved BOQ, cost codes from BOQ divisions,
AR/Project code request, DP invoice draft, CARI task, Project Tracker, CX onboarding task.
Acceptance. No field is retyped between the signed BOM and the live project. The
transaction is atomic and reversible. Demo it to management before proceeding.
WO-14 · Allowable Budget approval + baseline lock (4–5 days)
Do. Approval flow on the Allowable Budget. On approval: lock the baseline, snapshot the
original margin. Acceptance. I-08 holds — a locked baseline cannot be edited by any path
except a VO or a logged transfer with a reason and an actor.
WO-15 · RFPO → PO → budget commitment (1.5 weeks)
Context. The PO module is the best-built part of the current system — the approval timeline
(Draft → PM approved → Commercial approved → SCM issued → Supplier notified) and PH
tax handling (12% VAT, 2% withholding) are production-quality. Carry them forward
unchanged. Do. Add the RFPO stage, Delegation-of-Approval routing by amount band, and
commitment against budget_lines joined on bom_line_item_id. Do NOT. Rewrite the
existing PO approval timeline or tax logic. Acceptance. I-09 holds. Issuing a PO reduces
remaining allowable on the cost code. A PO that would exceed allowable warns before
submission. Blocked by. O-03 (the Delegation matrix).
WO-16 · Permits, CARI, bonds + mobilization readiness gate (1.5 weeks)
Context. The LGU permit at 45–60 days is the schedule’s critical path and is currently
chased over email. Mobilization requires four external returns. Do. Permit types: LGU
building permit, Building Admin vetting (15 d), DOLE, Occupancy Permit, CARI, and
performance/surety/construction bonds through to refund. Each with responsible person,
expected return, countdown, escalation. Model LGU duration as min/expected/max per
LGU, learned from actuals (C-01). Acceptance. A single tile shows the four mobilization
inputs — commented FCD, PO copies, CARI, NTP from Building Admin — as
/
 with
days-at-risk. Mobilization cannot be marked started until all four land, or an authorised
override is logged with a reason and an actor.
WO-17 · Cost control v1 (1.5 weeks)

Do. Budget → committed (POs) → actual (PO-invoiced) → remaining → variance → live
margin. Drilldown by cost code. All joins on bom_line_item_id. Acceptance. Commercial
confirms the live margin on a running project matches their own spreadsheet. This is a
human sign-off, not a unit test.
WO-18 · Management dashboard v1 (1 week)
Do. Keep the existing metric selection — pipeline TCV, weighted pipeline, GP, blended
margin are the right metrics at the right altitude. Add: margin by project with variance, cost
variance, permit exposure, unsigned-VO exposure, SLA breaches by BU. Acceptance. The
President can run a Monday meeting from it without opening Excel.
— MVP line —
Post-MVP, in order: AI takeoff mapping layer (description normalisation, UOM inference,
division assignment, assembly matching — evaluated against the AI provenance corpus
retained in WO-08a) · tender/bid mode (client-issued TOR + BOQ, deviation list, evaluation
criteria, subcontractor profile) · schedules L1–L4 with MS Project import + labour
reconciliation · progress capture → WAR → Thursday cut-off · milestone → COC → claim →
invoice · VO end-to-end · QA/QC hold points → IWR → punchlist with plan pinning · GR +
inventory issuance → actual cost + SAP interface · subcontracts + vendor performance ·
handover, O&M, occupancy, bond refund, P&L close-out · warranty + CNPS + CX
onboarding · role dashboards · AI layer (DUPA auto-draft → price suggestion → anomaly
detection → TOR summarisation → NL search).
8. Automations to implement (MVP subset)
Full set of 44 in the Blueprint §10. These are the MVP-critical ones.
IDTrigger Actions
A-
01PPRF submitted
Create Client + Opportunity; open Financial Evaluation
(Finance-GA, 2 d) and Credit Investigation (Finance-
AR, 2 d); notify FC
A-
02
Both KYC reports approved
by President
Unlock stage advance past Site Survey; stamp KYC-
cleared; log approver
A-KYC flagged/rejected Lock downstream stages; alert BD + Management

03 with reason
A-
05Final layout approved Auto-issue RFQ pack by trade (5 d clock); notify
Procurement
A-
06Quote received Update price comparison + price history; alert
Estimator if it beats the DUPA rate by >X%
A-
07Signed BOM uploadedThe award transaction — WO-13
A-
11NTP received
Start Pre-Con clocks: Project Tracker 2 d, Planning
Phase 1 ≤2 d, Planning Phase 2 18 d, CX onboarding 7
d
A-
12FCD issued for signature3–5 d client clock → Building Admin vetting 15 d →
LGU 45–60 d; notify SD-PE at each return
A-
13
Permit / CARI / bond /
accreditation nearing
expected return or expiry
Alert responsible person + BU head; escalate on
breach
A-
14
Allowable Budget
approved
Lock baseline; snapshot original margin; enable
procurement
A-
15RFPO signed Generate PO drafts from BOM lines; route per
Delegation; start 18 d clock
A-
16PO issued
Commit to cost code; reduce remaining allowable;
create expected Delivery; warn if commitment
exceeds allowable
A-
17
All four mobilization inputs
received
Mark Mobilization Ready; notify PM; unlock
Construction stage
A-
30
Any cost, commitment or VO
change
Recompute forecast-at-completion and live margin;
alert if margin drops below threshold
A-
41
Any SLA at 80% / 100% /
150%
Notify assignee → BU head → Management; add to
SLA-breach dashboard
A-
42Approval required Route per Delegation by amount band and object
type; auto-escalate on timeout
A-
44Any state change Immutable audit event

9. Risks and guardrails for the refactor
# Risk Guardrail
R-
01
Estimators keep
using Excel
WO-09 ships alongside WO-06/07. MVP success test: an
estimator produces a client-presentable BOQ + BOE faster in
BUILD OPS than in Excel on launch day. If false, do not launch —
fix the engine and the import
R-
02
DUPA engine
under-built
Most senior engineer; validated against the ~55 MNHPI sheets
before any UI work; §4.2 and D-2 as permanent regression tests
R-
03
Scope creep
back into the GL
ADR-07 is LOCKED. Any GL work requires an explicit written
reversal
R-
04
Backfill mis-
classifies grain
Nothing auto-reparents. Ambiguous rows go to a human review
queue (WO-04)
R-
05
Stale master
data poisons
every DUPA
last_updated_at beside every rate; staleness warning at 90
days; a named owner for rate maintenance [BLOCKED: O-14]
R-
06
The deck is mid-
revision —
automating an
unowned step
Resolve C-02/C-03/C-05 (§10) in a short workshop before WO-03
seeding. Never automate a step whose owner is recorded as a
question mark
R-
07
SLA
enforcement
experienced as
surveillance
Launch in observe mode 4–6 weeks; BU-level reporting before
individual; thresholds tuned with BU heads before enforcement
R-
08
External SLAs
outside ABI’s
control
Separate internal (enforceable) from external (trackable) clocks.
Never escalate a BU for an LGU delay
R-
09
Importer
regenerates
rows and
orphans
downstream
records
I-10 is a blocking test on WO-08
Launch by stage on live projects: Proposal-stage first

R-
10
Big-bang launch(Commercial + Sales only), then Pre-Con, then Construction. One
pilot project fully through before company-wide rollout
R-
11
Single-estimator
dependency in
the assembly
library
Multi-estimator review; library entries versioned with an owner
10. Contradictions carried forward (flagged, not silently
resolved)
# Contradiction Default taken Needs
C-
01
LGU permit 45–60 days (SD
Framework) vs 30 days
(Yamaha schedule)
Model as min/expected/max per
LGU, learned from actuals O-12
C-
02
Contract turnaround “30 days
after signing of BOM and NTP”
vs “2 weeks (max) upon receipt
of NTP”
14 business days (the tighter
commitment) O-08
C-
03
Level 4 Master Schedule listed
as output of both Planning
Phase 1 and Phase 2
Phase 1 = endorsement package;
Phase 2 = the schedule Workshop
C-
04
Step E annotated “Originally
from Construction Stage.
Proposed to move to Pre-
construction”
Build the step stage-configurableWorkshop
C-
05
Level 1 Master Schedule owner
recorded as “Commercial or
SD – PM?” — question mark in
the source
SD-PM produces, Commercial
approves Workshop
C-
06
Two intake modes: ABI-
generated BOM vs client-issued
BOQ (MNHPI tender)
Support both;
unit_rate_source='client_boq'
exists from day one
Post-MVP
C-
07
Yamaha schedule signed by
SPCI staff, no ABI signatory— O-01

C-
08
SAP goods receipt vs the
build’s own GL ADR-07: interface, don’t replaceO-02
C-
09
Handover at 100% (SD
Framework) vs partial per-zone
handovers (Yamaha)
Handover is per-zone/packageConfirm
D-
01
DUPA row F labelled “12%
(D+E)” but computed on Dvat_base='direct_only'
O-01,
blocking
WO-06
D-
02
BOQ unit cost taken from G
instead of H — a live 10× errorUnit cost always derived from HPermanent
test
11. Open questions
Blocking specific work orders:
O-01 — Is the DUPA VAT base direct cost only or direct + indirect? Differs by ~1.4% on
every unit rate. → blocks WO-06
O-03 — The actual ABI Delegation of Approval matrix: amount bands, approver roles,
sequences, escalation. → blocks WO-15
O-04 — The real Excel templates: PPRF, SI, BOE, Milestone Definition, Project
Tracker, Allowable Budget Form, Interim Payment Certificate, Level 1 MS. (The
SD deck’s “Link to Template” column is the checklist.) → blocks WO-09
O-05 — A real Togal export file — format, columns, fidelity. → blocks Togal AI mapping
O-14 — Who owns rate maintenance as a standing responsibility? Without a name, R-05
happens. → blocks WO-06 sign-off
Needed before later phases:
O-02 — Which SAP modules does ABI actually run (GR only? AP? GL? full FI/CO)?
O-06 — Are 8% OCM / 7% profit ABI policy, DPWH convention, or MNHPI-specific?
O-07 — Standing cost-code/WBS chart across projects, or per-project divisions?
O-09 — What Level 2 and Level 3 schedules contain, and who owns them
O-10 — Retention terms and standard warranty period (MNHPI TOR says minimum 1
year — is that ABI’s standard?)

O-11 — Concurrent project count and target user count
O-12 — Which LGUs does ABI most often work with?
O-13 — Does ABI want a vendor/subcontractor portal, or should external parties stay on
email?
O-01b — Is BUILD OPS ABI’s internal system or an ABI OPS product with ABI as
tenant? (Tenancy is already built correctly either way — this is a branding and
commercial decision.)
Assumptions in force (labelled, cheap to reverse): A1 contract turnaround 14 business
days · A2 Phase 1 = endorsement, Phase 2 = schedule · A3 L1 schedule by SD-PM · A4 SAP
remains statutory book of record · A5 Delegation is amount-banded and sequential
(prepared → reviewed → noted → approved) · A6 DUPA defaults 800/700/1200 bps,
configurable per project/client · A7 crew = Foreman/Skilled/Non-Skilled · A8 cost codes
derive from BOQ divisions · A9 milestone percentages project-configurable · A10 handover
per-zone · A12 all deck SLAs are business days except CX’s 24h/48h · A13 existing PH tax
treatment (12% VAT, 2% withholding, retention, output VAT on posting) is correct and
carried forward unchanged.
12. Definition of done for the refactor
The refactor is complete when all of the following are true:
1. No E2E_-named record is reachable from any ABI-tenant screen.
2. The §4.2 worked example returns G = 1621750 and H = 16217500 centavos, exactly, as
an automated test.
3. The D-2 regression test — BOQ unit cost derived from H, never G — is permanent and
passing.
4. No bom_line_items row mixes grain: every material line has a reviewed parent work
item.
5. Room has left the description string; a project-wide material rollup query returns correct
totals.
6. A takeoff re-import preserves vendor assignments (I-10).
7. A real historical _BOE_Ver2_.xlsx imports with rates and productivity intact.
8. A signed BOM creates a project, budget baseline and cost codes with zero fields

retyped.
9. A locked budget baseline cannot be edited except through a VO or a logged transfer.
10. Issuing a PO commits against a budget line and reduces remaining allowable.
11. Live margin on a running project is confirmed correct by Commercial against their own
spreadsheet.
12. An ABI estimator produces a complete, client-presentable BOQ + BOE faster in BUILD
OPS than in Excel.
Item 12 is the only one that matters commercially. The other eleven exist to make it true.
14. Document control
Document VersionRole
BUILD_OPS_Blueprint.md1.1
Evidence and reasoning record — the why.
Audit of the current build, AS-IS/TO-BE,
contradictions, competitor analysis, AI map
docs/PRD.md 1.3
Implementation authority — the what and in
what order. Where the two disagree, this
document wins
BUILD_OPS_Prompt_Pack.md
→ docs/PROMPTS.md1.1
Execution aid — copy-paste prompts, one per
work order, plus drift-recovery and review
prompts
AGENTS.md 1.0 Codex instruction file, repo root. Auto-loaded
each session. Lean by design
Change log.
v1.0 (08 Aug 2026) — initial PRD following the refactor-vs-rebuild decision.
v1.1 (12 Aug 2026) — work orders restructured as self-contained tickets; WO-00 (CI
gate) added as a prerequisite; pre-flight checklist and drift-recovery protocol added
(§0.3, §0.4); no architectural decision changed.
v1.3 (12 Aug 2026) — retargeted to OpenAI Codex as the reference toolchain:
AGENTS.md replaces CLAUDE.md, file paths updated to docs/PRD.md and
docs/PROMPTS.md, and Codex-specific operational notes added (§0.1) covering the 32

KiB instruction cap, instruction-vs-enforcement limits, session restart on edit, and
launch directory. No architectural decision changed.
v1.2 (12 Aug 2026) — WO-08a added, settling the disposition of the existing AI CAD
auto-draft: retained and running, but routed through the same validation gate as every
other takeoff source, landing as unpriced draft scope with an Unresolved queue and a
hard submit gate. Invariants I-13 and I-14 added. Post-MVP AI mapping item clarified.
No architectural decision changed.
v1.4 (14 Aug 2026) — reconciled the execution copy with the current Next.js/NestJS
surface, legacy CAD scope input, Finance compatibility routes, Supabase Storage,
Redis/BullMQ, Railway workers, Vercel deployment and current work-order evidence. Removed
interactive approval/wait instructions for repository work. No tenant, audit, migration,
pricing or release safety invariant was removed.
13. Final direction
Purge the test data. Load ABI’s own process deck as the workflow engine. Build the DUPA
engine on top of the bom_line_items spine that already exists — fixing the grain, not the
name. Ship the Excel importers alongside it, because those files are simultaneously the
adoption barrier and the seed corpus. Then demonstrate the award transaction, where a
signed BOM becomes a live project with a locked budget and nothing retyped.
Do not expand statutory general-ledger scope, replace the legacy CAD scope input, or enable
unverified AI/provider cutovers. Existing Finance, Cortex and CAD evidence surfaces remain
compatibility features; new refactor work must close their documented authority and release
gates before changing ownership.
Type it once. Everything else follows.
