# Third Code ERP — BuildOps Product Requirements v1

**Owner:** Third Code Solutions Inc.
**Status:** Active governing product contract
**Date:** 2026-08-04
**Audience:** Product, engineering, QA, security, operations, and implementation partners

This document governs incremental delivery of Third Code ERP. It consolidates
the product intent in `apps/web/REFACTOR.md`, the route/story index, the
clean-room ADRs, and the current architecture/release records. It is a
requirements contract, not a promise that every listed capability is already
production-enabled.

## 1. Product outcome

Third Code ERP gives construction and other project-driven businesses one
calm operating record from opportunity through delivery, billing, turnover,
and warranty. Users should find the next decision quickly, understand its
source, and complete work without reconstructing context across spreadsheets,
email, chat, and disconnected tools.

Construction is the deepest model. Tenant-safe parties, projects,
procurement, finance, documents, approvals, and knowledge foundations must
also support adjacent businesses without forcing construction vocabulary into
every workflow.

Success measures:

- A role-specific Today view exposes actionable work, blockers, approvals, and
  evidence without a dashboard scavenger hunt.
- A project record links scope, schedule, documents, procurement, cost,
  progress, billing, compliance, and handover history.
- Cortex answers only from records the user may access, cites source records,
  and makes high-impact actions reviewable rather than autonomous.
- Every official mutation is tenant-scoped, permission-checked,
  transactionally committed, idempotent where retryable, and auditable.
- A new tenant can understand core workflows on day one without training on
  an implementation-specific module catalog.

## 2. Clean-room boundary

ERPNext/Frappe and Rework may be reviewed only for publicly observable
business outcomes and common ERP vocabulary. Third Code ERP must not copy
their code, schemas, UI structure, text, branding, tests, documentation,
assets, or internal architecture. Requirements must be expressed as
Third-Code-authored outcomes, actors, states, invariants, and evidence.

Release scans must show no ERPNext, Frappe, or ABI Ops marker in product
runtime source, metadata, public copy, assets, email, print, portal, or
navigation. Internal historical research may retain provenance references in
docs and tests when they are not shipped to users.

## 3. Users and authority

Primary roles: owner/leadership, sales, commercial/estimating, design,
project manager/site delivery, procurement, finance, safety/compliance,
customer experience, tenant administrator, and external client/supplier
portal users.

Authority rules:

1. Browser renders and requests; it never decides authorization.
2. Next.js owns presentation, compatibility adapters, and browser-safe reads.
3. NestJS owns capability checks, workflow state transitions, official ERP
   commits, idempotency, and audit context.
4. PostgreSQL owns durable state, constraints, exact money, tenant isolation,
   and critical transaction integrity.
5. Redis/BullMQ owns retryable coordination, locks, and asynchronous work; it
   is never the source of truth.
6. Python may extract, classify, forecast, or recommend. Python cannot approve,
   post, delete, or finalize an ERP transaction.
7. External clients and suppliers receive locked, least-privilege sessions;
   portal tokens never grant broad database access.

## 4. Information architecture

Every module must be reachable through one of three surfaces:

- **Today:** role-specific queue of due work, blockers, approvals, exceptions,
  and freshness signals.
- **Project Command Center:** one project timeline linking people, scope,
  documents, cost, procurement, progress, decisions, and closeout.
- **Ask / Create / Find:** universal search and command surface with typed
  intent, permission-aware results, source citations, and explicit approval
  for mutations.

Core navigation families: CRM, pipeline, proposals, estimating/BOM,
procurement, projects, site delivery, inventory, finance, documents,
reports, warranty, portals, Cortex, and administration. Labels describe user
outcomes; implementation packages and migration aliases stay internal.

## 5. Capability contract

### 5.1 Commercial to project

- Accounts capture parties, contacts, KYC evidence, duplicate warnings, and
  finance review.
- Opportunities have ordered stages, SLA timestamps, regression reasons, and
  a guarded Won transition.
- Won conversion carries approved commercial context into a project without
  manual re-entry and creates the pre-construction handoff.

### 5.2 Scope, design, and estimating

- PPRF, inspection, design versions, RFIs, change requests, drawings,
  takeoffs, BOM lines, rate cards, supplier context, and evidence remain
  linked and versioned.
- AI extraction creates drafts only. Human review resolves missing mappings,
  quantity/price overrides, and variance alerts before approval.

### 5.3 Source to pay and site delivery

- RFQ comparison, supplier selection, purchase-order approval, issuance,
  confirmation, delivery scheduling, site preparation, inspection, receipt,
  and supplier-bill matching use explicit state machines.
- Each retryable command has tenant/key idempotency and replay/conflict
  behavior. A workflow transition cannot silently change inventory, payment,
  or commitment state outside its declared transaction.

### 5.4 Project controls and finance

- Cost codes, versioned budgets, commitments, variations, progress claims,
  invoices, retention, tax/withholding configuration, journals, cash,
  reconciliation, reversal, and audit evidence use exact decimal/cents
  contracts and database constraints.
- Reversal is a first-class state transition. No destructive rewrite of an
  official financial record is allowed.

### 5.5 Closeout, service, and knowledge

- Punchlists, turnover packages, certificates, signatures, warranty tickets,
  client portal views, satisfaction surveys, and reports preserve project
  continuity after handover.
- Cortex projects a rebuildable graph over canonical records. Each answer
  exposes citations, tenant/RBAC scope, freshness, and provenance. Public
  landing previews are sample-only and never call ERP mutation routes.

### 5.6 Multi-business expansion

Shared foundations must support parties, items, locations, approvals,
documents, tasks, accounting dimensions, assets, service cases, and reports.
Manufacturing, payroll, HR, and asset lifecycle remain discovery tracks until
their authority, accounting, and tenant invariants are specified.

## 6. State and integrity rules

Every workflow documents actors, allowed transitions, terminal states,
reversal behavior, required evidence, and notification effects before code.
Critical invariants belong in PostgreSQL constraints/functions plus service
validation. Examples:

- `(tenant_id, id)` composite references for tenant-owned relationships.
- Decimal or integer-cent money; no floating-point financial totals.
- Unique tenant-scoped idempotency keys with canonical request hashes.
- Append-only/hash-chained audit rows; actor and authorization context are
  captured inside the transaction.
- RLS enabled and forced on tenant tables; browser roles have no sensitive
  service-table grants.
- Concurrency tests cover duplicate requests, stale state, locks, retries,
  and cross-tenant denial.

## 7. Experience and public surface

Landing page follows Third Code visual language: restrained navy/ivory/copper,
Satoshi editorial typography, wide two-to-three-line hero, dense purposeful
bento, progressive disclosure, accessible controls, and real GSAP motion with
reduced-motion fallback. No cheap ordinal labels, invisible CTA text, or
unverified autonomous-AI claims.

SEO/GEO requirements: canonical metadata, descriptive title/description,
Open Graph/Twitter image, Organization/SoftwareApplication/FAQ structured
data, crawlable public copy, stable section anchors, and analytics events that
do not leak tenant data.

Authenticated UI must prioritize scanability: role queues, clear state,
source links, keyboard/focus behavior, 44px minimum touch targets, responsive
desktop/tablet/mobile layouts, and no horizontal overflow.

## 8. Architecture and delivery rules

```text
Next.js + TypeScript
        -> NestJS + TypeScript modular monolith
             -> PostgreSQL / Supabase (source of truth)
             -> Redis + BullMQ (coordination and jobs)
             -> object storage (files/evidence)
             -> Python (AI, OCR, analytics, forecasting, documents)
```

Use strangler migration by vertical slice. Preserve existing API behavior
until a new authority path has equivalent contract, capability, idempotency,
audit, rollback, and runtime evidence. Do not migrate to Laravel, PHP, Go,
Rust, Frappe, or ERPNext. Do not introduce microservices without measured
production need.

Definition of done for each slice:

1. User outcome, actors, states, invariants, and failure behavior documented.
2. Typed shared command/result contract and server authorization boundary.
3. Migration/schema constraints, tenant/RLS policy, and audit behavior.
4. Focused unit/contract tests plus tenant-negative/concurrency/retry tests.
5. Disposable PostgreSQL/Redis replay with zero skipped critical tests.
6. Browser/runtime proof for changed user path and responsive behavior.
7. Lint, typecheck, full tests, production build, security/provenance scan.
8. Updated architecture, decisions, work log, next action, and rollback note.
9. Source pushed under the intended GitHub identity; provider release verified
   by exact SHA, health/readiness, logs, and spend gate.

## 9. Current baseline and sequence

Verified 2026-08-04:

- Source head: M3.39 project-create idempotency; 87 migrations.
- Disposable replay: PostgreSQL 17 + Redis, 87/87 migrations, DB 306/306
  zero-skip, API integration 15 files/22 tests.
- Landing: browser-proven at 1440, 768, and 390px with no overflow, working
  accordion/carousel/FAQ/Cortex preview, structured metadata, and no runtime
  vendor trace.
- Railway API: `/ready` and `/health` return 200; PostgreSQL and Redis healthy.
- Supabase: healthy target, exact 55-row prefix; ordered apply blocked by
  connector `INVALID_ARGUMENT`, existing `MIGRATIONS_FAILED` branch state,
  and open backup/catalog/data/RLS gates.
- Vercel: Git-disconnected/spend-protected; no new build allowed by default.

Next delivery order:

1. Repair supported Supabase reconciliation path; never hand-insert migration
   history or bypass ordered suffix.
2. Move one existing high-value mutation from Next Server Action to Nest with
   closed-by-default canary, beginning with project creation.
3. Add Today/Project Command Center surfaces backed by existing reads and
   Cortex citations; keep writes behind Nest authority.
4. Normalize shared parties/items/dimensions for multi-business tenants.
5. Expand asset/service workflows only after authority and accounting specs.

## 10. Open decisions

- Approved Supabase backup/restore and migration-reconciliation mechanism.
- Tenant canary owner, allowlist, rollback operator, and release window.
- Object-storage retention/legal hold policy for drawings, invoices, and
  client evidence.
- Search/index freshness SLO and retention policy for Cortex projections.
- Multi-business party/item normalization without breaking construction FKs.
- Compliance configuration ownership per tenant; statutory outputs require
  local review and must not be marketed as universally certified.

## 11. Source references

- [`apps/web/REFACTOR.md`](../apps/web/REFACTOR.md) — detailed user stories,
  API sketches, integrations, and test strategy.
- [`USER_STORY_INDEX.md`](USER_STORY_INDEX.md) — route/action/schema map.
- [`REWORK_ALIGNMENT.md`](REWORK_ALIGNMENT.md) — clean-room behavioral
  capability mapping.
- [`architecture/TARGET_STATE.md`](architecture/TARGET_STATE.md) — target
  authority boundaries.
- [`architecture/MIGRATION_PLAN.md`](architecture/MIGRATION_PLAN.md) —
  milestone sequencing and release gates.
- [`adrs/ADR-009-clean-room-capability-expansion.md`](adrs/ADR-009-clean-room-capability-expansion.md)
  — provenance and incremental-slice decision.
