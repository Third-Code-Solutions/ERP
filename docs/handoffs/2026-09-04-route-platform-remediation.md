# Route and Platform Administration Remediation — Sequential Handoffs

## Resumed sequential ownership — 2026-09-04

06:31 → Agent04 database-runtime repair. Reason: browser12969 exhausted local
Postgres connections (53300) after visiting many routes. Shared lazy client is
module-local and non-Vercel pools have no idle timeout; reloads can accumulate
pools. Inputs: Inventory/Pipeline failures, client.ts/connection.ts and driver
pooling documentation. Expected output: failing reload regression, reuse only
connection pools across development reloads (fresh ORM schema per module),
bounded idle connections, unchanged production/Vercel settings, and focused
tests. Then return to Agent03 to rerun the same browser sweep. No schema change.

06:20 Agent03 route repair: reproduced malformed UUID database crash; added
shared Zod page-parameter validation to47 pages plus project layout and repaired
duplicate HTML document nesting in print layout. All47 malformed browser paths
pass. Agent03 continues static/project/public/print browser sweeps and serial
Web tests; no actual subagents. No security policy, provider setting or schema
change in this slice. Follow-up fixture includes a real local weekly report.

05:40 Agent13/Agent12 release review: live Core lacks
`SUPABASE_SERVICE_ROLE_KEY` and `ERP_WEB_BASE_URL`; the former already exists as
a protected GitHub production secret. Added a gated, exact-service, stdin-only
configuration step with `--skip-deploys`, no secret argument/output, and an
explicit public Web origin. A regression failed before the fix, then both
production-auth workflow tests and actionlint passed. No provider variable was
changed. → Agent03 completes browser acceptance; Agent13 retains production
release gates and reports remaining email/account and migration boundaries.

05:35 follow-up: Agent05 reviewed dependency configuration against the actual
notification delivery service. Resend requires both `RESEND_API_KEY` and
`EMAIL_FROM`; a failing regression reproduced a false configured status when
the sender was absent. The minimal service fix passes four configuration cases
plus ten controller contract tests. No provider credentials or telemetry are
exposed. → Handoff to Agent03 for the existing full platform browser suite after
the Core build, then Agent13 for release preflight reporting. One agent continues
sequentially; database restoration remains canceled by the user.

Analytics continuation: Agent05 adds an owner-only operational aggregate endpoint
over existing schema (no migration/dependency), with shared response validation and
two-tenant integration. → Agent03 consumes it in Analytics with source-qualified
counts and independent section failure states. Agent02 reuses MetricCard and
confines oversized numeric text through existing metric styling. No new shared
primitive. Tenant RLS and owner assignment rules remain unchanged.

One brain/chat continues; no agents were spawned. Agent04/12 domain review added
the four missing audit triggers and removed the incorrect unique trace constraint;
full disposable replay and audit176/176 passed. → Agent05: require actor/tenant/
expiry-bound explicit support IDs on existing-tenant mutations. → Agent03:
transport opaque IDs in strict HTTP-only cookies and show persistent context.
→ Agent13: explicit browser teardown before Windows process termination, verified
fixture cleanup. → Agent03: Settings capability visibility/atomic audit/accessibility
and Reports exact integer monetary summaries with truthful labels. → Agent12/05:
provider-verified recent authentication on platform writes,20 unit checks and Core
integration passed. → Agent03: project Documents controls/navigation match actual
capabilities, truthful processing guidance, accessible status and mobile table.
Thirteen role rendering and seven existing deletion tests passed. Current runtime
verification and next action remain only in the Obsidian control center.

- Date: 2026-09-04
- Branch: `agent-01/erp-route-platform-remediation`
- Constraint: one agent, one chat, sequential execution; no subagents or parallel work.
- Resumed: Agent04 owns the audit-trigger repair in the still-unreleased ADR027 migration; Agent12 verifies fail-closed/redacted audit evidence, then Agent05/03 implement support-session binding. No agents are spawned. Existing unrelated changes remain excluded.
- Agent04/12: audit coverage176/176 and nine focused SQL tests passed, including invitation activation, redaction, fail-closed audit rollback, and many-events-per-trace. Agent05: context/actor/tenant/expiry/end checks protect every existing-tenant mutation. Agent03: HTTP-only strict-samesite expiring cookie binds the context; inactive tenants can enter maintenance support for reactivation. API/Web focused tests and typechecks passed. Agent13: explicit Playwright global teardown added for Windows; full replay/browser validation now running.
- Route loop: Agent03 owns Settings repairs (existing tenant-scoped server action, transactional audit via existing helper, Zod validation, role-correct controls, and verified platform-console navigation). No new persistence model/provider/role is introduced. Shared dialog primitive reuse is preferred to a new design-system component.
- Durable execution state: `Third Code ERP Control Center.md` and its linked Obsidian ledgers.

## Ordered Ownership

1. Agent 01 — record product authority, route contract, ambiguities, ADR needs, and final user-visible documentation reconciliation.
2. Agent 12 — establish the platform-owner threat model, immutable identity bootstrap/recovery constraints, security tests, RLS implications, and release stop conditions before privileged code is activated.
3. Agent 04 — add only the approved additive platform-role/support-context schema, RLS, indexes, migration verification, and forward recovery when source evidence shows schema work is required.
4. Agent 05 — implement scoped platform administration services/APIs, validation, authorization, tenant selection, audit, error taxonomy, and analytics queries against real sources.
5. Agent 02 — add or adjust only shared design-system primitives/tokens/stories required by the professional ERP states.
6. Agent 03 — implement route guards/layouts/navigation/auth flow, canonical redirects, platform-admin pages, support-context shell, loading/error/403 states, and React Query integration.
7. Agents 09, 10, and 11 — sequentially repair dashboard, BOM/project, and pipeline route families without crossing API/schema authority.
8. Agents 06, 07, 08, 14, and 15 — sequentially inspect and repair their actual discovered route/integration surfaces only where the route ledger establishes in-scope gaps.
9. Agent 12 — perform the final cross-route authorization, isolation, security-header, secret, audit, cache, and negative-case review.
10. Agent 13 — run release gates, reconcile the guarded promotion target, deploy only when green, and capture exact production evidence.
11. Agent 01 — reconcile PRD/route guide/changeset documentation and close the final acceptance ledger.

Each transition requires the receiving role’s section of `AGENTS.md` to be re-read and the control-center checkpoint to be updated. Same-file work is never parallelized.

## Current Handoff

Agent 01 completed the first critical product decision in ADR-027 and updated PRD v1.5 with the distinct platform-owner and canonical pipeline contracts.

→ Handoff to Agent 12. Reason: establish the executable platform-owner threat boundary before privileged schema or application code. Inputs: ADR-027; existing single-tenant `users.tenant_id`/`role`; ADR-022's inactive membership model; fixed verified owner email; required negative tests. Expected output: fail-closed identity/status/support-context controls and a schema/API verification checklist for Agent 04.

Agent 12 recorded the platform-owner threat model under `infra/security/`, including browser/Auth/database/Core trust boundaries, abuse cases, cache/secret protections, and release stop conditions.

→ Handoff to Agent 04. Reason: the accepted security model requires additive global authority/audit/support records plus active tenant/user lifecycle state. Inputs: ADR-027 and the platform-owner threat model. Expected output: Drizzle schema, ordered additive migration, RLS/default-deny functions, constraints/indexes, and disposable database tests without activating ADR-022 memberships.

Agent 04 added the initial Drizzle schema, ordered migration, and static contract tests. The first disposable full-ledger replay stopped before the new migration because the existing CI Supabase bootstrap omitted `storage.buckets.allowed_mime_types`, which the recovered production-ledger migration `20260901141949` requires. The same bootstrap also omitted `auth.users.email_confirmed_at`, required to reproduce provider email-verification checks.

→ Handoff to Agent 13. Reason: repair the disposable CI provider-surface bootstrap, not the production-origin migration. Inputs: replay failure at `20260901141949` and the real Supabase Auth/storage columns used by existing/new migrations. Expected output: add only the missing test-infrastructure columns and return the fresh replay lane to Agent 04.

Agent 13 added the two missing provider-parity columns to `scripts/ci/supabase-system-bootstrap.sql`; no application or hosted database was changed.

→ Handoff back to Agent 04. Reason: rerun the same full-ledger database lane and continue schema/RLS verification now that the disposable provider surface represents the required columns. Inputs: updated CI bootstrap. Expected output: a 158-migration replay result and remediation of any new-migration defect.

Agent 04 completed ADR-027 with server-owned invitation intent/activation, active tenant/user lifecycle denial, immutable owner account and containing-tenant protection, force-RLS global tables, append-only platform audit, and bounded support sessions. The full PostgreSQL 17 lane passed all 158 migrations, 438/438 database tests without skips, 64 API integration files, the Web integration canary, and schema before/after hash equality.

→ Handoff to Agent 05. Reason: expose the reviewed boundary through independently guarded Core APIs without trusting tenant roles, email-only checks, or browser-selected tenant context. Inputs: verified ADR-027 schema/functions, fixed owner contract, shared tenant roles, and explicit support-context model. Expected output: validated platform tenant/user/invitation/role/analytics/audit/integration/health services with transactional platform audit.

Agent 05 added shared Zod command/query contracts, the `v1/platform-admin` controller, an independent `PlatformOwnerGuard`, lifecycle-aware JWT admission, provider-backed invitations/lifecycle/password recovery, real cross-tenant projections, truthful dependency availability, transactional audit events, and focused guard/controller tests. The API and shared-types typechecks pass and 56 focused authorization/controller tests pass.

→ Handoff to Agent 13. Reason: install the sole owner only through a protected, idempotent production bootstrap after provider migration parity is current. Inputs: fixed verified email, immutable-ID and exact-one-assignment constraints, existing guarded production workflow. Expected output: secret-safe bootstrap command, recovery runbook, identity-negative tests, and production workflow gate.

Agent 13 added the bounded Auth lookup plus transactional database bootstrap, redacted fingerprint output, two identity-selection tests, recovery runbook, and a required production-promotion bootstrap step. The command remains intentionally unexecuted against production until migration parity and recoverability gates allow it.

→ Handoff to Agent 02. Reason: determine whether a new shared primitive/token is required for the separate platform shell. Inputs: existing design system and complete page-state requirements. Expected output: reuse decision or narrowly scoped shared component work.

Agent 02 found the existing shared buttons, cards, inputs, badges, tables, and shell tokens sufficient; no new shared primitive or dependency is justified.

→ Handoff to Agent 03. Reason: implement the distinct guarded Web shell and exact eight platform routes against the new Core contract. Inputs: platform API, no-store requirement, support-context contract, existing shared UI primitives. Expected output: server-side owner admission, separate navigation, complete page states, and API-backed actions.

Agent 03 implemented the eight platform pages, isolated shell, loading/error boundaries, fail-closed middleware, and API-backed actions. The initial web typecheck and 11 middleware tests passed; final browser/security review remains pending.

→ Handoff to Agent 11. Reason: canonicalize the pipeline Kanban/list routes without losing existing workflows. Inputs: existing board/conversion implementations, ADR-027 canonical URLs, existing role registry. Expected output: working canonical pages, permanent legacy redirects, updated links and authorization regression coverage.

Agent 11 moved existing board/list implementations to their canonical URLs, replaced legacy pages with permanent redirects, and fixed list links for opportunities without a project and retired-project exclusion. Existing capability-gated stage actions are preserved.

Follow-up verification: real browser proved streaming page redirects could return HTTP200. Agent03 added static Next redirect configuration; focused browser test now proves308 and retained query filters.

Agent03 completed project selectors, invitation acceptance, persistent support banner, sensitive-operation confirmations, and real-browser regression coverage. Agent12's boundary review identified unvalidated platform HTTP responses, missing request-to-audit correlation, and a server-initiated recovery/PKCE mismatch requiring provider-template evidence.

→ Handoff to Agent05. Reason: strengthen the already-authorized platform API boundary without widening roles or tenant RLS. Inputs: real browser/Core evidence, shared output interfaces, existing observability middleware. Expected output: runtime response schemas, correlated named platform actions, provider timeout/recovery handling, and regression tests. Then return to Agent03 for consuming validated/paged responses and the recovery receipt.

→ Handoff to Agent 03. Reason: synchronize canonical destinations in navigation/search/cache invalidation and add requested top-level project-feature entry routes. Inputs: existing project detail destinations, explicit role registry, typed Core project list API. Expected output: tenant-safe searchable/paged project selectors, exact route-policy parity, and route-state coverage. Related links in dashboard/Cortex/API adapters are mechanical canonical URL substitutions only.
