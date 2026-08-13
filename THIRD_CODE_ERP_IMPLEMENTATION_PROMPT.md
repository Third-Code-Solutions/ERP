# ABI OPS + Cortex — Master Implementation Prompt (`/goal`)

> **What this is.** A single, self-contained directive to build **ABI OPS** (the construction operations system described by `CLAUDE.md`/PRD-CERP-001) **and** **Cortex** (its enterprise AI Brain). Written to be run by an autonomous coding agent *and* read by a human-led team. Paste the **§0 GOAL** block as your `/goal`; everything below it is the binding spec the goal points to.
>
> **Source of truth.** `CLAUDE.md` (PRD-CERP-001) governs the ERP. This document governs *how* it gets built and adds the **Cortex AI Brain** layer. Where they conflict, raise it — do not silently diverge.
>
> **Standard of craft.** Silicon-Valley senior-team quality: typed end-to-end, tested, observable, accessible, secure-by-default, and shippable in vertical slices. No throwaway scaffolding presented as done. Philippine market and compliance are first-class, not bolted on.

---

## §0 GOAL (paste this as `/goal`)

```
GOAL: Ship ABI OPS — a multi-tenant construction ERP for Philippine MEP/fit-out
firms (CAD→Cost pipeline, sales pipeline, execution, PH compliance) — WITH Cortex,
an enterprise AI Brain that can see and reason over EVERYTHING in the ERP
(employees, schedules, tasks/todos, announcements, pipelines, projects, BOMs, POs,
invoices, documents, audit) through one permissioned, fully-trackable
knowledge+operations graph.

NON-NEGOTIABLES
1. Multi-tenant from line 1: tenant_id + Postgres RLS on every table; prove
   isolation with automated tests before any feature ships.
2. Professional RBAC, PH-org-aware: roles × permissions × scope, deny-by-default,
   enforced in DB (RLS), API (guards), and UI (capability flags). Cortex obeys the
   SAME RBAC as the human who invoked it — it can never reveal what the user can't.
3. Everything is trackable. Every entity, edge, decision, AI answer, and mutation
   has provenance + bi-temporal history + append-only hash-chained audit. This is
   the "better than Obsidian" mandate (see §5): no orphan knowledge, no stale links,
   no unsourced AI claims.
4. PH compliance by schema: BIR (2307, VAT, invoice series), retention/progress
   billing, PCAB, withholding tax, Data Privacy Act (RA 10173). Built in, not added.
5. Build in vertical slices, each independently shippable, each with tests +
   observability + docs. Definition of Done in §8 is the gate. Don't advance a phase
   until its slice is green.
6. AI is governed: deny-by-default tool access, human-in-the-loop for any mutation,
   redact PII before external LLMs, cite sources on every answer, log every prompt.

BUILD ORDER: Phase 0 Foundation → 1 Core ERP → 2 CAD/BOM → 3 Execution →
4 Cortex AI Brain → 5 Mobile/Field. Cortex's read-graph foundation is laid in
Phase 0–1 (the graph mirrors ERP tables as they're built) and activated in Phase 4.

ROLE LENSES (use only when the work needs them — see §3): PM/Program, Solutions
Architect, Backend Tech Lead, QA Lead, DevOps/Platform, Business Analyst, UX/UI,
Tech Writer, Foundation/Platform Eng, Integration Eng, QA Eng, Maintenance Eng,
DevOps/Security Eng.

STACK: Next.js 15 (App Router) · TypeScript · shadcn/ui + Tailwind v4 · React Query
+ Zustand · tRPC · Drizzle · Supabase (Postgres + RLS + Realtime + Auth + Storage +
pgvector) · Inngest · Railway+Python (ezdxf DXF parser, RAG indexer) · OpenAI +
Anthropic · Vercel. Monorepo: pnpm + turbo, structure per PRD §9.

DONE = every Phase slice passes §8 acceptance + §9 verification, RLS isolation and
RBAC tests are green, Cortex answers are sourced and permission-scoped, CI is green,
runbooks exist. Stop and ask before deviating from CLAUDE.md.
```

---

## §1 Mission & Why It Must Be Excellent

Build the operating system for a Philippine construction firm: one record per project from first lead to final BIR-compliant invoice, no external spreadsheets, real-time leadership visibility, and a CAD→Cost pipeline that turns a DXF drawing into a reviewable estimate in under 4 hours. On top of that operational spine, build **Cortex**: an enterprise AI Brain — in the spirit of an "AI-Native Company Brain" — that sees across the whole company graph (people, projects, pipeline, schedule, tasks, announcements, money, documents) and answers, drafts, and proposes actions *within each user's permission boundary*, always citing its sources.

The bar is a senior Silicon-Valley product team's: it is typed, tested, observable, accessible, and secure by default; it ships in slices a pilot client can use; and it treats Philippine compliance and a Philippine org structure as the design center, not a localization afterthought.

---

## §2 The Two Pillars

**Pillar A — ABI OPS.** Exactly the product in `CLAUDE.md`: Auth/multi-tenancy, Project Workspace, Sales Pipeline (Coverage + Conversion), Executive Dashboard, Document Management, DXF Parser, Auto-Scope, BOM Builder, Procurement, Cost Tracking, Progress Billing, RAG/AI estimating, and (later) Mobile/Field. Honor the data model (§8.4), audit hash-chain (§8.5), security layers (§10), and UI system (§12) of the PRD.

**Pillar B — Cortex AI Brain.** A cross-ERP intelligence layer. Not a chatbot bolted on the side — a *system of record for knowledge and operations* that mirrors every ERP entity into a typed, permissioned, fully-trackable graph, then exposes named domain agents (§6) over it. Cortex is what makes the ERP feel like it has a memory and a point of view, while never leaking across tenants or above a user's role.

The two pillars share one database, one auth model, one RBAC model, and one audit spine. Cortex never gets a privileged backdoor: it reads and writes through the same RLS and RBAC as a human.

---

## §3 Operating Model — Hybrid Human + Agent, with Role Lenses

This prompt is executable by an autonomous agent and legible to a human team. Work proceeds as **vertical slices**. For each slice, adopt the **role lenses** the work actually requires — do not spin up ceremony you don't need. A lens = the responsibilities, deliverables, and review checklist that role owns for that slice.

| Lens | Owns | Produces (per slice) |
|---|---|---|
| **Project / Program Manager** | Slice scoping, sequencing, dependency tracking, "is this shippable" call | Slice plan, acceptance checklist, status in Cortex (dogfood) |
| **Solutions Architect** | System boundaries, data model, contracts between services, ADRs | ADR, interface/Zod schema, sequence diagram |
| **Backend Tech Lead** | tRPC routers, Drizzle schema, RLS policies, business logic | Typed endpoints + migrations + policy tests |
| **QA Lead** | Test strategy, coverage gates, critical-path E2E | Test plan, gate config, E2E suite |
| **DevOps / Platform Lead** | Monorepo, CI/CD, environments, IaC, release process | Pipelines, preview deploys, runbooks |
| **Business Analyst** | PH workflow correctness (BIR, retention, PCAB), persona fit | Requirements traceability, BIR/retention test cases |
| **UX / UI Designer** | Screens per PRD §12, dense data UX, a11y | Component specs, states (loading/empty/error), a11y pass |
| **Technical Writer** | Runbooks, ADRs, API docs, in-app help | `/docs/*`, README, runbooks |
| **Foundation / Platform Eng** | Auth, tenancy, RLS scaffolding, shared packages | `packages/*`, auth, base policies |
| **Integration Eng** | DXF parser, RAG indexer, accounting export, email | Railway workers, webhooks, adapters |
| **QA Eng** | Unit/integration tests, fixtures, seed data | Test suites, factories, seeds |
| **Maintenance Eng** | Bug triage, perf, tech-debt burndown, dependency hygiene | Fixes, perf budgets, Dependabot/Snyk triage |
| **DevOps / Security Eng** | Threat model, secrets, RLS audits, SAST/DAST, incident response | Security-scan CI, gitleaks/semgrep/trivy, threat-model doc |

**Rule:** when a slice doesn't need a lens, omit it. When it does, the lens's review checklist is part of that slice's Definition of Done. A human can pick up any lens; an orchestrated multi-agent setup can assign one agent per lens.

---

## §4 Build Order (Phases & Vertical Slices)

Follow the PRD roadmap; lay Cortex's *read-graph* from the start so it's never a retrofit.

**Phase 0 — Foundation (incl. Cortex substrate).** Monorepo (pnpm+turbo, structure per PRD §9), CI/CD, Supabase project, Drizzle schema for `tenants`/`users`/`memberships`, RLS + isolation tests, Auth (email/password + Google OAuth), RBAC primitives (§7), append-only hash-chained `audit_log`, and the **Cortex graph substrate**: `cortex_nodes`, `cortex_edges`, `cortex_provenance`, change-feed plumbing (§5). *Gate:* User A cannot see User B's data (test); audit chain verifies; graph mirrors a seeded project.

**Phase 1 — Core ERP.** Project Workspace, Sales Pipeline (Coverage + Conversion with stages), Executive Dashboard (KPI cards, per-rep scorecard, stage distribution, real-time via Supabase Realtime), Document Management. Every mutation emits a graph event so Cortex's mirror stays live. *Gate:* a rep can run a deal from Coverage → Closed Won; dashboard updates in real time; every change is in the graph + audit.

**Phase 2 — CAD Integration.** DXF parser worker (Railway/Python/ezdxf, R12–2024, 100MB/file), auto-scope extraction with confidence scores, BOM Builder (diff view, line overrides with reason logging, unit-cost library, markup rules, lock states tied to stage). *Gate:* drop DXF → draft BOM with confidences in < 5 min; estimator override logged; BOM feeds graph.

**Phase 3 — Execution.** Procurement (PO from approved BOM, vendors, approvals, delivery), Cost Tracking (actual vs budget, per-floor rollup, GP-erosion alerts), Progress Billing (milestones, 10% retention, BIR 2307, withholding tax, BIR-compliant invoice series). *Gate:* PO→receive→bill→2307 round-trips; retention computes; invoice series is gapless.

**Phase 4 — Cortex AI Brain (activation).** Turn the live graph into intelligence: hybrid retrieval (vector + graph + keyword), named domain agents (§6), conversational query with citations, AI estimating assistant, eval harness (PRD §11.4), cost controls. *Gate:* every agent answer is permission-scoped + sourced; eval gates block regressions; no PII to external LLMs unredacted.

**Phase 5 — Mobile / Field.** Read-first mobile (Expo) for site PMs: BOM access, PO status, milestone alerts, photo-to-scope, QR material receipt. *Gate:* offline read works; writes sync with audit.

---

## §5 The "Better Than Obsidian" Mandate — A Fully Trackable Knowledge + Operations Graph

The user's directive: Cortex must be a company brain *like Obsidian, but it sees everything in the ERP* — and it must **solve Obsidian's problems**. Obsidian is loved for its linked-knowledge graph but fails as an enterprise brain. Cortex must fix each failure explicitly:

| Obsidian's problem | Cortex's requirement |
|---|---|
| Local files, manual sync, single-user | Server-side, multi-tenant, real-time multi-user over Supabase (Postgres + Realtime). |
| No permissions — every note readable | **RBAC + RLS on every node and edge.** Cortex shows a user exactly what their role allows, nothing more. |
| Unstructured markdown, no schema | **Typed nodes & typed edges** with validated schemas (Zod). Entities are first-class, not free text. |
| Backlinks are manual and rot | **Edges are derived automatically** from ERP relationships (project→BOM→PO→invoice; employee→task; rep→opportunity) and kept live by the change-feed. No manual linking, no dead links. |
| No live/operational data | The graph **mirrors live ERP tables**: pipelines, schedules, tasks/todos, announcements, costs — current as of the last mutation. |
| No history / no provenance | **Bi-temporal + provenance on everything:** every node/edge records *valid time* (when it was true in the business) and *transaction time* (when the system learned it), plus its source (which mutation, which user, which document, which AI run). |
| No audit, editable history | **Append-only, hash-chained audit** (SHA256 chain per PRD §8.5). History cannot be rewritten, even by admins. |
| No automation / no agents | **Named domain agents** (§6) read and *propose* writes through guardrails. |
| Search is text-only | **Hybrid retrieval:** pgvector semantic + graph traversal + keyword, fused and re-ranked. |
| Knowledge goes stale | **Freshness + lineage tracking:** each node carries last-verified time and upstream lineage; stale nodes are flagged, not silently trusted. |
| Claims are unsourced | **Every Cortex answer cites node/edge IDs** and links back to the ERP record. "I don't know" is a valid, required path when retrieval is weak. |

**Graph substrate (build in Phase 0):**

```
cortex_nodes(
  id, tenant_id, node_type,        -- employee|project|opportunity|bom|bom_line|
                                   --  po|invoice|task|announcement|schedule_event|
                                   --  document|vendor|cost_line|milestone|...
  ref_table, ref_id,               -- pointer to the canonical ERP row (source of truth)
  title, summary, attributes JSONB,
  valid_from, valid_to,            -- bi-temporal: business validity
  recorded_at,                     -- bi-temporal: when system recorded it
  last_verified_at, freshness,     -- staleness tracking
  embedding vector(1536),          -- for semantic retrieval (RLS-scoped)
  created_by, created_at
)
cortex_edges(
  id, tenant_id, src_id, dst_id, edge_type,   -- owns|assigned_to|bills|supplies|
                                              --  blocks|derived_from|mentions|...
  weight, attributes JSONB, valid_from, valid_to, recorded_at, provenance_id
)
cortex_provenance(
  id, tenant_id, subject_kind, subject_id,    -- node|edge|answer
  origin,                                      -- mutation|document|ai_run|import
  origin_ref, actor_id, prev_hash, hash, created_at   -- chained
)
```

The canonical data stays in the ERP tables (single source of truth, per PRD §8.4). The graph is a **derived, permissioned, queryable projection** kept live by ERP mutation events (Postgres triggers → Realtime → indexer). Cortex reasons over the graph; it writes back only through normal ERP mutations under RBAC + human approval. Nothing in the graph escapes RLS.

---

## §6 Cortex Agent Registry (Named Domain Agents)

Conducting.ai's pattern is "name an agent per domain, give each a scope, tools, governance and risk overlay." Adapt it to construction. Each agent is **read-by-default**; any write is a *proposed action* requiring the human's RBAC permission and explicit approval. All share one retrieval layer, one RBAC, one audit.

| Agent | Sees (scoped by RBAC) | Does (read) | Proposes (write — needs approval) | Primary roles served |
|---|---|---|---|---|
| **Atlas** (Orchestrator) | The whole graph the user may see | Routes a question to the right specialist agent; composes multi-domain answers with citations | — | All |
| **Quanto** (Estimating) | DXF text, scope items, BOMs, unit-cost library, similar past projects | "What did we charge for this last time?"; surfaces 3–5 similar projects | Draft BOM lines w/ historical unit costs + confidence | Estimator |
| **Pulse** (Pipeline) | Coverage/Conversion, stages, weighted forecast, per-rep | Deal velocity, stalled deals, forecast vs actual | Stage-change suggestions, follow-up reminders | BDM/Sales, CFO |
| **Forge** (Procurement) | Approved BOMs, vendors, POs, deliveries | PO status, late deliveries, vendor history | Draft PO from BOM; reorder flags | Procurement, PM |
| **Ledger** (Billing/Finance) | Milestones, retention, invoices, 2307, WHT, GP | GP-erosion alerts, billing due, retention held | Draft progress invoice + 2307; never auto-files | CFO, Compliance |
| **Crew** (People/HR & Scheduling) | Employees, roles, schedules, task/todo assignments, availability | "Who's free / on which site this week?"; workload balance | Draft schedule/task assignments | PM, Owner, HR |
| **Herald** (Comms & Knowledge) | Announcements, activity feed, comments, @mentions, docs | Summarize "what changed this week" per project/role; answer "where is X documented" | Draft announcement; route @mentions | All |
| **Warden** (Compliance & Audit) | Audit log, BIR/PCAB/DPA artifacts, access reviews | Audit-readiness checks, anomaly flags, data-subject-request assist | Compile audit packet (read-only export) | Compliance, Auditor (read-only) |

Cross-cutting: **every agent must** cite sources (node/edge IDs → ERP links), return confidence, refuse cross-tenant or above-role data, redact PII (TIN/SSS/addresses/salaries) before any external LLM, log prompt+context+response for audit, and offer an "I don't know — retrieval weak" path. Mutations route through the human's RBAC; Cortex has no privileged write path.

---

## §7 RBAC — Philippine-Grade, Professional, Deny-by-Default

RBAC is enforced in **three layers that must agree**: Postgres RLS (data), tRPC guards (API), UI capability flags (presentation). Model is **Role → Permissions (capabilities) → Scope**, deny-by-default, with field-level masking for PII.

**Roles** (PRD personas → org roles): `owner`, `admin`, `cfo`, `estimator`, `sales_bdm`, `project_manager`, `procurement`, `compliance_officer`, `hr`, `viewer`, `external_auditor` (read-only, time-boxed). Roles are *per tenant membership*; a user may hold different roles in different tenants.

**Capabilities** (examples — full matrix in Appendix A): `project.read/write`, `opportunity.read/write/advance_stage`, `bom.read/edit/approve/lock`, `cost.read`, `billing.read/create_invoice/file_bir`, `po.create/approve`, `employee.read/manage`, `schedule.read/assign`, `announcement.read/post`, `audit.read`, `pii.view`, `cortex.query`, `cortex.act` (may approve agent-proposed writes within their other capabilities).

**Scope** narrows a capability to data: `own` (records the user owns), `team` (their reports/region), `project:{id}`, `tenant`. Example: a BDM has `opportunity.write@own`, a PM has `project.write@project:{assigned}`, a CFO has `billing.*@tenant`, an external auditor has `*.read@tenant` minus `pii.view` for a fixed window.

**PH-specific rules.** PII fields (TIN, SSS, PhilHealth, Pag-IBIG, addresses, salaries) require `pii.view` and are KMS-encrypted + masked by default — surfaced only to roles with explicit grant, logged on every reveal (RA 10173 / Data Privacy Act). `billing.file_bir` is segregated from `bom.approve` (separation of duties). MFA mandatory for `owner`, `admin`, `cfo`, `compliance_officer`. Quarterly access review is a built-in workflow, not a calendar reminder.

**Cortex & RBAC.** Cortex resolves the caller's effective capabilities + scope, applies them to *both* retrieval (it can only embed/return nodes the user may read) and action (it can only propose writes the user could perform). An agent answer can never include a node the requesting human couldn't open directly. This is tested: a `viewer`'s Cortex query must not surface a CFO-only GP figure.

---

## §8 Definition of Done (Acceptance Gates)

A slice is **done** only when all that apply are true:

1. **Multi-tenancy proven** — automated test shows tenant A ⊄ tenant B for every new table; RLS policy exists and is covered.
2. **RBAC enforced 3 ways** — DB (RLS), API (guard), UI (capability flag) agree; a negative test proves an under-privileged role is denied at the API even if the UI is bypassed.
3. **Typed end-to-end** — `tsc --noEmit` clean across packages; Zod validation on every endpoint; Drizzle migration committed.
4. **Tested** — unit ≥ 80% lines / 70% branches; critical paths (auth, billing, BOM mutations, RLS, Cortex permission-scoping) at 100%; integration tests against a Supabase test instance; E2E for the user journey the slice delivers (PRD §13.2).
5. **Observable** — structured logs with trace IDs, Sentry wired, key metrics (API p95 < 400ms target) emitted.
6. **Accessible** — WCAG 2.1 AA: keyboard paths, ARIA on icon buttons, visible focus, contrast verified; loading = skeleton, plus empty + error states.
7. **Trackable** — every mutation lands in the hash-chained audit *and* the Cortex graph with provenance; verifiable within 5 seconds (PRD §13.2 #8).
8. **PH-correct (where relevant)** — BIR/retention/PCAB/DPA behaviors covered by BA-authored test cases.
9. **Cortex-correct (Phase 4+)** — answers are permission-scoped + cited; eval harness (Recall@5, MRR, faithfulness, latency) passes its gates; PII redaction verified before external LLM calls.
10. **Documented** — ADR for non-obvious decisions, runbook for any production-impacting service, in-app help where a persona needs it.
11. **CI green** — lint, typecheck, unit, integration, E2E, and the security suite (gitleaks, semgrep, snyk, trivy) all pass; production deploy needs 2 approvals.

---

## §9 Verification (Prove It, Don't Claim It)

For each slice, *demonstrate* correctness, don't assert it:

- **RLS/RBAC:** run the isolation + privilege-escalation test suite; paste results. A red here blocks the slice.
- **Compliance math:** unit-test retention (10% configurable), VAT (12%), withholding, and gapless invoice series with worked PH examples.
- **Cortex grounding:** for a sample of queries, assert every cited node is (a) real, (b) within the caller's scope, (c) actually supports the claim; assert the "I don't know" path fires on weak retrieval.
- **Audit integrity:** recompute the hash chain over a window and prove no gaps/edits.
- **Performance:** measure API p95 and DXF parse time against PRD SLOs; record in the slice report.
- **Accessibility:** automated axe pass + one manual keyboard/screen-reader run on the slice's primary screen.
- **High-stakes slices** (auth, billing, RLS, Cortex permissioning): run an independent review pass (second agent or human reviewer) before merge.

---

## §10 Guardrails (Security, Compliance, AI Governance)

**Security** (PRD §10): RLS everywhere; Drizzle parameterized queries (no string SQL); CSP/HSTS/X-Frame headers; httpOnly+secure+sameSite cookies; MFA for privileged roles; secrets server-only (1Password/Vercel/Railway env, quarterly rotation); file uploads validated (magic bytes + AV scan + sandboxed parser); Cloudflare WAF + rate limits.

**Compliance** (PRD §14): BIR (invoice series, 12% VAT, 2307, books of accounts, e-invoice readiness), PCAB (license + category limits), RA 10173 (DPO, consent, data-subject-request workflow, 72-hour breach process), retention/progress-billing/liquidated-damages.

**AI governance** (PRD §11.3 + a conducting.ai-style risk overlay): deny-by-default tool access; human-in-the-loop for every mutation; strict context boundaries (user input never overrides system prompts — prevent prompt injection); no cross-tenant citations; redact PII before external LLMs; per-tenant token budgets with soft/hard limits; prompt+response logging for audit; an eval harness that **blocks deploy** on retrieval/faithfulness/latency regressions. Maintain a lightweight risk register per agent (data sensitivity, failure modes, mitigations) mapped to RA 10173 and, where relevant, recognized AI-risk frameworks.

---

## Appendix A — RBAC Capability × Role Matrix (starter; extend per slice)

Legend: ✓ = full · S = scoped (own/team/project) · R = read-only · — = denied · ⛔PII = requires `pii.view`

| Capability | owner | admin | cfo | estimator | sales_bdm | project_manager | procurement | compliance | hr | viewer | ext_auditor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| project.read | ✓ | ✓ | ✓ | ✓ | S | S | S | R | R | R | R |
| project.write | ✓ | ✓ | — | S | — | S | — | — | — | — | — |
| opportunity.read | ✓ | ✓ | ✓ | S | S | R | — | R | — | R | R |
| opportunity.write / advance_stage | ✓ | ✓ | — | — | S | — | — | — | — | — | — |
| bom.edit | ✓ | ✓ | — | S | — | R | — | — | — | — | — |
| bom.approve / lock | ✓ | ✓ | — | — | — | — | — | — | — | — | — |
| cost.read | ✓ | ✓ | ✓ | R | — | S | R | R | — | — | R |
| billing.create_invoice | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — |
| billing.file_bir | ✓ | — | ✓ | — | — | — | — | R | — | — | — |
| po.create | ✓ | ✓ | — | — | — | S | ✓ | — | — | — | — |
| po.approve | ✓ | ✓ | ✓ | — | — | — | — | — | — | — | — |
| employee.manage | ✓ | ✓ | — | — | — | — | — | — | ✓ | — | — |
| schedule.assign | ✓ | ✓ | — | — | — | S | — | — | S | — | — |
| announcement.post | ✓ | ✓ | ✓ | — | S | S | — | — | S | — | — |
| audit.read | ✓ | ✓ | ✓ | — | — | — | — | ✓ | — | — | R |
| pii.view | ⛔ | ⛔ | ⛔ | — | — | — | — | ⛔ | ⛔ | — | — |
| cortex.query | S | ✓ | ✓ | S | S | S | S | S | S | S | S |
| cortex.act (approve agent writes) | ✓ | ✓ | S | S | S | S | S | — | S | — | — |

`cortex.query` scope always equals the union of that role's read scopes — Cortex can never widen access.

## Appendix B — Cortex Node & Edge Type Catalog (starter)

**Node types:** `employee`, `project`, `opportunity`, `scope_item`, `bom`, `bom_line`, `vendor`, `purchase_order`, `po_line`, `invoice`, `invoice_line`, `milestone`, `cost_line`, `task`, `announcement`, `schedule_event`, `document`, `change_order`, `audit_event`.

**Edge types:** `owns`, `assigned_to`, `member_of`, `part_of`, `derived_from`, `bills`, `supplies`, `pays`, `blocks`, `depends_on`, `mentions`, `scheduled_for`, `approved_by`, `superseded_by`, `references_doc`.

Each node/edge carries: `tenant_id`, `valid_from/valid_to`, `recorded_at`, `provenance_id`, RLS scope. Edges are machine-derived from ERP foreign keys + AI extraction (with a `confidence` and `origin` so derived links are distinguishable from canonical ones).

## Appendix C — Per-Slice Checklist (copy into each ticket)

```
[ ] Schema + migration (Drizzle) committed
[ ] RLS policy + isolation test (tenant A ⊄ B)
[ ] RBAC: DB + API guard + UI flag agree; negative test passes
[ ] tRPC endpoint(s) with Zod; types generated
[ ] Mutation emits audit (hash-chained) + Cortex graph event w/ provenance
[ ] UI: loading skeleton + empty + error; WCAG AA; keyboard path
[ ] Unit ≥80/70; critical-path 100%; integration; E2E for the journey
[ ] Observability: logs+trace IDs, Sentry, metric emitted
[ ] PH compliance test cases (if BIR/retention/PCAB/DPA touched)
[ ] Cortex: answers scoped + cited; eval gate (Phase 4+)
[ ] ADR (if non-obvious) + runbook (if prod-impacting)
[ ] CI green incl. security suite; 2 approvals to prod
```

## Appendix D — First Three Slices (so the agent can start now)

1. **S0.1 Tenancy + RLS spine.** `tenants`, `users`, `memberships`, RLS on all, isolation test, Supabase Auth (email + Google), session cookies. *DoD:* §8.1–8.3, 8.7, 8.11.
2. **S0.2 Audit + Cortex substrate.** Hash-chained `audit_log` (insert-only), `cortex_nodes/edges/provenance`, mutation→graph event plumbing, verify-chain test. *DoD:* §8.7, 8.10.
3. **S1.1 Project Workspace (vertical slice).** Create/edit project (metadata, RLS-scoped), activity feed, document upload (validated), real-time update, and the project mirrored into the Cortex graph. *DoD:* full §8 + Herald can answer "what changed on this project?" with citations once Phase 4 lands; until then the graph + audit must already be populated and queryable.

---

### How to use this document
- **Agent:** load §0 as `/goal`; treat §4 as the plan, §8/§9 as gates, Appendix D as the first tasks. Stop and ask on any conflict with `CLAUDE.md`.
- **Team:** assign §3 lenses per slice; Appendix C is the ticket template; Appendix A/B are living specs to extend as tables are added.
- **Both:** dogfood Cortex from Phase 1 — track this build's own tasks, decisions, and announcements in the graph. If ABI OPS can't run its own construction project, it isn't done.
