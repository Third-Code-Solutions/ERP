# BUILD OPS Prompt Pack v1.4

> Markdown copy extracted from `output/pdf/BUILD OPS Prompt Pack.pdf` on 2026-08-12.
> The attached PDF remains canonical for visual fidelity; this file is the repository execution copy.
BUILD OPS — Prompt Pack
Copy-paste prompts for executing the refactor
Companion to docs/PRD.md v1.4 · 14 August 2026 · Execution: Codex desktop/CLI or equivalent
How to use this pack
1. Launch from repository root. Read `AGENTS.md`, `docs/PRD.md`, and the relevant work
order. Current source, migrations, tests and timestamped release evidence are authority.
2. Execute one vertical slice at a time: inspect, edit, test, review diff, write changeset.
3. Do not stop for a conversational go-ahead on repository edits, tests, documentation or
reversible local build work. Record assumptions and evidence in the changeset.
4. For hosted data/provider operations, verify exact project/service/branch/target, dry-run,
rollback and health. If evidence is missing, mark that gate BLOCKED and continue all safe
local work; never fabricate completion.
5. Use Prompt A, then one B-series prompt. Use C-series prompts for self-review and recovery.
Text in [SQUARE BRACKETS] is for the executing agent to resolve from repository evidence.

Current source contract
- Frontend: Next.js 15 App Router with authenticated dashboard routes, public auth routes,
  client portals, server actions and compatibility API routes.
- Backend: NestJS Core under `apps/api/src`, Redis/BullMQ jobs, legacy Next adapters and
  shared Zod contracts.
- Data/storage: Supabase Postgres/Auth/Realtime/Storage, Drizzle, tenant RLS, append-only
  audit, signed object paths and additive migrations.
- Hosting: Vercel Web, Railway Core API/CAD evidence worker, Supabase and Redis. Preserve
  working modules and routes while closing refactor gaps.
A · Session kickoff — paste at the start of every session
You are a senior engineer working on BUILD OPS, a construction ERP for Actuate
Builders Inc. (ABI), a Philippine design-and-build, fit-out and MEP contractor.
The codebase is a Next.js app on Vercel, a NestJS Core API and CAD evidence worker on
Railway, with Supabase/Postgres, Storage and Redis/BullMQ infrastructure.
Read docs/PRD.md in full before writing any code or SQL.

B · Work-order prompts
Paste one of these after Prompt A. Each assumes the PRD is in context.
B-00 · CI gate
This is a REFACTOR, not a rewrite. Three schema facts were verified against the
live database and are not open for discussion:
  1. Money is BIGINT centavos; percentages are integer basis points. No floats.
  2. tenant_id is NOT NULL on all application tables, with RLS already in place.
  3. bom_line_items.id is a stable UUID already referenced by cost, budget, PO
     and RFQ records.
Therefore the relational spine already exists. The defect is GRAIN and PRICING,
not identity. Do not propose rebuilding what already works.
Hard constraints for this session:
  - Additive migrations only. No DROP COLUMN, no DROP TABLE, no re-pointing an
    existing foreign key.
  - Do NOT create a second scope model or a scope_item_id column. The legacy
    scope_items table remains a CAD compatibility input; bom_line_items is the
    commercial refactor spine. See ADR-03.
  - Do NOT expand statutory general-ledger scope. Existing Finance ledger,
    journals, cash and reconciliation routes remain compatibility surfaces while
    ABI runs SAP as book of record. See ADR-07.
  - No float, double precision, unscaled numeric, or JS number in any monetary
    path.
  - Every new table carries tenant_id NOT NULL with the matching RLS policy.
  - Every acceptance criterion ships as an automated test, not a manual check.
Before writing, record in the work-order changeset:
  (a) work order,
  (b) expected files/tables,
  (c) PRD contradictions or unknowns,
  (d) verification commands and rollback.
Then execute the smallest safe slice. Do not pause for a conversational go-ahead.
Execute WO-00 from docs/PRD.md.
Set up CI to run the full test suite on every PR, plus three static checks that
must fail the build:
  1. Any migration introducing float, double precision, or unscaled numeric on a
     column whose name matches /(cost|price|rate|amount|total|centavos|value)/
  2. Any CREATE TABLE without tenant_id NOT NULL
  3. Any record with an E2E_ prefix in a non-demo tenant

B-01 · Purge demo data
B-02 · Business days + audit
B-03 · Process & SLA engine
Write a deliberately-broken fixture for each of the three so I can see the build
fail, then remove the fixtures.
Execute WO-01 from docs/PRD.md.
The live build shows these contaminated records:
  - E2E_QA_20260513_dd8a07a1_acct1 across Accounts, Projects and Documents
  - E2E_QA_20260513_dd8a07a1_vendor1 in the production vendor picker
  - TH/RD CODE FINAL PHASE duplicated in the Pipeline LEAD column
  - Four identical PO-0002 rows in Deliveries, all with vendor "—"
Step 1: inventory every QA/E2E-seeded record and save the list before any purge.
Step 2: for the four identical PO-0002 rows — determine whether these are genuine
duplicate rows or a join fanout in the Deliveries query. Do not delete until the
row identity, references and recovery path are proven. Record the finding.
Step 3: move demo data to a dedicated demo tenant; purge from the ABI tenant.
Do not delete any record referenced by a real record without showing me the
reference first.
Execute WO-02 from docs/PRD.md.
Build a business-day service with a Philippine holiday calendar maintained as
data, not code (national regular holidays and special non-working days, editable
without a deploy). Every SLA in ABI's process deck is in business days; CX ticket
clocks are calendar hours — support both.
Then add immutable audit events on all mutable tables: actor, table, row id,
before, after, timestamp. Audit rows must be insert-only.
Tests must cover: arithmetic across a year boundary, across Holy Week, and a
range that starts on a holiday.
Execute WO-03 from docs/PRD.md.

B-04 · Grain discrimination
B-05 · Location dimension
Implement the M-06 tables and seed process_steps from ABI's SD Framework deck
(~70 steps, each with responsible BU, input, input-from, output, output-by and an
SLA in business days).
Critical distinctions:
  - INTERNAL clocks are enforceable and escalate against a BU.
  - EXTERNAL clocks (LGU permit, Building Admin vetting, client signature) are
    tracked but NEVER escalate against a BU. ABI cannot make an LGU move faster.
  - Do NOT seed any step whose owner is unresolved. The deck records one step's
    owner literally as "Commercial or SD – PM?" — leave it out and flag it.
Thresholds: at-risk 80%, breach 100%, escalate 150%.
Ship this in OBSERVE MODE: report breaches at BU level, not individual level.
Individual-level enforcement is a later, separate decision.
Execute WO-04 from docs/PRD.md. This is the first structural migration — go carefully.
Run migration M-01 on bom_line_items. Backfill the kind discriminator by UOM:
  sqm, cu.m, m2, lm, lot          -> work_item
  pc, pcs, kg, set, liters        -> material_line
  anything else                   -> review queue
Then build the review UI where an estimator confirms classification and
EXPLICITLY attaches a material line to a parent work item.
ABSOLUTE RULE: do not auto-reparent anything. Attaching a material line to the
wrong work item silently corrupts a cost hierarchy and is nearly undetectable
later. Every parent link is a human decision.
Do not enable the I-03 trigger until the review queue is empty.
Before and after the migration, assert that PO, RFQ, cost and budget row counts
AND their target ids are byte-identical. Record that comparison.
Run against an isolated replay or staging target first. Save migration SQL, dry-run,
before/after identity checks and rollback evidence before any hosted apply.
Execute WO-05 from docs/PRD.md.

B-06 · DUPA engine — the critical path
Run M-02. Parse the leading "<Room> — " prefix out of bom_line_items.description
into the project_locations table. Retain the untouched original in
description_original.
Example: "Entrance Hall - Vinyl Plank Flooring" becomes item "Vinyl Plank
Flooring" at location "Entrance Hall".
Parsing is heuristic. Anything that does not match a clean prefix pattern goes to
a review queue — do not mangle it silently.
Acceptance: a query returns total Vinyl Plank Flooring sqm across all locations
in a project. Right now that is impossible because the same item exists as three
unrelated rows across three rooms.
Execute WO-06 from docs/PRD.md. This is the heart of the refactor. Read section 4 of
the PRD twice before writing anything.
Build the engine BEFORE any UI.
Implement exactly:
  A Material   = sum(qty x unit_rate)
  B Labour     = sum(persons x hourly_rate / productivity_per_hour)
  C Equipment  = sum(units x hourly_rate / productivity_per_hour)
  D Direct     = A + B + C
  E Indirect   = OCM (800 bps of D) + Profit (700 bps of D)
  F VAT        = 1200 bps x [base per the vat_base setting]
  G Total      = D + E + F
  H Unit Rate  = G / header_quantity
Rounding: compute A-F unrounded (exact decimal or scaled integers, NEVER float).
Round half-up to centavos ONLY when persisting unit_rate_centavos and
total_cost_centavos, and when rendering.
D-1: ABI's own sheet labels row F as "12% (D+E)" but arithmetically computes 12%
of D — and only that reading makes the sheet foot. Implement vat_base as a
configurable enum defaulting to 'direct_only'. Label it honestly in the UI.
Write these two tests first, before the implementation:
TEST 1 (canonical, from ABI's MNHPI workbook):
  Item: "Stair footing concrete inc. forms", unit cu.m, header_quantity 0.10
  Material:  1.00 cu.m @ P5,951.00
  Labour:    Foreman 1.00 @ P272.02 productivity 1.00
             Skilled 1.00 @ P199.09 productivity 1.00

B-07 · BOM Builder rebuild
B-08 · Takeoff importer
             Non-Skilled 2.00 @ P173.79 productivity 1.00
  Equipment: One-Bagger Concrete Mixer, 1 unit @ P600.00/hr, productivity 0.10
  EXPECT: G = 1621750 centavos, H = 16217500 centavos, exactly.
TEST 2 (D-2 regression):
  A BOQ unit cost sourced from G instead of H must fail the build. In ABI's
  shipped MNHPI BOQ this exact error understated one line by 10x — the BOQ reads
  unit cost P16,217.50 where H is P162,175.00. This test exists so that class of
  error becomes structurally impossible.
Then build the assembly, crew, equipment, material-catalog and price-history
libraries. Changing a crew rate must recompute every DUPA that references it.
Execute WO-07 from docs/PRD.md.
Rebuild the BOM Builder as a VIEW over the new model. Do not touch the underlying
bom_line_items ids.
New structure: BOQ divisions with sub-totals -> work items with DERIVED unit
rates -> DUPA detail behind progressive disclosure.
Keep (these instincts are correct): version numbering, "Submit for Client
Approval", the supplier switcher panel, the pricing-breakdown chips.
Remove: the editable UNIT COST field wherever unit_rate_source='dupa', and the
line-level MARKUP % input. The current form defaults MARKUP % to 30 and the whole
BOM prices at exactly x1.30 — that is what we are eliminating.
Fix: the supplier switcher currently reports "No rate cards match this line" on
every AI-drafted row because it joins on description text. Join on
catalog_item_id instead.
Fix: the pricing-breakdown chips currently read RAG 0 / Catalog 0 / Manual 0 /
Unpriced 0 against 13 lines. They must report real state.
Execute WO-08 from docs/PRD.md.
Build a GENERIC structured-takeoff importer. Togal is one producer among several,
never a dependency.

B-08a · Existing AI CAD auto-draft disposition
Flow: file -> preview -> saved column-mapping profile per source -> validation
(UOM recognised? division assigned? duplicate detected?) -> UPSERT into
bom_line_items keyed on (takeoff_import_id, source_row_key).
Bind every imported line to a drawing_revision_id.
THE BLOCKING TEST (I-10): assign a vendor to an imported line, re-run the same
import, and the vendor assignment must survive. Delete-and-reinsert on re-import
would orphan every downstream PO — if your implementation does that, it is wrong.
Manual entry must remain available as a fallback at all times.
Execute WO-08a from PRD.md, immediately after WO-08.
The build already ships "Auto-drafted from CAD upload". It stays. Do not delete
it and do not switch it off.
What changes: its output stops being a priced BOM line and becomes one more
producer feeding the same pipeline as any other takeoff source.
  1. Route AI output through the IDENTICAL validation gate as WO-08. No
     privileged path because the model was confident.
  2. Land AI rows as kind='work_item' in draft state, with NO unit rate and
     unit_rate_source='manual'. An extracted description is scope candidate, not
     a price.
  3. Every row failing validation goes to an UNRESOLVED QUEUE with a stated
     reason: no UOM match / no division / no catalog match / quantity defaulted.
     Nothing is silently accepted.
  4. Retain the AI provenance tag plus source model, drawing revision and
     extraction timestamp. This is the evaluation corpus for the post-MVP
     mapping layer — do not discard it.
  5. HARD GATE: a BOM cannot be submitted for client approval while its
     Unresolved queue is non-empty.
Do NOT build the AI mapping layer here. Description normalisation, UOM
inference, automatic division assignment and assembly matching are post-MVP.
The current failure mode you are fixing: a line sits at qty 1, vendor
unassigned, "No rate cards match this line", and looks finished. It is not
finished. Make that visible.
Acceptance: re-running extraction over the same drawing revision upserts, does
not duplicate, does not clear vendor assignments, and never overwrites a line
that already has a DUPA.

B-09 · Excel importers
Execute WO-09 from docs/PRD.md.
Build importers for ABI's real Excel templates: PPRF, SI Report, BOQ/BOM, BOE,
Level 1 Master Schedule. Use files under `fixtures/abi/` when present. If a real
template is absent, keep the importer contract and rejected-row behavior testable,
do not fabricate ABI workbook evidence, and mark the real-template acceptance BLOCKED.
This is the adoption strategy, not a migration chore. ABI's entire operating
history lives in files named like Project_PPRF_Ver3_11082024.xlsx and
Project_BOE_Ver2_11062024.xlsx. A system they cannot load these into will be
worked around rather than worked in.
Importing historical BOEs must seed the assembly, crew and material libraries —
that is what makes the DUPA engine fast on day one.
Every importer needs: preview, column mapping, validation, and a rejected-rows
report. Nothing imports silently. Every skipped row is shown to the user with a
reason.
B-10 · RFQ to price history
Execute WO-10 from docs/PRD.md.
Capture supplier quotes as structured lines rather than attachments. Build the
price comparison matrix. Write quoted and awarded prices to price_history with
vendor and date.
Surface suggestions inside the DUPA material line, always showing source and
date. Any rate older than 90 days renders with a staleness warning.
This closes the loop that currently runs through email: Procurement issues RFQs
to support Commercial's BOM generation, quotes come back as attachments, and
prices get retyped into the BOE.
B-11 · PPRF + KYC gate
Execute WO-11 from docs/PRD.md.
Build the structured PPRF form. Submitting it creates Client + Opportunity in one
action — this replaces the versioned PPRF spreadsheet.
Then the KYC gate, which is TWO independent tracks with separate 2-day clocks:

B-13 · Award automation
B-15 · RFPO to PO to commitment
  - Financial Evaluation Report: Finance-GA produces, FC recommends, President
    approves
  - Credit Investigation Report: Finance-AR produces, FC notes, President
    endorses
Inputs: AFS current year + previous 2 years, BIR Certificate 2303, VAT
exempt/zero-rated certification, KYC including top 10 suppliers and top 10
clients.
Keep the existing KYC Queue UI — the gating concept there is already right. An
opportunity cannot advance past Site Survey until both tracks clear.
Execute WO-13 from docs/PRD.md. This is the demo moment — build it to be shown.
Trigger: signed BOM uploaded.
In ONE atomic transaction, create:
  - Project (with Project Code)
  - Budget baseline from the approved BOQ
  - Cost codes from the BOQ divisions
  - AR Code request to Finance-AR (2 day clock)
  - DP invoice draft (2 day clock)
  - CARI / bond task (5-10 day clock)
  - Project Tracker (2 day clock from NTP)
  - CX onboarding task (7 days after NTP)
Zero fields retyped between the signed BOM and the live project. The transaction
must be atomic and reversible.
Today this hand-off is where ABI loses the most time and accuracy — the project
identity gets created three separate times across PPRF, BOM and AR/Project code.
Execute WO-15 from docs/PRD.md.
DO NOT rewrite the existing PO module. Its approval timeline (Draft -> PM
approved -> Commercial approved -> SCM issued -> Supplier notified) and its PH
tax handling (12% VAT, 2% withholding) are the best-built parts of the system.
Carry them forward unchanged.
Add on top:

B-16 · Permits and mobilization gate
B-17 · Cost control
  - The RFPO stage (Commercial endorses to Procurement with approved finishes and
    specs)
  - Delegation-of-Approval routing by amount band [PASTE ABI MATRIX HERE]. Until ABI
    supplies the matrix, use the configurable PRD default and keep production cutover
    disabled with an explicit reason.
  - Commitment against budget_lines, joined on bom_line_item_id
Issuing a PO must reduce remaining allowable on the cost code. A PO that would
exceed allowable warns before submission.
Execute WO-16 from docs/PRD.md.
Permit types: LGU building permit, Building Admin vetting (15 d), DOLE,
Occupancy Permit, CARI, and performance/surety/construction bonds tracked through
to REFUND.
Each carries: responsible person, submitted date, expected return, actual return,
live countdown, escalation.
LGU duration is contested in ABI's own documents — the process deck says 45-60
days, a live project schedule shows 30. Model it as min/expected/max PER LGU and
learn from actuals. Do not hardcode.
The headline feature is the MOBILIZATION READINESS GATE: a single tile showing
the four external returns as done/waiting with days-at-risk —
  1. Commented FCD from Building Admin
  2. PO copies from Procurement
  3. CARI from Finance
  4. NTP from Building Admin
Mobilization cannot be marked started until all four land, or an authorised
override is logged with a reason and an actor.
Execute WO-17 from docs/PRD.md.
Build: Budget -> Committed (POs) -> Actual (PO-invoiced) -> Remaining -> Variance
-> Live margin. Drilldown by cost code. Every join is on bom_line_item_id.
Acceptance for this one is a HUMAN sign-off, not a test: Commercial must confirm
the live margin on a running project matches their own spreadsheet. Build it so
that comparison is easy to make — show the workings, not just the number.

B-18 · Management dashboard
Execute WO-18 from docs/PRD.md.
Keep the existing metric selection — Active Pipeline TCV, Active GP, blended
margin, Weighted Pipeline, Closed Won FYTD are the right metrics at the right
altitude.
Add: margin by project with variance, cost variance against budget, permit
exposure, unsigned-VO exposure, and SLA breaches by BU.
Target: the President runs the Monday meeting from this screen without opening
Excel.
C · Control prompts
C-1 · Drift reset — use the moment a session starts wandering
C-2 · Migration review — run before any migration touches an isolated or hosted target
Stop. You are drifting from the PRD.
Re-read the constraints in AGENTS.md and docs/PRD.md and record this self-audit before continuing:
  1. This is a refactor. bom_line_items.id is a stable UUID already referenced by
     cost, budget, PO and RFQ. It stays.
  2. No second scope model. Legacy scope_items stays compatibility-only; no scope_item_id column.
  3. Additive migrations only. No DROP. No foreign key re-pointed.
  4. No new statutory general-ledger expansion.
  5. No float in any monetary path.
Discard whatever you just produced and restart the current work order from
the text in docs/PRD.md. Do not attempt to repair drifted output — repaired drift is harder
to review than fresh work.
Review this migration against the PRD and answer each point explicitly in the changeset:
  1. Is it purely additive? List every ALTER and CREATE.
  2. Does it DROP anything, or re-point any existing foreign key?
  3. Does every new table have tenant_id NOT NULL and a matching RLS policy?
  4. Does any new monetary column use anything other than BIGINT centavos?
  5. What breaks if this runs twice? Is it idempotent?

C-3 · Work-order sign-off
Work order [WO-NN] is claimed complete. Verify it against the PRD:
  1. List each acceptance criterion from the PRD for this work order.
  2. For each, name the test that proves it and link the test.
  3. Any criterion without an automated test is NOT met — say so plainly.
  4. Which of the §6 invariants does this work order touch, and are they still
     enforced?
  5. What did you change that the PRD did not ask for? Justify each item.
Be adversarial. I would rather find a gap now than after the next work order
builds on it.
C-4 · Estimator design review — for WO-06 and WO-07
C-5 · Assumption ledger
Before implementation, list every assumption not explicit in the PRD. Classify each as
cheap or expensive to reverse. Proceed on reversible defaults, make expensive choices
configurable, and mark acceptance gates BLOCKED when evidence is missing. Do not invent
ABI policy or silently convert an unknown into a production fact.
  6. What is the exact rollback? Write it out.
  7. Which downstream tables reference the rows this touches, and how do I prove
     those references are unchanged after it runs?
Answer all seven. Do not summarise.
I am about to show this to an ABI estimator who currently builds ~55 Detailed
Unit Price Analysis sheets per project by hand in Excel.
Walk me through the exact click path for building one DUPA for a suspended
ceiling, mineral fibre 600x600, 120 sqm, using the assembly library.
Count the keystrokes and the clicks. Compare honestly against doing it in Excel.
If it is not faster than Excel, tell me that plainly and tell me where the time
is going. The MVP does not launch unless this is faster.

D · The five questions to send ABI today
These block work orders. They take days to come back, so send them before you start
coding.
To Commercial:
1. In our Detailed Unit Price Analysis sheets, row F is labelled “12% (D+E)” but the
arithmetic computes 12% of D only. Which is intended? It changes every unit rate by
about 1.4%. (Blocks WO-06.)
2. Are the 8% overhead/contingency and 7% profit figures ABI policy, DPWH
convention, or specific to that client? (Affects defaults.)
3. Who owns keeping crew rates and material prices current, as a named standing
responsibility? (Blocks WO-06 sign-off.)
To Management / Finance:
4. We need the current ABI Delegation of Approval matrix — amount bands, approver
roles, sequence, and escalation. (Blocks WO-15.)
To whoever holds the templates:
5. We need live copies of: PPRF, SI Report, BOE, BOQ, Milestone Definition, Project
Tracker, Allowable Budget Form, Interim Payment Certificate, Level 1 Master Schedule
— and one real Togal export. (Blocks WO-09 and the Togal mapping.)
E · Suggested sequencing over calendar time
WeeksWork orders Why grouped
0 Pre-flight (§0.3), send §D
questions Answers take days; start the clock
1 WO-00, WO-01, WO-02 Foundation and credibility. Fast wins
2–3 WO-03 SLA engine — everything later inherits it
3–4 WO-04, WO-05 The two structural migrations. Staging first
4–7 WO-06 The critical path. Do not compress this
6–8 WO-09 (parallel with WO-06)Seeds the libraries WO-06 needs

7–9 WO-07, WO-08 UI and intake over the new model
9–10 WO-10, WO-11, WO-12 Commercial loop closes
10–11WO-13 Demo to management here
11–13WO-14, WO-15, WO-16 Budget, procurement, permits
13–15WO-17, WO-18 Cost truth and the dashboard
15 MVP success test (§12.12) Estimator faster than Excel, or do not
launch
Roughly 15 weeks to MVP with a small team. WO-06 is the item most likely to slip and the
item least worth rushing.
F · The one test that decides everything
Everything in the PRD and this pack exists to make one sentence true on launch day:
An ABI estimator produces a complete, client-presentable BOQ and BOE faster in
BUILD OPS than in Excel.
If that is false, do not launch. Fix the DUPA engine and the Excel importers, and test again.
