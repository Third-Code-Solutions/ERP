# Third Code ERP capability matrix

Status date: 2026-08-06
Source checkpoint: `86db0e4935ff7f655e6443d19834fe3e1e9bc013` (M3.124 bounded
landing carousel and above-fold image priority)
Scope: clean-room construction ERP capability planning and incremental delivery

M3.125 current-state refresh: the source branch contains 97 ordered Supabase
migrations, including the source-only anonymous-grant and policy hardening
baseline. The read-only hosted planner still reports 55/97 migrations, 213
direct `anon` privilege rows, 209 policies containing `public`, one
tenant-scoped duplicate Purchase Order number group, and no configured audit
recovery tenant. These are release blockers; this matrix does not authorize a
hosted SQL apply, Vercel build, Railway deploy, or feature-flag canary.
The current functional source boundary remains: NestJS owns closed-by-default
Purchase Order workflow and delivery/asset authority slices; Web uses exact
tenant/flag selectors and compatibility paths where the Core slice is not
enabled; Python/Cortex stays advisory and cannot finalize ERP transactions.
No provider or hosted database state changed for this refresh.

M3.126 replay update: a fresh disposable PostgreSQL 17.10 database was
bootstrapped and replayed from the 97-file source ledger, then loaded with the
deterministic seed. The verifier passes and database Vitest is 51/51 files,
324/324 tests, zero skips. This is source replay evidence only; the hosted
55/97 ledger, catalog blockers, duplicate Purchase Orders, audit recovery,
rollback, identity, and spend gates remain open.

M3.127 validation update: pinned Supabase CLI `2.109.1` schema-diff attempts
against the disposable replay stopped before inspection because Docker Desktop
Linux engine is unavailable. The CLI gate remains open; no hosted or local
database state was changed by the failed read-only attempts.

M3.109 update: protected dashboard render failures now receive a responsive,
branded recovery boundary with retry/navigation and digest-only support
reference. No ERP authority or transaction path changed. Web evidence is
88/570 tests and 81/81 production routes; no provider build or hosted mutation
occurred. Source is pushed to the feature branch by `kurtgav`.

M3.108 update: refreshed hosted parity read-only. Supabase remains PostgreSQL
17.6 at 55/94 migrations with 88 RLS-enabled public tables, 22 forced-RLS
tables, 303 policies, 2 tenants, 13 users, 13 Purchase Orders, 4 invoices,
662 audit rows, 385 Cortex nodes, and 454 Cortex edges. Source-only Asset
Register and delivery-schedule ledger tables are absent. One tenant-scoped
12-record Purchase Order duplicate group and 11 security warnings remain.
Vercel runtime errors/500 logs for `/dashboard` are empty; no provider or
hosted mutation occurred.

M3.107 update: Inventory now has an authenticated UOM editor for display name
and active state. Nest owns the fail-closed, tenant-scoped PATCH authority with
membership/capability recheck, row locks, immutable code/decimal precision, and
semantic audit. Local evidence is shared 29/29, API 452 passed with 26 skipped,
Web 569/569, Next 81/81, and repository lint/type checks. Source is pushed to
the feature branch by `kurtgav`; no provider build or hosted mutation occurred.

M3.106 update: Inventory now exposes per-item policy editing for active catalog
items, reusing the guarded `configureInventoryItem` authority for base UOM and
perpetual tracking. Item identity remains stable and inactive UOMs cannot be
newly assigned. Source commit `7570cda` is pushed to the feature branch;
`origin/main` remains unchanged. Local evidence is 125/125 focused tests,
87/567 full Web tests, and 81/81 production routes. Supabase remains read-only
at 55/94; no provider build or hosted mutation occurred.

M3.105 update: Inventory now provides an authenticated Warehouse edit surface
for name and active state while preserving immutable code/project identity and
the Nest zero-net-stock deactivation guard. Source commit
`e9ee5adb44e3bc2da5cab54af2828065f117f343` is pushed to the feature branch;
local Web evidence is 125/125 focused tests, 87/567 full tests, and 81/81
production routes. No hosted mutation or provider build occurred; Supabase
remains read-only at 55/94.

M3.104 update: the Vercel spend guard scans all workspace package manifests
and GitHub workflow YAML, passes 3/3, and confirms no deploy command or Git
deployment is enabled. No Vercel deployment was created for the current
feature SHA; Supabase remains read-only at 55/94 and Railway readiness remains
healthy. No hosted mutation occurred.

M3.103 update: delivery scheduling for issued Purchase Orders now has a closed
NestJS `POST /v1/procurement/deliveries` authority route with tenant-scoped
idempotent replay, issued-PO locking, in-app notifications, and semantic audit.
The Web form selects Core only for the exact flag/UUID allowlist and has no
direct fallback; all new selectors remain false/empty. Local migration/RLS
proof is 94/94, API 104/449, Web 87/567, and build 81/81. Hosted Supabase is
still read-only at 55/94; no provider build or tenant canary occurred.

M3.102 update: delivery `site_ready -> in_transit` now has a closed NestJS
authority route with tenant/idempotency replay and semantic audit. The Web
action remains compatibility-default with the new exact flag/allowlist empty;
hosted source-suffix reconciliation and canary evidence are still pending.
Local release gates now pass: API 104/445, Web 87/565, reproducibility 93/93,
and isolated Nest/Next production build 2/2 with 81/81 routes. Railway then
performed one automatic backend deployment for the exact pushed commit;
readiness and health are green. No hosted migration or Vercel build occurred.

M3.101 hosted update: Supabase project `aqqrtkmtcsfkbyyqxowv` is healthy on
PostgreSQL 17.6.1 but remains at 55/92 migrations. Source asset migration
`20260806110000_asset_register_foundation` and `public.assets` are absent
hosted, so asset selectors remain false/empty. Security advisors remain 14
notices/11 warnings; no hosted migration, official ERP write, or provider
build occurred.

M3.100 replay update: rollback-only disposable PostgreSQL 17/Redis 7.4.9 proof
now compares direct and Core Asset Register rows across two tenants, Project
joins, pagination/search, audit, forced RLS, and client-role privilege denial.
Verifier coverage includes the asset migration, service-only table, indexes,
and audit trigger. API 17/24, database 49/318, schema hash unchanged, and
92/92 migration verification pass. Source SHA
`8586beb9e53d5fafd2289451eda576ea5b1a1726` is pushed; hosted selectors remain
false/empty and no provider/database write occurred.

M3.99 Web update: Asset Register now has an original Next route over the
closed Core `GET /v1/assets` read projection. It requires `asset.read`, exact
flag/tenant selection, strict response validation, and no direct database
fallback; default selectors remain false/empty. Source SHA
`b7f274ad078965239a9138545a96bd6468b4dcda` is pushed to both refs. Web
87/561 and build 81/81 pass; Vercel remains disconnected with no new build.
Hosted Supabase remains read-only at 55/92 migrations; no official ERP write,
tenant canary, or provider spend occurred.

M3.98 rebrand update: authenticated shell source now uses an accessible `TC`
Third Code ERP mark instead of the leftover `A`. Clean-room branding test,
web 87/559, typecheck, serial lint, and production build 80/80 pass. Source
SHA `a719d2321410c09658faca30c20c6c374f502360` is pushed to both refs. Vercel
Git/build remains disconnected; live UI promotion is unverified by design.

M3.97 hosted parity update: read-only Supabase inspection confirms PostgreSQL
17.6, 55/92 hosted/source migrations, 88 public tables with RLS enabled, and
303 public policies. Counts are 2 tenants, 13 users, 13 Purchase Orders, 4
invoices, 662 audit rows, 385 Cortex nodes, 454 Cortex edges, and zero cash
accounts, cash transactions, or supplier bills; one tenant-scoped PO duplicate
group contains 12 records. Security advisors include 11 warnings and the
selectors remain false/empty. No hosted migration, official ERP write, branch,
Vercel build, or Railway build changed.

M3.96 replay update: disposable PostgreSQL 17/Redis 7.4.9 proof compares the
cash compatibility query with the typed Nest projection across two tenants,
state/direction/date filters, exact-cent totals, and same-tenant joins. 92/92
migrations, 112 database suites/318 tests, and 32 API integration suites/23
tests pass with zero skips. Source SHA
`91ed37570ea57fa456b569d247802cfd996cb9c6` is live on Railway deployment
`133e14b7-c879-4090-8ce1-26d9b42d93ca` (`SUCCESS`/running); readiness/health
are 200 and unauthenticated cash register is 401. Hosted Supabase remains
read-only and Vercel has no new build.

M3.96 update: cash transactions now have a typed, tenant-derived NestJS
`GET /v1/finance/cash-transactions` projection with same-tenant cash-account
and optional counterparty joins, exact-cent register rows, and posted
receipt/disbursement aggregates. API and Next selectors are false/empty by
default; the existing page remains the compatibility path for unselected
tenants and Core failure cannot fall back for a selected tenant. Source SHA
`ddadd2fa3f7c2451dcfc97f53529ba9edba1f3ee` is live on Railway deployment
`fbfc7eb0-4820-4359-a42f-74b3c0351558` (`SUCCESS`/running); readiness/health
are 200 and unauthenticated cash register is 401. No UI, hosted migration,
provider spend, or official ERP write changed. Vercel remains disconnected
with no new build.

M3.95 update: supplier payables now has a typed, tenant-derived NestJS
`GET /v1/finance/payables` projection with Supplier Bill/Vendor/Purchase
Order/Project context, posted disbursement allocation math, exact-cent open
balances, and server-computed aging totals. API and Next selectors are
false/empty by default; the existing page remains the compatibility path for
unselected tenants and Core failure cannot fall back for a selected tenant.
Source SHA `de0b7e1909ec127ec94ec044202f78f44ab8bd4a` is live on Railway
deployment `dcb4579e-5bb5-4661-9896-fc1fd607bd92` (`SUCCESS`/`RUNNING`);
readiness/health are 200 and unauthenticated payables is 401. No UI, hosted
migration, provider spend, or official ERP write changed. Vercel remains
disconnected with no new build.

M3.94 update: customer receivables now has a typed, tenant-derived NestJS
`GET /v1/finance/receivables` projection with posted invoice status scope,
same-tenant Project/Business Account context, exact-cent allocation balances,
and server-computed aging totals. API and Next selectors are false/empty by
default; the existing page remains the compatibility path for unselected
tenants and Core failure cannot fall back for a selected tenant. Source SHA
`f298b61a215ea43753f627010444c488f0c46518` is live on Railway deployment
`bfec3369-dee7-4ed9-9cb7-37f1e71fe9ab` (`SUCCESS`/`RUNNING`); readiness/health
are 200 and unauthenticated receivables is 401. No UI, hosted migration,
provider spend, or official ERP write changed. Vercel remains disconnected
with no new build.

M3.93 update: the general ledger now has a typed, tenant-derived NestJS
`GET /v1/finance/ledger` read projection with posted-entry scope, integer cents,
same-tenant context joins, and an explicit `finance.read` capability. API and
Next selectors are false/empty by default; the existing page remains the
compatibility path for unselected tenants and Core failure cannot fall back for
a selected tenant. Source SHA `c279f61555ba772579fb4091dd3d5884b48af273` is
live on Railway deployment `ac9f3fee-0a54-4bf7-91db-2b6815a3638e`
(`SUCCESS`/`RUNNING`); readiness/health are 200 and unauthenticated Finance
Ledger is 401. No UI, hosted migration, provider spend, or official ERP write
changed. Vercel remains disconnected with no new build.

M3.92 update: Cortex keyword search now has a typed, tenant-derived NestJS
`GET /v1/cortex/search` read projection with an explicit `cortex.search`
capability and server-owned role scope. API and Next canary selectors are
false/empty by default; unselected tenants retain the existing route. Core
failure cannot fall back to a direct database read for a selected tenant. No
UI, hosted migration, provider spend, or official ERP write changed.
Source SHA `cd94e274a6a5cb19f715c73fa96fc717879644cc` is live on Railway
deployment `e9e90045-f907-4f6c-ae49-5fa3dcff3cd9` (`SUCCESS`); readiness/health
are 200 and unauthenticated Cortex search is 401. Vercel remains disconnected
with no new build.

M3.91 update: the operational asset register now has a typed, closed NestJS
`GET /v1/assets` projection with strict bounded filters/pagination, the
`asset.read` capability, verified-principal tenant scope, and same-tenant
Project context. API flags remain false/empty; there is no Web adapter, browser
table access, write authority, hosted migration, or Vercel build. Railway
deployment `f0358fdd-f927-465c-b930-ec68b0baf240` is live on the source SHA;
the next proof is disposable replay and a protected tenant canary.

M3.90 update: the source now defines an operational asset register with
tenant-safe identity, controlled kind/status, assignment constraints, audit,
forced RLS, and service-only access. There is no API/UI authority, hosted
migration, maintenance workflow, or accounting fixed-asset behavior; Railway
deployment `1a072ca0-9267-4a16-aad6-fdc2c7ba83ff` is live on the source SHA,
while the next functional proof is disposable replay and then a closed Nest
read projection.

M3.89 update: direct and grouped Nest Purchase Order header inserts map only
the named tenant/PO unique constraint to a bounded 409 response; raw database
errors and business identifiers are not exposed. Runtime flags remain
false/empty, Supabase duplicate reconciliation is still blocked, Railway is
live on the guarded API SHA, and Vercel remains unchanged.

M3.88 update: Purchase Order creation now has executable service proof for
capability/tenant denial, exact centavo header and line totals, bounded audit
evidence, and exact idempotent replay. Runtime flags remain false/empty;
hosted migration and canary gates remain unchanged.

This matrix is the product scope baseline. It describes business outcomes and
the current Third Code implementation; it is not a source, schema, UI, copy, or
test port from another product. Status is deliberately separated from hosted
release status so local capability work cannot be mistaken for production
authorization.

M3.83 update: runtime Web/API/package text now passes an expanded clean-room
guard for ERPNext/Frappe/ABI Ops/Rework/BuildOps variants. Historical migration
identity remains classified internal provenance. Source SHA `1c5b8de` is active
on Railway; Supabase and Vercel remain unchanged.

M3.82 update: project Audit now has allowlisted action/entity filters and
URL-addressable 25-row pagination. Direct and Core reads share tenant-scoped
filter semantics; Core remains closed by flag/tenant allowlist and redacts
details. Source SHA `e98a03b` is locally validated only; Supabase and Vercel
remain unchanged.

M3.81 update: the existing project Audit page can select the redacted Nest
`GET /v1/audit/activity` projection only behind an explicit environment flag,
tenant allowlist, and capability role. The default direct read remains in
place; no migration or default UI change occurred. Source SHA `e8d993d` is
live on Railway deployment `5a562db0-d682-4d99-adba-0adb20436bc8`. Supabase
and Vercel remain unchanged; stale Railway provider metadata is an operator
review item only.

M3.80 update: the API now exposes a redacted, paginated
`GET /v1/audit/activity` projection over the existing append-only `audit_log`.
It requires the explicit `audit.read` capability, derives tenant scope from the
verified principal, and never returns `diff` payloads. Source SHA `1170b55` is
live on Railway deployment `e62e25b9-7e26-4b59-bb32-35ba524c6ae2`; Supabase
and Vercel remain unchanged. Railway's deployment metadata still carries a
stale `@buildops/web` build-command string even though the file manifest used
the intended API Dockerfile; keep this as an operator follow-up, not as a
permission to change provider settings.

## Status vocabulary

- **Live**: the current application exposes the workflow end-to-end against the
  currently deployed schema.
- **Local**: source and tests exist, but the ordered hosted migration/release
  gates are not clear.
- **Source-gated**: a bounded source/UI seam exists, but explicit runtime
  controls and hosted data gates keep it closed.
- **Adapter**: the existing Next.js path still owns the behavior while a closed
  NestJS authority seam exists for a future canary.
- **Planned**: scope is defined; no production mutation exists.
- **Gap**: a capability is intentionally outside the current source surface.

M3.39 update: project creation remains **Adapter**. The Nest authority seam
now has durable tenant/key idempotency, replay, conflict, rollback, and audit
contracts; the legacy Next Server Action remains default until hosted parity,
provider, and canary gates are complete.

## Construction operating spine

| Outcome | Current source surface | Status | Authority boundary |
|---|---|---:|---|
| Qualify accounts, contacts, KYC, and opportunities | CRM routes, pipeline, account/KYC tables | Live | Next reads; server actions remain legacy authority |
| Turn a won opportunity into a project | Pipeline conversion and project tables | Live | Transactional server action with audit |
| Capture drawings, takeoffs, scope, BOM, and rate cards | BOM routes, CAD worker, evidence tables | Live | Python extracts evidence; official BOM remains server-owned |
| Compare suppliers and dispatch RFQs | RFQ routes, quote workflow, BullMQ/outbox | Live | Nest adapter plus durable outbox |
| Approve and issue Purchase Orders | PO creation and three-step workflow | Adapter | Nest route is closed by tenant flag; legacy path remains for unselected tenants |
| Confirm a supplier response to an issued PO | M3.28 Nest public route, M3.29 protected SCM session minting, M3.30 gated email-link reconstruction, M3.49 read/decision portal | Source-gated | Public token authority, least-privilege read model, session scope/expiry checks, server transaction, explicit decision state |
| Schedule deliveries and prepare a site | Delivery routes and state machine | Local | Nest transition slices, including closed `site_ready -> in_transit`, with tenant-scoped idempotency |
| Inspect and accept/reject delivery | Inspection routes and evidence | Local | Nest transition slices, audit and guarded status changes |
| Receive, transfer, consume, and count stock | Inventory control center and ledger schema | Local | PostgreSQL ledger constraints; Core posting/reversal slices |
| Control budget, commitments, claims, and cost-to-complete | Budget, cost-code, claim, and report routes | Local | Tenant-scoped accounting and project controls |
| Issue, reverse, cancel, and reconcile invoices | Receivables, journals, reconciliation routes | Local | Core finance slices reuse database invariants |
| Package turnover, sign, and continue warranty | Turnover, signature, warranty, and client portal routes | Adapter | M3.27 public signing authority is closed by default |
| Ask questions with cited company context | Cortex search, graph projection, citations | Live | Read-only, tenant/RBAC filtered; AI is advisory |

## Multi-business ERP expansion

| Capability family | Required outcome | Current state | Next proof |
|---|---|---|---|
| Parties and master data | One tenant-safe record for companies, people, vendors, items, accounts, and locations | Partial; construction-first tables exist | Normalize shared party/item conventions without breaking existing FKs |
| Source-to-pay | Request, compare, approve, issue, confirm, receive, match, pay, reverse | Procurement/payables plus closed supplier-confirmation source slices | Hosted parity and link-delivery proof |
| Project controls | Scope, baseline, schedule, progress, commitments, forecast, handoff | Construction spine is present | Reconcile project and financial dimensions across every write |
| Inventory | Perpetual quantity/value ledger, transfers, consumption, counts | Local source slices exist | Disposable Postgres/Redis posting and reversal proof |
| Receivables | Invoice, tax/retention, receipt, reconciliation, reversal | Local finance slices exist | Hosted parity and exact-cent integration canary |
| Compliance and audit | Tenant isolation, capability checks, immutable audit, evidence lineage | Implemented across current slices | Audit-chain recovery with owner-approved tenant input |
| People and work management | Role-aware tasks, approvals, workload, site cadence | Tasks and permissions exist | Keep HR/payroll out of the construction transaction path until discovery |
| Assets and maintenance | Track equipment, warranties, service history, and cost | Operational asset register plus closed Nest/Web read projection; no maintenance history or accounting lifecycle | Hosted parity, then protected tenant read canary; defer maintenance/history/accounting authority |
| Service and customer success | Portal, issues, warranty, satisfaction, communications | Warranty portal and CNPS are live | Add supplier/customer response loops only after token threat model |
| Reporting and planning | Role-specific Today views, scheduled reports, exports, forecasts | Dashboard, reports, and Cortex context exist | Measure decision latency and data freshness before adding breadth |

## M3.28-M3.49 bounded scope: supplier confirmation

The next implementation slice is intentionally narrow:

1. Add a tenant-scoped supplier-confirmation session with a hashed,
   single-purpose token, expiry, revocation, and an explicit state machine:
   `pending -> accepted | declined | changes_requested`.
2. Add a durable replay ledger keyed by tenant and idempotency key. The replay
   result must include the session, Purchase Order, decision, and response time.
3. Add a closed-by-default NestJS public command. Tenant and Purchase Order
   scope come only from the locked session; the browser cannot submit tenant,
   vendor, status, or actor identifiers.
4. Commit the decision, response metadata, and nullable-actor semantic audit in
   one PostgreSQL transaction. A response never changes delivery, receipt, or
   payment state by itself.
5. At `scm_issue`, optionally mint one pending session using a deterministic
   HMAC-derived token, persist only its hash, associate the source workflow
   request, and put only the session UUID in the supplier outbox.
6. Keep the existing supplier email and Purchase Order UI behavior unchanged;
   link delivery is independently gated, verifies a pending unexpired session,
   and requires its own disposable replay, expiry, revocation, cross-tenant,
   rollback, provider, and spend gates.
7. Add a read-only, least-privilege supplier review page and form. The read
   seam has its own closed-by-default flag and tenant allowlist; Nest remains
   the only authority for recording the response and the page never receives
   tenant, actor, or token-hash fields.

Acceptance is source-level plus a closed Railway runtime seam until the
ordered hosted migration suffix is reconciled. The two source migrations and
route exist; all public and session-minting controls remain false, no Supabase
SQL or public link is active, and the existing notification retry path remains
unchanged.

## Release boundary

Current hosted Supabase is at 55 applied migrations while source contains 90.
The 35-migration suffix must be planned and applied in order as one reviewed
release. Duplicate Purchase Order data, the owner-approved audit-recovery
tenant, disposable database/Redis evidence, clone catalog/data/RLS/audit/
financial reconciliation, rollback, exact provider identity, and spend
controls remain independent gates. Vercel Git stays disconnected to avoid
duplicate or surprise builds. Railway readiness does not clear these gates.

## Source-of-truth references

- [`REWORK_ALIGNMENT.md`](../REWORK_ALIGNMENT.md) — current construction
  workflow mapping.
- [`USER_STORY_INDEX.md`](../USER_STORY_INDEX.md) — route/action/schema index.
- [`ADR-009-clean-room-capability-expansion.md`](../adrs/ADR-009-clean-room-capability-expansion.md)
  — clean-room and incremental-slice decision.
- [`CURRENT_STATE.md`](./CURRENT_STATE.md) — verified runtime boundary.
- [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) — release-gated transaction slices.
