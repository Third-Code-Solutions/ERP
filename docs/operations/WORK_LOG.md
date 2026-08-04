# Work Log

## 2026-08-04 - M3.62 Nest CRM account collection read handoff

Added the bounded CRM account collection authority seam. Nest now exposes
`GET /v1/crm/accounts` with verified tenant scope, explicit `account.read`,
strict query parsing, filters, stable sort/pagination, and opportunity counts.
The Accounts page can opt in through an exact flag and tenant allowlist; direct
DB behavior remains the default and the adapter fails closed on identity drift.

Changed files:

- `packages/shared-types/src/erp-api/accounts.ts` and tests
- `apps/api/src/crm/account-list.pipe.ts` and tests
- `apps/api/src/crm/accounts.controller.ts`
- `apps/api/src/crm/accounts.service.ts` and tests
- `apps/api/test/accounts.e2e.spec.ts`
- capability map and CRM module wiring
- `apps/web/src/lib/erp-core-client.ts` and tests
- `apps/web/src/lib/account-queries.ts` and tests
- CRM Accounts page handoff and environment examples/docs
- architecture and operations memory files

Results: shared types 16 files/170 tests; API 65/323; Web 76/488; workspace
lint/typecheck; Nest build; Web 80/80 production build; `git diff --check`.
The initial parallel web build/typecheck was discarded because overlapping
local Next dev/build processes shared `.next`; after stopping only the
ERP-scoped processes, sequential gates passed. No hosted migration/data repair,
Vercel build/deploy, or provider setting changed.

Rollback: leave `ERP_ACCOUNT_READS_VIA_API=false` and its allowlist empty, or
revert the source commit; no hosted state requires repair. Next: keep the
account-read canary closed pending supported Supabase recovery evidence.

## 2026-08-04 - M3.61 Nest project update audit hardening

Hardened the existing canary-gated project update authority. Nest now writes a
semantic before/after Project diff through the append-only audit chain inside
the same transaction as the tenant predicate and optimistic-concurrency update.
The shared Project update result is parsed at runtime.

Changed files:

- `apps/api/src/projects/projects.service.ts`
- `apps/api/src/projects/projects.service.spec.ts`
- architecture and operations memory files

Results: focused project service 12/12; isolated controller specs 3/3 and 8/8;
full API 62/318; workspace lint/typecheck; Nest build; `git diff --check`.
The first parallel full-suite attempt had two unrelated 5-second controller
timeouts; both isolated specs and the sequential full suite passed. Commit
`7332902e` was pushed to both target branches. Railway deployment
`21832e50-5f29-4471-979d-28bf90afbb48` is `SUCCESS`; startup logs show the API
initialized, live `/ready` and `/health` are 200, unauthenticated project
read/update boundaries are 401, and GitHub's exact API status is `success`.
Supabase remained read-only at 55/87. Vercel has zero new deployments/builds.

Rollback: revert the source commit or keep the project-write flag disabled;
no hosted state requires repair. Next: keep the protected project-write
canary closed pending the supported data-recovery gate.

## 2026-08-04 - M3.60 Nest project collection read contract

Added the missing collection-read handoff. Nest now serves `GET /v1/projects`
with explicit `project.read`, verified tenant scope, search/status/type
filters, allowlisted sort/order, and capped page/limit pagination. The Next
Projects page can opt in only for an allowlisted tenant; the legacy direct
query remains the default, and the adapter rejects wrong-tenant rows or
pagination drift.

Changed files:

- `packages/shared-types/src/erp-api/projects.ts` and tests
- `apps/api/src/projects/project-list.pipe.ts` and tests
- `apps/api/src/projects/projects.controller.ts`
- `apps/api/src/projects/projects.service.ts` and tests
- `apps/api/test/projects.e2e.spec.ts`
- `apps/web/src/lib/erp-core-client.ts` and tests
- `apps/web/src/lib/project-queries.ts` and tests
- environment examples/docs and architecture memory files

Results: API 62 files/318 tests; shared types 15/167; Web 75/484; API/Web
typecheck; API build; Web 80/80 production build; root lint; `git diff --check`.
Commit `78ad5f63` was pushed to both target branches. Railway deployment
`0e553e93-cb82-448f-8290-06956e89767d` is `SUCCESS`; startup logs show the
list route, live `/ready` and `/health` are 200, unauthenticated
`GET /v1/projects` is 401, and GitHub's exact API status is `success`.
Supabase remained read-only at 55/87. Vercel has zero new deployments/builds.

Rollback: leave `ERP_PROJECT_LISTS_VIA_API=false` and allowlist empty or
redeploy the prior successful Railway source; no hosted state requires repair.
Next: supported Supabase backup/export, dependent/audit export,
owner-approved duplicate-PO mapping, and disposable PostgreSQL 17 replay.

## 2026-08-04 - M3.59 Railway Nest Redis module wiring

The M3.58 Railway deployment built the API image but failed `/ready`. Railway
deploy logs identified the exact startup error: `ProviderQuotaService` could
not resolve `THIRD_CODE_ERP_REDIS_CLIENT` because the token was declared only
in `AppModule`. Moved the unchanged Redis factory and lifecycle into a shared
global `RedisModule`, exported the token, and imported it explicitly in the
root and quota modules.

Changed files:

- `apps/api/src/observability/redis.module.ts`
- `apps/api/src/observability/redis.module.spec.ts`
- `apps/api/src/observability/provider-quota.module.ts`
- `apps/api/src/app.module.ts`
- architecture and operations memory files

Results: focused Redis/quota 5/5; full API 61 files/313 tests; root lint, API
typecheck, Nest build, and `git diff --check` pass. Commit `d7f62faf` pushed to
`main` and `agent-02/third-code-erp-landing` as `kurtgav`. Railway deployment
`5f3e4a02-45c9-4142-a0d8-7629844076a7` is `SUCCESS`; startup logs show
`RedisModule` and `ProviderQuotaModule` initialized; GitHub's exact API check
is `success`; live `/ready` and `/health` are 200; unauthenticated project
read is 401. No database, Storage, Supabase migration, Railway setting, or
Vercel build/deploy changed.

Rollback: redeploy the prior successful Railway deployment or revert the
corrective source commit; no database state requires repair. Next: keep the
frontend spend gate and all canaries closed while the supported Supabase
backup/export, owner mapping, and disposable PostgreSQL 17 replay proceed.

## 2026-08-04 - M3.58 Nest project detail read contract

Added the first bounded project read handoff to the Nest modular monolith.
`GET /v1/projects/:id` requires the explicit `project.read` capability, derives
tenant scope from the verified principal, repeats the tenant/project predicate,
and returns a shared camelCase read model. The Next project detail page can opt
into it only for an allowlisted tenant; identity mismatches and unavailable
authority fail closed, while the default direct query remains unchanged.

Changed files:

- Nest project controller/service/capability map and focused/e2e tests
- `packages/shared-types/src/erp-api/projects.ts` and tests
- `apps/web/src/lib/erp-core-client.ts` and tests
- `apps/web/src/lib/project-queries.ts` and tests
- project detail page, environment examples, and environment documentation
- architecture and operations memory files

Results: focused API 26/26, shared types 4/4, Web core/project reads 77/77,
full Web 75/479, shared types 15/164, API typecheck/build, Web typecheck/build,
workspace lint, and `git diff --check`. The concurrent full API run had one
existing procurement controller timeout (311/312); isolated rerun passed 8/8.
No hosted SQL/data, Storage, provider setting, Railway setting, or Vercel
build changed.

Rollback: revert the source commit; keep `ERP_PROJECT_READS_VIA_API=false` and
its tenant list empty. No hosted state requires repair.
Next: supported Supabase backup/export, owner-approved duplicate-PO mapping,
disposable PostgreSQL 17 replay, then a separately approved tenant read canary.

## 2026-08-04 - M3.57 Stale Supabase refresh-token recovery

Read-only Vercel runtime errors identified refresh_token_not_found in
/middleware. Added a narrow recovery boundary: clear chunked Supabase auth
cookies, continue as anonymous, and preserve the existing protected-route
login redirect. Unknown errors still surface.

Changed files:

- apps/web/src/middleware.ts
- apps/web/src/lib/supabase-session-recovery.ts
- apps/web/src/middleware.test.ts
- apps/web/src/lib/supabase-session-recovery.test.ts
- architecture and operations memory files

Results: Web 75/476; focused recovery 5/5; Web typecheck; git diff --check;
and 80/80 production routes. No UI design/copy, Vercel build, Supabase
SQL/data, Storage, provider setting, or Railway setting changed.

Rollback: revert the M3.57 source commit; no hosted state needs repair.
Next: supported duplicate-PO backup/export and owner mapping; keep Vercel
spend protection closed.

## 2026-08-04 - M3.54 Cortex sources in the command palette

Added a low-cost, explicit Ask Cortex source path to the existing command
palette. The source contract is the existing tenant/role-scoped
`GET /api/cortex/search`; only actionable canonical links render. Source rows
open ERP records; the separate Ask Cortex row stages a draft only after an
explicit action. No browser database write, LLM/provider call, Python work,
queue, storage, migration, or transaction authority was introduced.

Changed files:

- `apps/web/src/components/nav/command-palette.tsx`
- `apps/web/src/lib/cortex/command-palette-search.ts`
- `apps/web/src/lib/cortex/command-palette-search.test.ts`
- `docs/research/components/command-palette-cortex-sources.spec.md`
- architecture and operations memory files (M3.54 entries)

Results: focused tests 14/14; full Web 72/465; workspace lint/typecheck;
`git diff --check`; and sequential 80/80-route production build pass. A first
parallel gate attempt was invalidated by a shared `.next` artifact race, not a
source failure. Authenticated palette visual proof remains deferred without a
real tenant credential; public/auth boundary checks remain read-only.

Cost/provider boundary: source `6c975261122c635668a4b80795549cb06fb63843`
was pushed once to both target branches as `kurtgav`. GitHub's exact Railway
check is `success`; live Railway `/ready` and `/health` are healthy. Vercel
Git deployment is disabled and there are zero deployments since
`1785840000000`; Supabase `aqqrtkmtcsfkbyyqxowv` is `ACTIVE_HEALTHY` with 55
applied migrations. No hosted mutation or frontend deploy occurred.

Rollback: revert `6c975261` to remove the palette source surface; no hosted
state needs repair. Next action is the existing duplicate-PO backup/export,
owner mapping, and disposable migration replay gate.

## 2026-08-04 - M3.55 Provider-backed burst cost guard

Reduced avoidable provider burst risk at Next middleware. `/api/cortex/chat`,
`/api/ai/chat`, and `/api/ai/similar-items` now share a 20/minute
authenticated (10 anonymous) bucket; `/api/cortex/embed` uses 6/2. General
traffic policy remains 1,000/100. Pure counter tests cover allow, block, and
window reset. This is per-instance edge protection, not global quota.

Changed files:

- `apps/web/src/middleware.ts`
- `apps/web/src/lib/request-rate-limit.ts`
- `apps/web/src/lib/request-rate-limit.test.ts`
- architecture and operations memory files (M3.55 entries)

Results: focused 5/5; Web 72/468; workspace lint/typecheck;
`git diff --check`; and sequential 80/80-route production build pass. No UI,
API payload, DB schema/data, Storage, provider setting, or Vercel deployment
changed.

Source `4d190dfdf01c753812f7d5924f8c269c8a9de8bd` pushed once to both target
branches as `kurtgav`. Rollback: revert source commit; no hosted state needs
repair. Next: supported duplicate-PO backup/export and owner mapping; later,
shared Redis quota in NestJS.

## 2026-08-04 - M3.56 Shared Redis provider quota gateway

Moved provider burst accounting seam into existing NestJS modular monolith.
Authenticated `/v1/provider-quotas/consume` derives tenant/user from verified
Supabase membership, authorizes `provider.quota.consume`, and runs atomic Redis
Lua counters for fixed chat/embedding buckets. Redis keys hash identity and
expire; no ERP content or transaction authority enters Redis. Next provider
routes call this seam only for an exact disabled-by-default tenant canary and
fail closed if accounting is unavailable.

Changed files:

- `apps/api/src/observability/provider-quota.*`
- `apps/api/src/auth/capability.guard.ts`
- `apps/api/src/app.module.ts`
- `apps/web/src/lib/erp-core-client.ts`
- `apps/web/src/lib/provider-quota.*`
- Cortex/AI provider route handlers
- `.env.example`, environment docs, architecture/operations docs
- landing behavior/spec artifacts

Results: API 60/308; Web 73/471; focused quota tests API 7/7 and Web 3/3;
workspace lint/typecheck; API build; `git diff --check`; Web 80/80 production
routes. Known intentional Web stderr remains the existing simulated
`provider down` retrieval test. No UI code, provider config, Vercel build,
Supabase SQL/data, or Storage mutation occurred.

Rollback: revert M3.56 source commit; default flags mean no hosted canary state
needs repair. Next: supported duplicate-PO backup/export and owner mapping;
activate quota only after Railway exact-SHA/Redis/auth replay evidence.

## 2026-08-04 - M3.53 Clean-room runtime branding audit

Audited production-facing source, metadata, assets, and the live public
landing. No forbidden ERPNext, Frappe, ABI Ops, or Rework.com marker appears
in the web/API/package product roots. Internal `Rework-alignment` comments and
the immutable migration filename remain classified provenance, not user-facing
branding.

Changed files:

- `apps/web/src/lib/branding-clean-room.test.ts`
- `docs/research/CLEAN_ROOM_REBRAND_AUDIT_20260804.md`
- architecture and operations memory files (M3.53 entries)

The regression now scans `apps/web/src`, `apps/web/public`, `apps/api/src`, and
`packages` text files, rejects seven marker variants, and identifies exact
offenders. Focused clean-room/landing tests pass 6/6; full Web passes 71/463;
workspace lint/typecheck and 80/80 build pass. Live Playwright at 1440/768/390
reports the expected title/H1/canonical/JSON-LD, zero forbidden markers,
zero overflow, and zero console errors.

Cost/provider boundary: source `0c911f8` was pushed once to both target
branches. GitHub/Railway is `success` with live `/ready` and `/health` healthy;
Vercel was read-only with zero new deployments. Supabase, Storage, Railway
settings, and hosted data were not changed; migrations remain at 55 applied.
Next action is the existing backup/export/owner-mapping migration gate.

## 2026-08-04 - M3.52 Cortex operational brief presentation

Implemented the visual Cortex operating pulse over the M3.51 read contract.
The page now calls the bounded server brief once, normalizes it through the
entity registry, and renders a responsive source-link panel with freshness,
snapshot time, permission scope, provenance, and graph connection counts.
Rows use bounded GSAP fade/scale entrance and respect reduced motion. Empty,
unknown-source, and title/summary normalization cases are covered. The panel
does not write, call an LLM, invoke Python, or authorize ERP transactions.

Changed files:

- `apps/web/src/app/(dashboard)/cortex/page.tsx`
- `apps/web/src/components/cortex/cortex-brief-panel.tsx`
- `apps/web/src/components/cortex/cortex-brief-panel.module.css`
- `apps/web/src/components/cortex/cortex-brief-panel.test.tsx`
- `apps/web/src/lib/cortex/brief-presentation.ts`
- `apps/web/src/lib/cortex/brief-presentation.test.ts`
- `docs/research/components/cortex-operational-brief.spec.md`
- architecture and operations memory files (M3.52 entries)

Results: focused Cortex tests 9/9; Web 71 files/463 tests; workspace lint and
typecheck pass; `git diff --check` pass; production build 80/80 routes pass.
Local Playwright checks at 1440/768/390 show the public landing title/H1,
zero horizontal overflow, and zero console errors. `/cortex` redirected to
`/auth/login` without a session, so no real tenant credential was used.

Cost/data controls: source and docs were pushed once to both target branches
as `kurtgav`. GitHub's exact check is `success`; Railway `/ready` and `/health`
are healthy. Vercel remains Git-disabled and its read-only inventory reports
zero new deployments. Supabase `aqqrtkmtcsfkbyyqxowv` remains
`ACTIVE_HEALTHY` at 55 applied migrations. No hosted DB, Storage, Vercel, or
Railway setting mutation occurred.

Rollback: revert source `1e5aa4d` (or deploy only the retained prior approved
frontend release after explicit spend approval); no hosted state needs repair.
Next action: recoverable backup plus dependent-row/audit export and
owner-approved canonical mapping for the duplicate Purchase Order group,
followed by disposable replay. Keep Vercel and Supabase closed.

## 2026-08-04 - M3.51 Cortex operational brief

Implemented a source-only Cortex operating pulse. `packages/database` now
exports `getCortexOperationalBrief`, which runs bounded tenant/role-scoped
reads over current graph nodes and returns freshness counts plus existing graph
statistics. `apps/web` adds `GET /api/cortex/brief`; it accepts only a bounded
limit, applies the authenticated role scope, filters through the entity registry,
and emits private no-store headers with safe deep links. No canonical ERP write,
LLM/provider call, Python approval, migration, hosted DB change, or Vercel
deployment occurred.

Changed files:

- `packages/database/src/cortex/brief.ts`
- `packages/database/src/index.ts`
- `apps/web/src/app/api/cortex/brief/route.ts`
- `apps/web/src/app/api/cortex/brief/route.test.ts`
- architecture and operations memory files (M3.51 entries)

Focused results: database typecheck passed; web typecheck passed; all Cortex API
tests passed (8 files / 35 tests); database suite passed (41 files / 166 tests,
140 integration tests skipped because `DATABASE_URL` is unset). The workspace
lint/typecheck passed and the production build passed with 80/80 routes. The
Turbo-parallel test run had one API resource-contention timeout in the
stock-receipt controller; package-isolated reruns passed API 58/300, Web 69/458,
Database 41/166, and Shared Types 15/163. One initial database attempt used
unsupported Vitest `--runInBand`; it was rerun with the repository script and
passed.

Spend boundary: Vercel remains Git-disabled and no preview/production build was
started. Supabase remains read-only at the known migration boundary. The next
gate is the existing migration backup/export and owner-review sequence.

Provider result: `cfffa7a756609c49fa84b293ec71611c892182dd` is present on both
target branches. GitHub's exact `ERP - Third Code ERP API` check is `success`;
Railway `/ready` returned 200 with database/Redis `ok` and `/health` returned 200
with `ok`. Vercel's read-only inventory returned zero new deployments and
Supabase stayed at 55 applied migrations. No hosted DB, Storage, Vercel, or
Railway setting mutation occurred.

## 2026-08-04 - M3.50 cost-capped provider and migration audit

Rechecked the configured providers before any deployment action. GitHub
identity is `kurtgav`; `Third-Code-Solutions/ERP` grants push/admin access and
both target branches carry the reviewed source plus the docs-only audit
checkpoints. The exact-SHA Railway check is `success`; the API release remains
healthy. This checkpoint changed docs only, so no new API deployment was
needed.

Ran:

- `node --env-file=apps/web/.env.local scripts/plan-database-release.mjs --json`
- `node --env-file=apps/web/.env.local scripts/plan-purchase-order-duplicates.mjs --json --require-clear`
- Supabase project, migration, branch, and advisor read checks
- Vercel project/deployment inventory read check

Results: Supabase `aqqrtkmtcsfkbyyqxowv` is `ACTIVE_HEALTHY` on PostgreSQL 17
with 55 applied / 87 source migrations. The ledger is a linear prefix with 32
pending files. The duplicate planner returned `review_required`: one
tenant-scoped group, 12 Purchase Order records, opaque output only, exit code
2 by design. Supabase advisors returned 14 security notices (11 WARN) and 282
performance notices (1 WARN); no advisory fix was applied in this checkpoint.

Spend boundary: `apps/web/vercel.json` has Git deployment disabled; Vercel is
`live:false` and reported zero new deployments after the push. No Vercel
preview/production build, Supabase SQL/data change, Storage mutation, Railway
setting change, or feature-flag enablement occurred.

Rollback: docs can revert to the prior checkpoint `bbd0e39`; no hosted state
needs reversal.
Next action: supported backup plus dependent-row/audit export and owner-approved
duplicate mapping, followed by disposable replay and ordered migration review.

## 2026-08-04 - M3.49 supplier confirmation review portal

Implemented the bounded US-014 supplier review slice. The Nest public
controller now has a closed-by-default token-scoped GET model that repeats
tenant predicates across session, Purchase Order, vendor, project, and line
items. Shared Zod contracts omit tenant/user/token-hash fields and keep money
as integer centavos. The Next portal renders order context and a responsive
Accept / Request changes / Decline form; its server action calls the Nest
command with an idempotency key and never writes directly to PostgreSQL.

Validation: API 58 files/300 tests, Web 68 files/454 tests, shared types 15
files/163 tests; workspace lint/typecheck pass; `git diff --check` pass; the
production build passes with 79/79 routes. A local production request returned
HTTP 200 with the closed-gate support state. No Supabase migration/data,
Storage, Railway setting, or Vercel deployment changed. Keep the read/write
flags false/empty and do not call the source slice production until the
duplicate-PO repair, hosted suffix, token, rollback, provider, and spend gates
are complete.

Release evidence: commit `386fd2a` is pushed to `main` and
`agent-02/third-code-erp-landing` as `kurtgav`. GitHub's exact-SHA Railway
check is `success`; Railway deployment
`430e835a-c2bc-4dfb-8994-a5b7e5a0e1ce` is `SUCCESS`, `/ready` is database/Redis
healthy, `/health` is `ok`, and a valid-format public read probe returns
`503` by design. Vercel's read-only query found zero deployments after the
push. Supabase is unchanged at 55 migrations; the latest branch-action log
still reports the duplicate-PO `P0001` preflight. No hosted DB or paid
frontend deployment was performed.

## 2026-08-04 - M3.48 landing GEO structured data

Added a pure structured-data builder and focused tests. The landing route now
links the public organization, website, page, product, and FAQ graph, with
en-PH metadata, Philippines service area, feature evidence, and stable IDs. No
visual component or authenticated ERP data path changed.

Validation: focused 5/5; Web 67 files/451 tests; workspace lint/typecheck,
`git diff --check`, and the 79/79-route production build pass. Local production
HTML returned 200 and included Third Code ERP/`WebSite`/`FAQPage` markers with
no ABI Ops, ERPNext, or Frappe identifiers.

Release boundary: source/docs only. No Supabase SQL/data/Storage, Railway
setting/deployment, or Vercel build/promotion. Supabase remains blocked by the
duplicate `PO-0002` migration preflight; Vercel remains disconnected and
spend-protected. Exact next action: preserve the verified source/provider
state, then obtain the supported Supabase backup and owner-approved duplicate
`PO-0002` repair before any DB replay or paid frontend deployment.
Post-push evidence: `ce1ae6e` is on `main` and
`agent-02/third-code-erp-landing` as `kurtgav`; GitHub's exact-SHA Railway
check is `success`, Railway recorded the commit as `SKIPPED` with reason
`No changes to watched files`, and live `/ready`/`/health` are 200. Vercel's
post-push query returned zero deployments; the public site is still the older
release (HTTP 200, brand/FAQ present, new `WebSite` graph absent). Supabase's
default branch is `MIGRATIONS_FAILED` at 55 migrations, with the latest
branch-action log failing the duplicate `PO-0002` uniqueness preflight using
`SQLSTATE P0001`. No hosted DB or paid deployment was performed.

## 2026-08-04 - M3.47 proposal read tenant scope

Closed a query-level tenant-isolation gap in the proposal overview and client
change-request log. Account joins and PPRF, inspection, design, and
change-request reads now repeat the authenticated tenant predicate; nullable
design joins do too. Corrected US-009's stale Dev-stub inventory entry.

Validation: focused proposal actions 2/2; Web 66 files/450 tests; workspace
lint/typecheck, `git diff --check`, and the 79/79-route production build pass.
No hosted SQL/data, Storage, Railway setting/deployment, or Vercel build was
changed. Exact next action: push once, verify providers, and retain the
Supabase/Vercel release gates.
Post-push evidence: source/docs `5a5e525` are on both target branches as
`kurtgav`; GitHub's exact-SHA Railway check is `success`. Railway skipped the
frontend/docs-only commit because no API watch files changed; `/ready` and
`/health` remain 200. Vercel's read-only deployment query returned zero new
deployments. Supabase remains at 55 migrations; branch status is currently
`MIGRATIONS_FAILED`; the last successful logs read fails the duplicate-PO
preflight with `P0001`. A later logs request returned `INVALID_ARGUMENT`, so
no newer outcome is inferred. No hosted SQL/data was applied.

## 2026-08-04 - M3.46 command palette accessibility and race safety

Implemented a bounded universal-search slice. The Search/Ask Cortex input now
owns combobox semantics and the labelled result list exposes stable active
option IDs. Arrow navigation wraps, status messages are announced, stale hits
clear before debounce, and a request sequence guard prevents an older response
from overwriting a newer term. Added pure helper tests and the measured spec/
changeset.

Validation: focused navigation/selection 7/7; Web 66 files/450 tests;
workspace lint/typecheck, `git diff --check`, and the 79/79-route production
build pass. Authenticated browser proof remains a provider-runtime gate when
local Supabase DNS is unavailable. No Supabase SQL/row/Storage change, Railway
setting/deployment mutation, or Vercel build/promotion occurred.

Post-push evidence: source/docs `0a085b7` are on both target branches as
`kurtgav`; GitHub's exact-SHA Railway check is `success`. Railway recorded
`SKIPPED` because no watched API files changed, and the existing service is
Online with `/ready` and `/health` 200. Supabase remains at 55/87 with the
protected duplicate-PO failure. Vercel's deployment query returned zero new
deployments, preserving the spend boundary.

Exact next action: authenticated desktop/mobile palette proof from a runtime
with working Supabase DNS, then supported backup and owner-approved duplicate
Purchase Order repair before ordered migration replay.

## 2026-08-04 - M3.45 Cortex search accessibility

Implemented the next bounded Cortex/Obsidian UX slice. The graph search now
supports arrow-key selection with wrapping, skips unavailable destinations,
opens the active or first actionable result on Enter, and closes the result
list with Escape. Loading, empty, and retrieval-error states are explicit;
ARIA controls expose the listbox and active result; new terms clear stale
results before the debounce request.

Changed source: `apps/web/src/components/cortex/cortex-graph-view.tsx`,
`apps/web/src/lib/cortex/search-navigation.ts`, its tests, and the Cortex
search rule in `apps/web/src/app/globals.css`. Added the measured spec and
changeset under `docs/research/components/` and `docs/changesets/`.
Source commit: `71c5cba`.

Validation: focused 3/3; Web 65 files/447 tests; workspace lint, typecheck,
`git diff --check`, and Next production build 79/79 routes passed. Browser
verification confirmed the unauthenticated `/cortex` redirect to `/auth/login`
with zero console errors. Authenticated Cortex replay reached the route but
failed closed because the local Next Edge runtime could not resolve the
configured Supabase host (`ETIMEDOUT`/`ENOTFOUND`); this is recorded as an
open provider-runtime gate, not a pass.

Release boundary: no Supabase SQL, hosted row, Storage object, migration
history, Railway variable/deployment setting, or Vercel build/promotion
changed. Vercel remains disconnected and spend-protected. Exact next action:
repeat authenticated desktop/mobile proof from a runtime with working
Supabase DNS, then continue the supported backup and owner-approved duplicate
Purchase Order repair gate.

Post-push evidence: source/evidence `e6fe073` are on both target branches as
`kurtgav`. GitHub's exact-SHA Railway check is `success`; Railway project
`a21fd382-80b2-4218-8025-11f420a062e3` service
`c45b3d01-036a-4663-a524-0713d782fce3` remains online and live `/ready` plus
`/health` return 200. Supabase is unchanged at 55 migrations with the
protected duplicate-PO failure. Vercel's read-only deployment query returns
zero deployments after the push, so no paid build was triggered.

## 2026-08-04 - M3.44 admin data-quality review

Implemented the next smallest original ERP slice after the hosted
reconciliation audit: an admin-only, server-rendered, read-only report for
duplicate Purchase Order numbers. The route repeats `tenant_id` on both
queries, caps groups/records, surfaces live status counts, and links to
existing Purchase Order records without adding any mutation authority.

Changed source: `apps/web/src/app/(dashboard)/admin/page.tsx`, the new
`apps/web/src/app/(dashboard)/admin/data-quality/` page/CSS, the new
`apps/web/src/lib/admin/data-quality-queries.ts` and pure tests. Added the
measured spec at `docs/research/components/admin-data-quality.spec.md`.
Source commit: `63bbf22`.

Validation: focused 2/2; Web 64 files/444 tests; API 294; shared-types 162;
database 166 executed with 140 environment-gated skips; lint, typecheck,
`git diff --check`, and Next production build 79/79 routes passed. Authenticated
browser MCP proof at 1440px and 390px rendered one duplicate group and 12
records, showed no repair controls, had no horizontal overflow, and produced
no new console errors. Local Next dev server was stopped after proof.

Release boundary before provider verification: no Supabase SQL, hosted row,
Storage object, migration history, Railway setting/deployment action, or Vercel
build/promotion changed. Supabase remains the verified 55-row prefix with its
safe duplicate preflight failure; Vercel remains disconnected and
spend-protected.

Post-push evidence: source `63bbf22` and docs `eab1719` were pushed to both
target branches as `kurtgav`. GitHub's exact-commit Railway check is
`success`; Railway project/service are online and `/ready` plus `/health`
return 200. The latest Vercel deployment remains the older SHA `ca9ff6d` and
no deployment was triggered for this milestone. Exact next action: supported
backup, dependent-row/audit export, owner-approved duplicate repair, and only
then ordered migration replay.

## 2026-08-04 - M3.43 Supabase reconciliation gate

Performed the supported-provider read-only audit before attempting any hosted
DB change. Supabase project health is `ACTIVE_HEALTHY`, but its protected main
branch is `MIGRATIONS_FAILED` at the first pending source file
`20260801090000_purchase_order_create_idempotency.sql`. Branch-action logs
show the migration stopped safely because tenant
`2b2b039c-b066-412b-af4c-564f2af6097e` contains 12 `PO-0002` purchase orders.

Reconciled 87 source migrations versus 55 hosted migrations; 88 public tables
all have RLS enabled, three internal tables have no policies, Storage has one
private `documents` bucket with 37 objects, and advisors returned 14 security
and 282 performance findings. Added the detailed evidence record at
`docs/research/supabase-reconciliation-20260804.md`.

Release boundary: no SQL, data, Storage, migration history, Railway variable,
or Vercel build changed. Do not retry the suffix, reset the protected branch,
or auto-repair duplicate business records. Exact next action: supported
backup/restore, owner-approved canonical duplicate repair, then ordered suffix
replay and full catalog/RLS/Storage verification.

## 2026-08-04 - M3.42 Project Command Center

Implemented the next smallest original construction ERP slice after Today:
the project detail page now leads with a read-only command center for work,
evidence, decisions, punchlist, deliveries, progress, and next move. The
query layer repeats tenant/project predicates and joins deliveries through
same-tenant project purchase orders. No component or Python service approves
or commits an ERP record. The tab strip and project overview grids now stay
inside the viewport on mobile.

Changed source: `apps/web/src/lib/project-queries.ts`,
`apps/web/src/app/(dashboard)/projects/[id]/page.tsx`, its page CSS,
`apps/web/src/components/projects/project-command-center.tsx`, its CSS/test,
and `apps/web/src/components/projects/project-tabs.tsx`. Added the measured
spec at `docs/research/components/project-command-center.spec.md`.
Source commit: `a225340`.

Validation: focused 4/4; full workspace suite green (Web 63 files / 442,
API 294, shared 162, database 166 executed with environment skips); lint,
typecheck, `git diff --check`, and production build 78/78 routes passed.
Authenticated browser MCP proof passed at 390px and 1440px with four signal
cards, command-center heading, zero horizontal overflow, and zero console
errors. A local dev build initially exposed Date encoding and a stale HMR
hydration mismatch; the ISO boundary fix, clean server restart, cache-disabled
reload, and final HTTP 200 verification closed both issues.

Release boundary: no Supabase SQL, hosted row, Storage object, Railway
variable/deployment, or Vercel build/promotion changed. Supabase remains the
55-row prefix; Vercel remains disconnected and spend-protected. Exact next
action: push source plus docs once, verify exact GitHub/Railway identity and
live readiness, then continue the supported Supabase reconciliation gate.

## 2026-08-04 - M3.41 read-only Today Command Center

Implemented the smallest post-PRD product slice. The dashboard now presents
Today, a due/attention/next summary, an assignee-scoped work queue, and a
policy-gated Project Command Center with explicit Cortex context links. The
query layer joins only same-tenant projects and keeps viewer roles on the
private project state; no React component performs a critical write.

Changed source: `apps/web/src/lib/dashboard-queries.ts`,
`apps/web/src/components/dashboard/today-command-center.tsx`, its CSS module
and test, `apps/web/src/app/(dashboard)/dashboard/page.tsx`, and
`apps/web/e2e/dashboard-role-local.spec.ts`. Source commit:
`ab905091ada2f7db927e6cf4c2de687ee2010194`.

Validation: focused Today 2/2; Web 62 files / 440 tests; lint, typecheck,
production build 78 routes, and `git diff --check` passed. Browser MCP role
proof passed for viewer at 390px and 1440px with no horizontal overflow,
executive content hidden, Cortex handoff working, and zero console errors.
Playwright CLI E2E was not executable because the configured Chromium binary
is missing. No Supabase SQL, hosted row, Storage object, Railway variable, or
Vercel build/promotion changed.

Exact next action: push source plus docs once, verify the exact Railway
release and live readiness, then retain the Supabase/Vercel release gates.

## 2026-08-04 - M3.40 governing BuildOps product contract

Audited the active source and provider boundaries before editing. Confirmed
the TypeScript Next.js/NestJS modular monolith, PostgreSQL/Redis boundaries,
existing Python advisory services, tenant/RLS/auth/audit foundations, current
87-migration source versus the hosted 55-row Supabase prefix, Railway
readiness, and Vercel spend protection. A runtime-source scan under `apps`,
`packages`, and `supabase` found no ERPNext, Frappe, or ABI Ops marker.

Rechecked the public landing at 1440, 768, and 390px: no horizontal overflow,
the Satoshi editorial hero and responsive controls are intact, and accordion,
carousel, FAQ, and Cortex preview interactions remain usable. Added
`docs/BuildOps_PRD_v1.md` and recorded D-149 plus current/target/migration/
next-action updates. This milestone is documentation-only: no hosted SQL,
business data, Storage object, Railway variable, Vercel build, or domain
promotion changed.

Committed as `a66b43bd9c1694f19de69ad3f0a49808fc41b8fd` and pushed to both
`main` and `agent-02/third-code-erp-landing` under `kurtgav`. The GitHub
Railway check is successful; live API `/ready` and `/health` returned 200 with
PostgreSQL and Redis healthy. Read-only Supabase verification returned 55
applied migrations with head `20260729233017`, no project-create idempotency
table, and the pre-existing `MIGRATIONS_FAILED` branch state. Vercel remains
Git-disconnected and no build/promotion was created.

Exact next action: obtain supported Supabase migration-reconciliation and
recoverable backup/catalog/data/RLS evidence. Keep project-create flags closed,
Vercel disconnected, and provider spend bounded; then implement one
authorized read-only Today/Project Command Center slice.

## 2026-08-04 - M3.38 guarded project-create Nest authority seam

Read the current architecture, migration gates, capability matrix, and clean-
room runtime scan before editing. Implemented source checkpoint `7f3a9fc`:
strict shared project-create command/result schemas; Nest validation,
capability guard, controller, transaction, tenant scope, actor/audit context;
typed frontend adapter; and independent server/frontend tenant flags. The
existing direct Server Action remains the default; selected core calls fail
closed rather than falling back.

Validation: shared 162/162; API serial 57 files / 291 tests; web 438/438;
lint/typecheck; production build 78/78 pages; `git diff --check` clean. A
parallel test invocation had two unrelated API 5-second contention timeouts;
the serial Turbo invocation passed. Supabase SQL/data/Storage and Railway
variables were unchanged. The GitHub-connected Railway main push completed
deployment `36530493-b9a9-4c1e-9c7a-dd0671a198ed` successfully; no Vercel build,
Git reconnection, or domain promotion was performed.

Exact next action: add durable tenant-scoped project-create idempotency and
replay/conflict tests before any canary or hosted migration.

## 2026-08-04 - M3.37 live-provider incident and catalog reconciliation audit

Read-only checks verified the source and provider boundary after M3.36. Both
GitHub target branches point to `318b7e0d9efdc115624d70a43384f086d10a73b2`
under `kurtgav`; Railway `/ready` and `/health` returned HTTP 200 with
database/Redis healthy. Vercel remains Git-disconnected and `live:false`.

Vercel runtime evidence grouped the reported digest `862076041` with the
historical `partial_delivered` enum error on deployment
`dpl_2WnStFHAqLchG71rjWKjvyEBY3WK` (SHA `2112728`). The current Supabase enum
contains `partial_delivered`, and the public unauthenticated dashboard probe
returns `307 /auth/login`; no current error was inferred from the historical
cluster. No build, promotion, Git reconnection, or billing-affecting Vercel
operation was performed.

The Supabase planner and catalog probes still show a linear 55/86 migration
prefix and 88 hosted public tables versus 111 in the fresh 86-migration clone;
23 pending source-suffix table objects are absent. All 88 hosted public tables
have RLS enabled. Security/performance advisor findings remain tracked and
unfixed. No Supabase SQL, migration-history row, Storage object, business
data, or provider setting changed.

Exact next action: approved backup/clone, full catalog/data/RLS diff, zero-skip
replay plus Cortex two-tenant authorization evidence, rollback/recovery, and
spend-bounded release gates before any hosted SQL or Vercel promotion.

The disposable lane was rerun after the audit and passed all 86 migrations,
schema hash `DDBBB7421C09146F9F34B816679135F6D33EBCB19BF10996C5F187B87606C91D`,
database 300/300 with zero skips, and API integration 15 files / 22 tests.
Only the expected local Redis overcommit warning appeared; the disposable
Redis process was stopped.

## 2026-08-04 - M3.36 supplier-issued outbox replay and correction

Ran the disposable PostgreSQL 17 + Redis lane after the M3.35 browser proof.
The first attempt applied the source migrations but failed the Purchase Order
workflow integration because `notification_outbox` rejected the optional
`vendor_confirmation_session_id` emitted by `scm_issue`. This was a source
contract defect, not a hosted/provider failure.

Added `supabase/migrations/20260803170000_purchase_order_supplier_session_payload.sql`
as a forward-only constraint replacement and extended
`packages/database/src/__tests__/notification-outbox.test.ts` to lock the
allowlist and UUID/null contract. Focused tests passed database 8/8 and shared
procurement 21/21. Corrected replay passed 86/86 migrations, schema hash
`DDBBB7421C09146F9F34B816679135F6D33EBCB19BF10996C5F187B87606C91D`, database
300/300 without skips, and API integration 15 files / 22 tests. Root lint,
typecheck, full tests, and production build passed. The local lane was stopped.

No Supabase SQL/data/Storage, Railway setting/deployment, or Vercel deployment
changed. Ordinary non-`DATABASE_URL` tests still show their documented 137
database skips; Redis printed only its local memory-overcommit warning.

Source commit `11c8168248edc02eed93aff9be0204c12559152b` was pushed to both
target branches under `kurtgav`. Railway auto-deployed deployment
`52dca77c-5bec-442f-85cd-f1cd81bde478`; live `/ready` and `/health` returned
200 with database/Redis healthy. Vercel Git remains disconnected and no new
build was created because its project is `live:false` and spend protection is
active. Supabase stayed at 55 migrations with no SQL/data mutation.

Exact next action: keep hosted database migration and frontend promotion
blocked pending backup/restore, catalog/data/RLS, duplicate/audit/rollback,
owner, provider, and spend gates.

## 2026-08-04 - M3.35 authenticated Cortex browser proof

Restarted stale local Next.js cache after `/auth/login` exposed
`Cannot find module './3255.js'` from `.next`; verified exact repo process and
rebuilt generated cache. Fresh local runtime returned 307 login redirects for
`/cortex`, `/finance`, and `/inventory`; unauthenticated `/api/cortex/search`
returned 401 JSON with `private, no-store, max-age=0` and `Vary: Cookie`.

Extended `apps/web/e2e/cortex-focused-local.spec.ts` with persistent boundary
assertions. Authenticated graph/deep-link/browser proof passed 1/1; viewer-role
dashboard proof passed 1/1. Evidence covered authorized graph scope, focused
record navigation, conversation search/deep links, role-hidden executive data,
tenant search privacy, and zero overflow at desktop/tablet/mobile sizes.
One-time demo auth session was revoked after each run; no business-table write,
Supabase migration, Railway setting, or Vercel deployment occurred.

Limitation: configured Supabase target is demo data, not isolated disposable
PostgreSQL/Redis. Two-tenant cross-tenant, citation, redaction, audit-replay,
and rollback evidence remains open before hosted release.

## 2026-08-04 - M3.34 authenticated browser route boundary

Audited local unauthenticated Cortex navigation and found middleware omitted
`/cortex`; finance and inventory were also absent from the protected-prefix
list. Before the change, `/cortex` rendered `Workspace not set up`; after the
change, Playwright observed `/auth/login` with the Third Code ERP sign-in form.

Added `apps/web/src/lib/protected-route.ts` with a shared, segment-safe prefix
contract and `protected-route.test.ts`; middleware now imports the contract.
The `/api/cortex/*` family remains outside browser redirects so API handlers
retain 401/403 behavior and private response headers. Added the route-boundary
spec at `docs/research/components/cortex-auth-route.spec.md`.

Validation: focused route test 2/2; full web tests 436/436; root lint and
typecheck passed; production build generated 78/78 pages; `git diff --check`
passed. Browser redirect verified locally. Existing local dev asset MIME/404
console noise remained on the stale process but did not affect redirect or
sign-in snapshot. No Supabase SQL/data/Storage, Railway setting/deployment,
Vercel deployment, or provider mutation changed.

Exact next action: authenticated disposable-tenant browser proof for allowed,
denied, cross-tenant, redacted, citation, and private-header Cortex flows.

## 2026-08-04 - M3.33 authenticated Cortex transport privacy

Audited the authenticated Cortex route family and found inconsistent response
cache directives: search was already `private, no-store`, graph allowed a
private 15-second cache, and entity/conversation/embed responses had no
explicit privacy contract. Added the shared
`apps/web/src/lib/cortex/response.ts` header constant and applied it to all
route success/error paths without changing request bodies, stream framing,
citations, tenant filters, or mutation authority.

Changed route/test files under `apps/web/src/app/api/cortex/`, the shared
response helper, and
`docs/research/components/cortex-private-response.spec.md`. Focused route
tests passed 31/31 across chat, search, graph, entity, conversations, and
embed; web lint and web typecheck passed. Local unauthenticated probes returned
401 with `private, no-store, max-age=0` and `Vary` containing `Cookie` for all
protected POST/read handlers. GET probes for POST-only routes returned the
framework 405 and are not application handler responses.

Full validation passed: API 287 tests, shared types 159, web 434, database 162
passed with 137 environment-skipped; root lint/typecheck passed; production
build generated 78/78 pages; `git diff --check` passed. Commit `36a37e9` was
pushed to `main` and `agent-02/third-code-erp-landing` under `kurtgav` and
verified via the GitHub connector. Supabase remains at 55 migrations. Vercel's
latest connector-listed artifact predates this commit, so no Vercel deployment
was created. Railway `/ready` and `/health` remain green; no manual Railway
deployment or provider setting changed.

Exact next action: perform an authenticated disposable-tenant browser
permission/citation audit before any live-data or provider promotion.

## 2026-08-04 - M3.32 landing Cortex preview and UI reconnaissance

Reverse-engineered the live landing at `https://thirdcode-erp.vercel.app/`
with Playwright at 1440px, 768px, and 390px. Captured desktop/mobile reference
screenshots, measured fonts/colors/layout/scroll states, swept capability,
workflow, carousel, FAQ, hover, and responsive behavior, and wrote
`docs/research/BEHAVIORS.md`, `PAGE_TOPOLOGY.md`, and seven component specs.

Added a read-only Cortex preview to
`apps/web/src/components/marketing/third-code-landing.tsx` with three bounded
sample questions, `aria-pressed` state, answer/source chips, and no network or
database write. Added scoped styles and a source-contract test.

Validation: focused landing tests 4/4; full web tests 432/432; root lint passed;
root production build passed with Next.js 78/78 pages and Nest build; full
workspace tests passed (API 287/287, shared types 159/159, database 162 passed
and 137 skipped without `DATABASE_URL`); local browser QA had zero console
errors and no horizontal overflow at 390px. One existing Next LCP priority
warning remains. No Supabase/Railway/Vercel hosted state changed.

Changed files: `apps/web/src/components/marketing/third-code-landing.tsx`,
`apps/web/src/components/marketing/third-code-landing.module.css`,
`apps/web/src/components/marketing/third-code-landing.test.ts`, the seven
`docs/research/components/*.spec.md` files, `docs/research/BEHAVIORS.md`,
`docs/research/PAGE_TOPOLOGY.md`, and four local design-reference screenshots.
Commit/push evidence: `8484a6c5307c29d511fefb3b578eb1fec0d5bf8d` is verified on
GitHub `main` and `agent-02/third-code-erp-landing` under `kurtgav`. Railway
remains deployment `7d2a078d-605f-49e9-a299-12c9667a153b`; `/ready` reports
database and Redis ok and `/health` reports ok. Vercel's latest deployment
predates this commit, so no new deployment was created. Supabase remains at 55
hosted migrations with head `20260729233017_notification_outbox_foundation`;
no SQL or hosted data changed. Exact next action: audit authenticated Cortex
permission/citation behavior before wiring any live data or marketing CTA.
Unresolved release risk: Vercel CLI is not authorized in this workspace and the
connected deployment listing has no artifact for `8c95537`; the public HTML
therefore does not yet contain the new Cortex preview. Do not retry deployment
until the `pavi-2e9809a4` Vercel team authorizes one controlled prebuilt release.

## 2026-08-04 - M3.31 Supabase reconciliation audit (read-only)

Audited source and hosted migration ledgers for the authorized Supabase
project. Source contains 85 migration files; hosted history contains 55 rows
through `20260729233017_notification_outbox_foundation`, an exact prefix with
30 pending source files through `20260803160000_vendor_confirmation_session_minting`.
PostgreSQL is `server_version_num = 170006`. The ordered suffix manifest is
`9fb0a2f55000bdddc7bb6c3b3dcea9f6243a8b49873609b7490323259eb4a260`.

The read-only scan found no `DROP TABLE`, `DELETE FROM`, `TRUNCATE`, or data
update; it found 24 `DROP CONSTRAINT IF EXISTS` operations and six explicit
transaction blocks. A catalog query covering 23 expected pending tables
returned zero rows. Supabase advisors reported 14 security and 282
performance findings; no fixes were applied.

No Supabase SQL/history/data/Storage, Railway variable, provider setting, or
Vercel deployment changed. Status is `BLOCKED_FOR_HOSTED_APPLY` pending backup
and Storage evidence, isolated clone replay, catalog/data/RLS diff,
zero-skipped integration/recovery tests, owner approvals, and spend-bounded
canary proof. Exact next action is recorded in
`docs/architecture/DATABASE_RECONCILIATION_M3.31.md`.

Changed files: `docs/architecture/CURRENT_STATE.md`,
`docs/architecture/DATABASE_RECONCILIATION_M3.31.md`,
`docs/architecture/DECISIONS.md`, `docs/architecture/MIGRATION_PLAN.md`,
`docs/architecture/TARGET_STATE.md`, `docs/operations/NEXT_ACTIONS.md`,
`docs/operations/WORK_LOG.md`, and `docs/runbooks/database-release.md`.
Validation: database-release planner tests 7/7; `pnpm lint`; `pnpm build`
(Next.js 78/78 pages and Nest build); staged `git diff --check`; hosted
planner `review_required` with no SQL executed. Commit `878e372` was pushed
to both target branches under `kurtgav`; Railway stayed on healthy deployment
`7d2a078d-605f-49e9-a299-12c9667a153b`; Vercel created no deployment for this
docs-only commit.

## 2026-08-04 - M3.30 gated supplier confirmation links (source slice)

Added source-only supplier confirmation-link reconstruction to the existing
email delivery worker. No Supabase SQL, provider setting, Vercel deployment,
or hosted data changed.

- Added a separate link-delivery and HTTPS-base-url configuration boundary.
- Verified both the link tenant allowlist and public-write tenant allowlist
  before querying a session.
- Added tenant/PO scope, pending-state, and expiry checks inside the supplier
  delivery claim transaction; the HMAC token is derived only in memory.
- Added optional escaped HTML/text link rendering without changing the
  existing email when the controls are closed.
- Validation: API procurement 124/124; link/config/email focus 45/45; shared
  types 159/159; database 162 passed and 137 skipped because `DATABASE_URL`
  is unset; web 431/431; API/web typecheck and Nest build passed; root
  production build generated 78/78 pages; all five release-plan suites,
  workflow action references, and `git diff --check` passed.
- Published commit `fcc2434969679159d6e7f5fa0212d490e50cac1f` to GitHub
  `main` and `agent-02/third-code-erp-landing` with the `kurtgav` credential.
  Railway deployment `7d2a078d-605f-49e9-a299-12c9667a153b` reached `SUCCESS`;
  `/ready` returned 200 with database/Redis healthy, `/health` returned 200,
  and a valid-format public confirmation probe returned 503 as the closed
  gate requires. Supabase remained read-only at 55 migrations with no new
  confirmation tables; Vercel produced no deployment for this commit.

## 2026-08-03 - M3.29 protected supplier-session minting

Completed and validated the source implementation for deterministic supplier
confirmation-session minting at SCM Purchase Order issuance. This remains a
closed source slice: no Supabase SQL, hosted feature flag, Vercel deployment,
email-link delivery, or hosted data changed.

- Added the source migration and Drizzle schema boundary for the workflow
  request association, tenant-scoped pending-session uniqueness, and composite
  tenant foreign key.
- Added a server-only HMAC token derivation helper. PostgreSQL, audit metadata,
  and notification outbox JSON receive only the SHA-256 hash and session UUID;
  the raw token is never persisted or emitted.
- Added a separate tenant allowlist/secret/TTL gate. Minting is disabled by
  default, validates configuration before database access, reuses compatible
  sessions, and rejects Purchase Order/vendor scope drift.
- Integrated minting into the existing `scm_issue` transaction without
  changing supplier email copy, retry behavior, or delivery processing.

Validation:

- Shared-types full suite: 159/159; database full suite: 162 passed, 137
  skipped because `DATABASE_URL` is not configured locally.
- API procurement suite: 118/118; focused environment/token/session tests:
  40/40; API typecheck and lint passed; Nest production build passed.
- Web full suite: 431/431 with the isolated clean-room scan allowed its
  measured filesystem work; web typecheck passed. Root lint passed.
- Next production build generated 78/78 routes; root build passed.
- Database-release, project-cutover, audit-recovery, purchase-order-duplicate,
  and controlled-release plan suites passed (7/7, 6/6, 4/4, 4/4, 4/4);
  workflow action references passed; `git diff --check` passed.
- Source now contains 85 migrations versus 55 hosted Supabase migrations.
  Session-minting flags remain false/empty and the token secret is unset.
  Commit `e81087e` is published to both target branches under `kurtgav`.
  Railway deployment `dacccb49-9bca-4754-8a48-17feded185bf` is `SUCCESS` at
  that SHA; `/ready` reports database and Redis `ok`, and a valid-format
  public-command probe returned `503`. Supabase and Vercel remain unchanged
  pending the ordered hosted suffix, replay/rollback, provider, and spend
  gates.

## 2026-08-03 - M3.28 supplier-confirmation authority

Completed the source slice and deployed the closed runtime seam to Railway.
No hosted migration, feature flag, provider setting, email link, Vercel build,
or paid frontend build changed.

- Added strict supplier response contracts with accepted, declined, and
  changes-requested decisions; non-acceptance requires a note.
- Added tenant-scoped hashed confirmation sessions, explicit response checks,
  durable replay evidence, composite tenant foreign keys, forced RLS, and
  service-only privileges in
  `20260803150000_vendor_confirmation_workflow.sql`.
- Added the closed-by-default NestJS public route. It locks the session and an
  issued Purchase Order, validates vendor scope and replay hashes, commits
  responder metadata and nullable-actor semantic audit atomically, and never
  mutates delivery, receipt, inventory, or payment state.
- Added fail-closed API configuration, observability label, contract tests, and
  environment documentation. Session minting and supplier email-link delivery
  remain a follow-on slice; existing notification behavior is unchanged.

Validation:

- Shared supplier contract tests: 4/4; shared typecheck passed.
- Database migration contract tests: 2/2; database typecheck passed.
- Full shared suite: 159/159. Full database suite: 160 passed, 137 skipped
  because `DATABASE_URL` is not configured in this local runner.
- API focused controller/config/observability/service tests: 62/62.
- API typecheck passed; Nest production build passed.
- Web full suite: 431/431; Web typecheck passed. Database-release, project-
  cutover, audit-recovery, purchase-order-duplicate, and controlled-release
  plan suites passed (7/7, 6/6, 4/4, 4/4, 4/4); workflow action references
  passed.
- `git diff --check` passed. Hosted Supabase remains 55/84 migrations; all
  supplier-confirmation controls remain false/empty. Commit `850eee5` is on
  both GitHub target branches; Railway deployment
  `3227b3a3-79e9-472f-9770-78f96faf636f` is `SUCCESS`, `/ready` is database and
  Redis `ok`, and the valid-format public confirmation probe returned `503`.
- The serialized full API runner remains unclaimed because its prior run
  exceeded the execution ceiling before returning a result.

## 2026-08-03 - Capability baseline and M3.28 scope

Completed a source-planning milestone. No application code, hosted migration,
feature flag, provider setting, email link, or paid build changed.

- Added `docs/architecture/CAPABILITY_MATRIX.md` with the verified construction
  spine, multi-business capability gaps, status vocabulary, release boundary,
  and a bounded supplier-confirmation scope.
- Recorded the next slice as a token-authorized, tenant-scoped supplier
  decision with explicit state, durable replay, nullable-actor audit, and no
  implicit delivery, inventory, or payment mutation.
- Updated the current/target architecture, decisions, migration plan, next
  actions, and Rework alignment references. The existing landing surface stays
  unchanged; browser evidence already covers desktop/mobile layout, behavior,
  SEO metadata, and reference-brand scanning.

Validation boundary: documentation links and changed-file diff checks remain;
the next code milestone owns the focused contract, typecheck, build, and
disposable replay gates. Hosted Supabase remains at 55/83 migrations, Railway
remains on the verified M3.27 runtime, and Vercel Git remains disconnected.
Source commit `5e61b28` is published to both target branches under `kurtgav`.
Railway created deployment `006d74a9-ac85-4b0c-a82d-428c2b8c5645` for this
commit and correctly skipped it because no watched API files changed; the
verified runtime remains deployment `d4afe970-6958-4f38-a17a-fa8c01ca13d4`.

## 2026-08-03 - M3.27 public client-signing authority

Completed the local source milestone. No hosted migration, feature flag, or
paid provider action was authorized.

- Added strict public-signing command/result contracts and ordered migration
  `20260803140000_public_signing_workflow.sql` with forced RLS, service-only
  privileges, tenant-scoped idempotency, and durable replay evidence.
- Added the closed-by-default NestJS public route with token-derived tenant
  scope, expiry/revocation/signed-state checks, bounded deterministic PNG
  validation, service-role Storage upload, transactional document creation,
  BOM/contract/variation-order/COC source stamping, nullable-actor audit, and
  concurrency-safe cleanup.
- Added the guarded Next adapter, stable signing retry key, terminal selected
  Core failure behavior, environment controls, observability label, and
  shared/database/API/Web contracts. Existing portal UI/copy and unselected
  legacy behavior remain unchanged.
- Declared Express as an explicit API runtime dependency because the bounded
  JSON parser is used by production Nest bootstrap; lockfile was updated from
  the existing resolved package.

Validation:

- Shared-types full suite: 155/155.
- Database full suite: 158/158; 137 guarded tests skipped without
  `DATABASE_URL`.
- Focused API public-signing/config/observability contracts: 59/59.
- Web full suite: 431/431.
- Shared/database/API/Web typechecks and lint passed.
- Nest production build passed.
- Next production build passed with 78/78 generated routes using
  `NEXT_TELEMETRY_DISABLED=1` and `CI=1`.
- `git diff --check` passed before final docs/source commit. A serialized full API
  runner exceeded the 360-second execution ceiling before returning a result;
  no new assertion failure was reported, so no full API green claim is made.

Hosted boundary: Supabase remains at 55 applied migrations against 83 source
migrations (28 pending). Public-signing flags remain false/empty. No Supabase
SQL, Vercel deployment, provider setting, feature flag, or hosted data
changed. Vercel Git remains disconnected to control spend; no `af8690d`
deployment occurred and production `/api/ready` remains on revision
`31c04942a93d`. Source checkpoint `af8690d` was published to both branches
under `kurtgav <kurtgavin.design@gmail.com>`. Railway deployment
`d4afe970-6958-4f38-a17a-fa8c01ca13d4` is `SUCCESS` at that SHA, its Docker
build passed, `/ready` returned `200` with PostgreSQL and Redis ready, and a
no-write public-signing probe returned `503` while the route remained closed.
Migration parity, protected-flow, rollback, duplicate-data, audit-chain,
owner-input, and spend gates remain open.

## 2026-08-03 - M3.26 document deletion authority

Completed the local source milestone. No hosted mutation or provider action
was authorized.

- Added strict document-delete command/result contracts and ordered migration
  `20260803130000_document_delete_workflow.sql` with forced RLS, service-only
  privileges, tenant idempotency, and replay evidence that survives deletion.
- Added the closed-by-default NestJS document route with locked membership and
  `document.manage` checks, processing-history protection, transactional
  derived-scope/document deletion, semantic audit, and observability labeling.
- Added the guarded Next adapter, stable browser retry key, terminal Core
  failure behavior, Storage cleanup adapter, environment controls, and
  contract tests. Existing UI layout/copy and unselected legacy behavior are
  unchanged.

Validation:

- Shared-types full suite: 152/152.
- Database full suite: 156/156; 137 guarded tests skipped without
  `DATABASE_URL`.
- Focused API document/config/observability contracts: 56/56.
- Web full suite: 425/425.
- Shared/database/API/Web typechecks and lint passed.
- Nest build passed; Next production build passed with 78/78 routes after a
  bounded retry with `NEXT_TELEMETRY_DISABLED=1` and `CI=1`.
- `git diff --check` passed. A serialized full API runner exceeded the
  240-second execution ceiling before returning a result, so no full API green
  claim is made for this milestone.

Hosted boundary: Supabase remains at 55 applied migrations against 82 source
migrations (27 pending). Document-delete flags remain false/empty. The
reviewed source checkpoint `5ad72ec` is fast-forwarded to both `main` and
`agent-02/third-code-erp-landing` under `kurtgav
<kurtgavin.design@gmail.com>`. Railway CLI re-authentication and linkage are
verified: project `ERP` /
`a21fd382-80b2-4218-8025-11f420a062e3`, production environment
`ce3a09da-9334-4256-a0a6-85d69676cb89`, service `Third Code ERP API` /
`c45b3d01-036a-4663-a524-0713d782fce3`. Deployment
`d7b8b2d4-db7b-4f15-a429-7d903d353794` is `SUCCESS` at source `5ad72ec`;
`/ready` returned `200` with `database: ok` and `redis: ok`. This is runtime
readiness only; ordered migration parity, flags, protected-flow, rollback,
and spend gates remain open. Vercel Git deployment remains disabled and no
new Vercel deployment appeared; production `/api/ready` is `200` on old
revision `31c04942a93d`. No Supabase SQL, Vercel deployment, provider setting,
feature flag, or hosted data changed. Audit-hash verification remains
blocked without the required Postgres and owner-approved
`AUDIT_RECOVERY_TENANT_ID`.

## 2026-08-03 - M3.25 reviewed source publication checkpoint

Published the reviewed cash-draft source and checkpoint docs to
`Third-Code-Solutions/ERP`; the latest source checkpoint is `46035fa` under `kurtgav
<kurtgavin.design@gmail.com>`. Both `main` and
`agent-02/third-code-erp-landing` were fast-forwarded from `31c4ae0`; no
force push, alternate account, Supabase SQL, Railway release, Vercel
deployment, feature flag, provider setting, or hosted data changed.

## 2026-08-03 - M3.25 cash draft mutation authority

Completed the local source milestone. No hosted mutation or provider action
was authorized.

Reviewed source commit: `8404d20`.

- Added strict tenant-free save/update/delete command and result contracts for
  cash drafts, direction-safe allocations, and fail-closed API/Next feature
  controls.
- Added ordered migration `20260803120000_cash_transaction_draft_workflow.sql`
  and the matching Drizzle schema for forced-RLS, service-only,
  tenant-scoped idempotency. The replay ledger retains deleted target UUIDs.
- Added the NestJS cash-draft controller, strict pipes, transactional service,
  membership/capability recheck, Cash Account and allocation validation,
  semantic audit, observability labels, and explicit error handling.
- Added guarded Next adapters and stable browser retry keys while preserving
  the legacy direct-write path for unselected tenants and all visible UI/copy.
- Added shared, database, API, observability, client, configuration, and
  migration contract tests plus environment documentation.

Validation:

- Shared-types full suite: 149/149.
- Database full suite: 154/154; 137 guarded tests skipped without
  `DATABASE_URL`.
- API full suite: 251/251 with an explicit 30-second Vitest timeout. The
  default parallel runner had three unrelated 5-second timeouts (248/251).
- Web full suite: 421/421.
- Package typechecks and lint passed; Nest build passed.
- Release planners, workflow-reference checks, and `git diff --check`
  passed. Audit-hash verification remains blocked without
  `DATABASE_URL` and owner-approved `AUDIT_RECOVERY_TENANT_ID`.
- An initial Next production-build runner attempt timed out before returning;
  an isolated retry with `NEXT_TELEMETRY_DISABLED=1` and `CI=1` passed with
  78/78 generated routes. This is local evidence only; no hosted build or
  deployment is considered green from it.

Hosted boundary: Supabase remains at 55 applied migrations against 81 source
migrations (26 pending). All cash-draft controls remain false/empty. Railway,
Vercel, Supabase, provider settings, and hosted data were not changed.

## 2026-08-03 - M3.24 customer invoice cancellation authority

Completed the local source milestone. No hosted mutation or provider action
was authorized.

Reviewed source commit: `c71fbd4`.

- Added strict customer-invoice cancellation command/result contracts and
  ordered migration `20260803110000_customer_invoice_cancel_workflow.sql`
  with forced RLS, service-only privileges, tenant-composite foreign keys,
  and durable replay.
- Added the closed-by-default NestJS route
  `POST /v1/finance/customer-invoices/:invoiceId/cancel` with membership and
  invoice locking, `finance.issue_invoice` authorization, existing PostgreSQL
  state-function reuse, strict replay validation, atomic semantic audit,
  observability labeling, and error mapping.
- Added the guarded Next adapter, stable browser cancellation retry key,
  action delegation tests, environment controls, and migration documentation.
  The legacy direct database function remains unchanged for unselected
  tenants; visible UI/copy remains unchanged.

Validation:

- Shared-types full suite: 147/147.
- Database full suite: 152/152; 137 guarded tests skipped without
  `DATABASE_URL`.
- API source suite: 240/240.
- Web full suite: 418/418.
- Shared/database/API/Web typechecks and lint passed.
- API build passed; Next production build passed with 78/78 routes.
- Controlled release, database release, workflow-reference, and diff checks
  passed.

Hosted boundary: Supabase remains 55 applied migrations against 80 source
migrations. Duplicate PO mapping, canonical audit-recovery tenant, Railway
identity, and spend-bounded provider gates remain unresolved. No Supabase SQL,
feature flag, Railway release, Vercel deployment, provider setting, or hosted
data changed.

## 2026-08-03 - M3.23 customer invoice reversal authority

Completed the local source milestone. No hosted mutation or provider action
was authorized.

Reviewed source commit: `8c7159c`.

- Added strict customer-invoice reversal command/result contracts and ordered
  migration `20260803100000_customer_invoice_reverse_workflow.sql` with forced
  RLS, service-only privileges, tenant-composite foreign keys, and durable
  replay.
- Added the closed-by-default NestJS route
  `POST /v1/finance/customer-invoices/:invoiceId/reverse` with membership and
  invoice locking, `finance.issue_invoice` authorization, existing PostgreSQL
  reversal-function reuse, strict replay validation, atomic semantic audit,
  observability labeling, and error mapping.
- Added the guarded Next adapter, stable browser reversal retry key, action
  delegation tests, environment controls, and migration documentation. The
  legacy direct database function remains unchanged for unselected tenants;
  visible UI/copy remains unchanged.

Validation:

- Shared-types full suite: 146/146.
- Database full suite: 150/150; 137 guarded tests skipped without
  `DATABASE_URL`.
- API source suite: 234/234.
- Web full suite: 414/414.
- Shared/database/API/Web typechecks passed.
- Nest production build passed.
- Next production build passed with 78/78 routes.
- `git diff --check` passed.

Hosted boundary: Supabase remains 55 applied migrations against 79 source
migrations. Duplicate PO mapping, canonical audit-recovery tenant, Railway
identity, and spend-bounded provider gates remain unresolved. No Supabase SQL,
feature flag, Railway release, Vercel deployment, provider setting, or hosted
data changed.

## 2026-08-03 - Reviewed source published as kurtgav

Published the reviewed M3.21/M3.22 source and release documentation to
`Third-Code-Solutions/ERP` using the stored `kurtgav
<kurtgavin.design@gmail.com>` GitHub CLI identity. The push was fast-forward
only from `9c200cc` to `33089abe567bd39d190d08c9a1ad1098e6dc5bb0` on both
`main` and `agent-02/third-code-erp-landing`. No force push, alternate account,
fork, Supabase SQL, Railway release, Vercel deployment, feature flag, provider
setting, or hosted data changed. Railway identity and the hosted migration/data
release gates remain unresolved.

## 2026-08-03 - M3.22 customer invoice issuance authority

Completed the local source milestone. No hosted mutation or provider action
was authorized.

- Added strict customer-invoice issuance command/result contracts and ordered
  migration `20260803090000_customer_invoice_issue_workflow.sql` with forced
  RLS, service-only privileges, tenant-composite foreign keys, and durable
  replay.
- Added the closed-by-default NestJS route
  `POST /v1/finance/customer-invoices/:invoiceId/issue` with membership
  locking, `finance.issue_invoice` authorization, existing PostgreSQL
  receivables-function reuse, strict result validation, atomic semantic audit,
  and idempotent replay.
- Added the guarded Next adapter, stable invoice issue retry key,
  observability label, environment controls, and contract tests. Cancel,
  reversal, visible UI, and copy remain unchanged.

Validation:

- Shared finance contracts: 10/10.
- Database migration contracts: 3/3.
- API focused contracts: 47/47.
- Web client/invoice action contracts: 63/63.
- Shared/database/API/Web typechecks passed.
- Nest production build passed.
- Next production build passed with 78/78 routes.
- `git diff --check` passed.
- Guarded PostgreSQL/Redis integration remains skipped without
  `DATABASE_URL` and `ERP_API_INTEGRATION_EXPECTED=1`.

Hosted boundary: Supabase remains 55 applied migrations against 78 source
migrations. Duplicate PO mapping, canonical audit-recovery tenant, GitHub
repository access, Railway identity, and spend-bounded provider gates remain
unresolved. No Supabase SQL, feature flag, Railway release, Vercel deployment,
provider setting, or hosted data changed.

## 2026-08-03 - M3.21 cash transaction workflow authority

Completed local source milestone at commit `44e678e` under
`kurtgav <kurtgavin.design@gmail.com>`. Direct GitHub push was attempted but
the requested `Third-Code-Solutions/ERP` target returned 404 for the connected
account; no alternate repository or account was used.

- Added strict cash posting/reversal contracts and ordered migration
  `20260802230000_cash_transaction_workflow_idempotency.sql` with forced RLS,
  service-only access, tenant-composite foreign keys, and durable replay.
- Added the closed-by-default NestJS routes with membership locking,
  `finance.manage_cash` authorization, existing database function reuse,
  atomic audit, error mapping, and idempotent replay.
- Added fail-closed Next adapters, stable browser retry keys, observability
  labels, environment controls, and cash contract tests. Visible UI/copy and
  legacy behavior remain unchanged for unselected tenants.

Validation:

- Shared finance contracts: 9/9.
- Cash database contracts: 2/2.
- Cash API contracts: 4/4.
- Web cash/client contracts: 62/62.
- Shared/database/API/web typechecks passed.
- Nest build passed; Next production build passed with 78/78 routes.
- Controlled release plan: 4/4; database release plan: 7/7; diff checks passed.
- Full serial Nest run reported 40/40 files and 226/226 passing tests, then
  hit the Windows process-exit ceiling; no test assertion failed.
- Guarded PostgreSQL integration remains skipped without `DATABASE_URL` and
  `ERP_API_INTEGRATION_EXPECTED=1`.

Hosted boundary: no Supabase SQL, feature flag, Railway release, Vercel
deployment, provider setting, or hosted data changed. Source has 77
migrations versus 55 hosted; duplicate PO, audit-recovery, and provider
identity blockers remain.

## 2026-08-03 - M3.20 supplier-bill reversal authority

Completed source milestone at commit `806860e`, published to `origin/main` and
`origin/agent-02/third-code-erp-landing` under `kurtgav
<kurtgavin.design@gmail.com>`.

- Added strict supplier-bill reversal contracts and ordered migration
  `20260802220000_supplier_bill_reverse_workflow.sql` with forced RLS,
  service-only access, tenant-composite foreign keys, and durable replay.
- Added the closed-by-default NestJS reversal route with membership locking,
  `finance.post` authorization, existing database reversal-function reuse,
  atomic audit, and idempotent replay.
- Added the fail-closed Next adapter, stable browser retry key, observability
  label, environment controls, and guarded PostgreSQL integration assertions.
  Existing UI/copy and legacy behavior remain unchanged for unselected tenants.

Validation:

- Focused shared finance contracts: 7/7 passed.
- Database reversal contracts: 2/2 passed.
- API/observability contracts: 18/18 passed; API typecheck and Nest build
  passed.
- Web adapter/action contracts: 63/63 passed; web typecheck passed.
- Controlled-release and database-release-plan checks passed.
- Guarded database integration invoked and skipped because
  `DATABASE_URL` and `ERP_API_INTEGRATION_EXPECTED=1` were not configured.
- A broad concurrent API invocation reached 216/218 tests but hit two known
  resource/concurrency timeouts in unrelated suites; the bounded serial API
  suite then completed cleanly at 38 files/219 tests.

Hosted boundary: no Supabase SQL, feature flag, Railway release, Vercel
deployment, provider setting, or hosted data changed. Source now has 76
migrations versus 55 hosted; duplicate PO and audit-recovery blockers remain.

## 2026-08-03 - hosted release recheck (read-only)

- Rechecked source and providers without mutation. GitHub remains on the
  reviewed M3.19 source under `kurtgav`; worktree is clean.
- Supabase `aqqrtkmtcsfkbyyqxowv`: 55 applied / 75 source migrations; one
  12-record duplicate Purchase Order-number group; audit table counts are 661
  for the populated demo tenant and 1 for the fixture tenant. Owner mapping
  and canonical `AUDIT_RECOVERY_TENANT_ID` remain absent.
- Railway `/health` and `/ready`: HTTP 200, database/Redis ready. Railway CLI
  remains unauthorized and resolves to `joeseffdy`, so no deploy was run.
- Vercel `/api/ready` and `/`: HTTP 200; live production revision remains
  `31c04942a93d`; runtime-error report found none in the last 24 hours. Git
  deployment remains disabled in `apps/web/vercel.json`.
- No Supabase SQL, flags, provider settings, deployment, or paid build changed.

## 2026-08-03 - M3.19 supplier-bill posting authority

Completed source milestone:

- Reviewed source commit `f50c8bc5c540b97134764b56a297c41e8578f9f2`, published to
  `origin/main` and `origin/agent-02/third-code-erp-landing` under
  `kurtgav <kurtgavin.design@gmail.com>`.
- Added strict supplier-bill posting contracts and migration
  `20260802210000_supplier_bill_post_workflow.sql` with forced RLS,
  service-only access, tenant-composite foreign keys, and durable replay.
- Added the closed-by-default NestJS route and transaction authority with
  tenant membership locking, `finance.post` authorization, existing database
  payable-function reuse, atomic audit, and idempotent replay.
- Added the fail-closed Next adapter, stable browser retry key, observability
  label, environment controls, contract tests, and a guarded PostgreSQL
  integration proof. Supplier-bill reversal and visible UI remain unchanged.

Validation:

- Shared types: 141/141 passed.
- Database: 141 passed; 137 guarded tests skipped without `DATABASE_URL`.
- Web: 59 files, 397 passed.
- API: 36 files, 213 passed serially with one worker; focused contracts 40/40.
- API/web/shared/database typechecks and API/Web lint commands passed (shared
  and database expose no lint script).
- Nest build passed; Next production build compiled and generated 78/78 routes.
- Database-release/controlled-release/workflow-reference tests, Actionlint,
  Gitleaks, and `git diff --check` passed.
- Guarded supplier-bill PostgreSQL integration compiled and was invoked; it
  skipped because `DATABASE_URL` and `ERP_API_INTEGRATION_EXPECTED=1` were not
  configured. A root Turbo test was attempted, but five concurrent API harness
  timeouts made that aggregate command fail; the serial API suite is green.

Hosted boundary: no Supabase SQL, feature flag, Railway release, Vercel
deployment, provider setting, or hosted data changed. Source now has 75
migrations versus 55 hosted; the duplicate PO and audit-recovery blockers
remain.

## 2026-08-03 - M3.18 delivery site-preparation completion authority

Completed source milestone:

- Reviewed source commit: `140f4e8cb518445ab0903d7d885b68cebc7ce8f0`, published
  to `origin/main` and `origin/agent-02/third-code-erp-landing` under
  `kurtgav <kurtgavin.design@gmail.com>`.
- Added strict `complete_site_preparation` shared command/result and ordered
  migration `20260802200000_delivery_site_preparation_complete_workflow.sql`.
- Added the closed-by-default NestJS route
  `POST /v1/procurement/deliveries/:deliveryScheduleId/site-preparation/complete`
  with tenant membership locking, capability authorization, shared ledger
  idempotency, atomic preparation evidence/status commit, and audit.
- Added the fail-closed Next adapter, stable browser retry key, observability
  label, environment documentation, and cross-tenant/viewer assertions while
  preserving existing UI and legacy action behavior.

Validation:

- Shared types: 139/139 passed.
- Database: 138 passed; 137 guarded tests skipped without `DATABASE_URL`.
- Web: 59 files, 393 passed.
- Focused API contracts: 72/72 passed.
- API/web/shared/database typechecks and Nest build passed.
- Next production build passed: compiled, linted/typechecked, and generated
  78/78 routes.
- Release-plan/controlled-release tests, Actionlint, Gitleaks, and diff checks
  passed.
- Guarded delivery PostgreSQL/Redis integration compiled and was invoked; one
  test skipped because its explicit environment and integration gate were not
  configured.

Hosted boundary: no Supabase SQL, feature flag, Railway release, Vercel
deployment, or provider setting changed. Source has 74 migrations versus 55
hosted; duplicate PO and audit-recovery blockers remain.

## 2026-08-03 - GitHub source publication checkpoint

- Fast-forwarded `origin/main` and `origin/agent-02/third-code-erp-landing` to
  reviewed head `04b2ee84f9e192edb14c105e50b5280cdeb41570` using the active
  `kurtgav <kurtgavin.design@gmail.com>` GitHub identity.
- Verified remote refs and GitHub `main` SHA. No Supabase SQL, Railway release,
  Vercel deployment, feature flag, or hosted data changed.
- Release remains blocked until owner supplies a reversible mapping for the
  12-record tenant-scoped `PO-0002` duplicate group and the canonical
  `AUDIT_RECOVERY_TENANT_ID`.

## 2026-08-02 — M3.17 delivery site-preparation start authority

Completed source milestone:

- Added the strict `start_site_preparation` shared command/result and the
  forward-only migration `20260802190000_delivery_site_preparation_start_workflow.sql`.
- Added the NestJS `POST /v1/procurement/deliveries/:deliveryScheduleId/site-preparation/start`
  boundary with exact flag/tenant allowlisting, `delivery.receive` authority,
  tenant membership locking, schedule locking, durable idempotency replay,
  atomic status change, and transactional semantic audit.
- Added the fail-closed Next compatibility selector and opaque browser retry
  key while preserving the existing Site Prep panel and Server Action behavior.
- Added environment documentation, request observability labeling, shared/API/
  web/database tests, and guarded cross-tenant/viewer integration assertions.

Changed files: 24 reviewed source/test/migration files; source commit
`0b7cb532b0b3a32f687f58437f2756259ba68c27`, pushed to
`origin/agent-02/third-code-erp-landing` as `kurtgav`.

Validation:

- Shared types: 137/137 passed.
- Database: 137 passed; 137 guarded RLS/Cortex/integration tests skipped
  without `DATABASE_URL`.
- Web: 59 files, 388 passed.
- Focused API contracts: 64/64 passed with `--testTimeout=30000`.
- API/web typecheck, Nest build, release planner (7/7), controlled release
  planner (4/4), actionlint, and gitleaks passed.
- Guarded delivery database integration invoked and correctly skipped without
  its explicit Postgres/Redis environment.
- Next build generated all 78 routes, but the local Windows build worker did
  not return a definitive exit code within the bounded 15-minute run; API full
  suite exceeded the local ten-minute ceiling and was stopped. Neither is
  treated as green production evidence.

Hosted boundary:

- Supabase `aqqrtkmtcsfkbyyqxowv` remains `ACTIVE_HEALTHY`, ledger 55/73;
  read-only SQL still shows no delivery workflow ledger, no cancellation
  columns, no site-preparation action, 662 audit rows, and 4 deliveries.
- GitHub CI `30755868510` failed before executable steps because of the
  authenticated account payment/spending-limit gate; all jobs skipped.
- Railway and Vercel were not mutated. Existing Vercel production remains the
  previously reviewed deployment; no new paid preview or production build was
  triggered. All four new feature controls remain false/empty.

Unresolved risks: hosted migration suffix and integrity recovery gates, missing
guarded database environment, GitHub billing authorization, and the slow local
Next build worker. Exact next action: reconcile the 18-migration hosted suffix
in timestamp order after owner-approved duplicate/audit decisions, then rerun
the disposable integration and provider release gates before any DB or deploy
mutation.

## 2026-07-27 — M0 audit and M1 transaction foundation

Completed:

- Audited frameworks, business-logic locations, actions/routes, Python,
  database/RLS, auth/tenant isolation, module quality, tests, and deployment.
- Added NestJS modular-monolith foundation under `apps/api`.
- Added database-backed identity/tenant membership and explicit Project update
  capability enforcement.
- Added PostgreSQL transaction ownership, row lock, tenant predicate,
  optimistic concurrency, and transactional audit actor attribution.
- Added Redis/BullMQ connection foundation and health/readiness endpoints.
- Added a strict shared Project update contract.
- Added a server-only Next compatibility adapter behind
  `ERP_PROJECT_WRITES_VIA_API=false`.
- Added service and HTTP contract/security tests.
- Added production container definition and bundled internal workspace code.
- Added bounded Redis connection diagnostics after built-artifact smoke testing
  exposed repeated unhandled connection-error output.

Changed files for this milestone:

- `apps/api/**`
- `apps/web/src/lib/erp-core-client.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/actions.ts`
- `packages/shared-types/src/erp-api/projects.ts`
- `packages/shared-types/src/index.ts`
- `.env.example`
- `apps/web/.env.example`
- `pnpm-lock.yaml`
- the six architecture/operations memory files
- `README.md`

Scoped validation:

- `pnpm --filter @third-code-erp/api typecheck` — pass.
- `pnpm --filter @third-code-erp/api test` — pass, 5 tests.
- `pnpm --filter @third-code-erp/api test:e2e` — pass, 2 tests.
- `pnpm --filter @third-code-erp/api build` — pass.
- `pnpm --filter @third-code-erp/web typecheck` — pass.

Workspace and operational validation:

- `pnpm lint` — pass; current lint scripts are TypeScript-only checks.
- `pnpm typecheck` — pass.
- `pnpm test` — pass: 254 executed tests; 102 existing database tests skipped
  by environment/migration conditions.
- `pnpm build` — pass: Nest production bundle and 77 Next.js static pages.
- `node scripts/verify-database-repro.mjs --files-only` — pass: 43-file
  migration ledger and seed checks.
- `pnpm verify:workflow-action-refs` — pass for all five pinned public action
  tags.
- `git diff --check` — pass; line-ending warnings only.
- Forbidden source trace scan — no external ERP or former-product branding
  terms in application, packages, migrations, scripts, docs, or README.
- Built API smoke — `/health` 200; missing-bearer Project write 401; `/ready`
  503 with deliberately absent PostgreSQL/Redis; Redis emits one bounded
  diagnostic instead of unhandled repeated errors.

Unresolved:

- No real database/Auth/Redis integration or API preview deployment yet.
- The Docker engine probe was unresponsive; container build and clean-Supabase
  reproduction could not run locally.
- The full database catalog verifier was not run. Static migration-ledger
  verification passed, but 102 database tests remain skipped.
- Python direct writes and inconsistent legacy authorization/audit remain.
- ESLint is not configured; the current lint gate performs TypeScript checks.
- The feature flag remains off; no production behavior changed.

## 2026-07-27 — M1 integration-gate hardening

Completed:

- Extracted Supabase token verification behind an injectable identity service
  while retaining Supabase as the production verifier.
- Added seven local guard tests for missing/invalid tokens, database-derived
  principal membership, explicit capabilities, denial, and public routes.
- Added a disposable PostgreSQL integration test for real Nest guards and
  Project SQL behavior: 401, 403, tenant 404, stale 409, success, audit actor,
  and outer transaction rollback.
- Added Redis 7.4.9 to the clean PostgreSQL 17 CI job.
- Added the Nest database integration command to that job.
- Added production-container build and `/health`, `/ready`, and 401 smoke
  checks against disposable PostgreSQL and Redis.
- Ran the configured remote database verifier read-only. PostgreSQL 17 passed,
  but 23 migrations and their dependent objects are missing. No write or
  migration was performed.

Validation:

- `pnpm --filter @third-code-erp/api typecheck` — pass.
- `pnpm --filter @third-code-erp/api test` — pass, 12 tests.
- `pnpm --filter @third-code-erp/api test:integration` — correctly skipped
  locally because the explicit disposable-database flag is absent.
- `pnpm lint` — pass.
- `pnpm typecheck` — pass.
- `pnpm test` — pass.
- `pnpm build` — pass for Nest and 77 Next pages.
- Local official `actionlint` — pass.
- Remote configured catalog verifier — expected stop-ship failure: 23 missing
  migrations and 25 failed invariant groups.

Unresolved:

- The new CI integration/container lane has not executed on GitHub.
- Local Docker remains unavailable.
- Supabase Auth token verification still requires preview evidence.
- The configured database requires a separately reviewed migration rollout.
- `ERP_PROJECT_WRITES_VIA_API` remains false.

## 2026-07-27 — Hosted database release preflight

Completed:

- Added `scripts/plan-database-release.mjs`, a read-only target/repository
  ledger comparator.
- Added SHA-256 evidence for every missing migration.
- Added conservative warnings for object drops, truncation, data deletion,
  data rewrites, explicit transaction control, and commands unsafe inside a
  transaction.
- Added seven Node tests covering ledger, SQL-risk, hash, and release-gate
  classification.
- Made `--require-current` reject every reported release blocker, including a
  non-PostgreSQL-17 target, even when the migration ledger itself is current.
- Added the planner tests to CI and a `--require-current` check to the clean
  PostgreSQL 17 job.
- Added `docs/runbooks/database-release.md` with backup/PITR, logical export,
  Storage recovery, restored-clone rehearsal, release, abort, and recovery
  requirements.
- Corrected `docs/DEPLOYMENT.md`: the migration ledger has no reliable paired
  down scripts, and hosted `db reset` is prohibited.
- Verified pinned Supabase CLI 2.109.1 help for `db dump`, `db push`, and
  `migration list`.

Read-only configured-target result:

- Status: `blocked_non_linear_history`.
- PostgreSQL: 17.
- Applied: 20 of 43.
- Missing: 23.
- Unexpected: 0.
- Later repository versions after the first gap: 13.
- No migration SQL executed.

Validation:

- `pnpm test:database-release-plan` — pass, 7 tests.
- Local official `actionlint` — pass.
- `pnpm verify:workflow-action-refs` — pass for all five pinned action refs.
- `pnpm lint` — pass; current lint remains TypeScript-only.
- `pnpm typecheck` — pass.
- `pnpm test` — pass: 261 executed tests; 102 database tests skipped outside
  the disposable integration environment.
- `pnpm build` — pass: Nest production bundle and 77 Next.js pages.
- Fresh uncached `pnpm turbo test --force` — pass after adding an explicit
  15-second timeout to the Nest HTTP harness; 261 tests executed and 102
  environment-gated database tests skipped.
- Fresh uncached `pnpm turbo build --force` — pass for Nest and all 77 Next.js
  pages.
- Scoped `git diff --check` — pass; line-ending warnings only.
- Forbidden source-trace scan — no external ERP or former-product names.

Unresolved:

- Rehearsal requires an isolated restore/clone and explicit release authority.
- Current Docker remains unavailable locally.
- New CI planner, Nest integration, Redis, and container lanes have not run on
  GitHub.
- No production migration, history repair, feature flag, or deployment was
  performed.

## 2026-07-28 — pnpm dependency-policy reproducibility

Completed:

- Verified against current official pnpm documentation that pnpm 10 no longer
  reads settings from `package.json#pnpm`.
- Moved the existing `drizzle-orm` override and peer-warning policy to
  `pnpm-workspace.yaml`.
- Removed only the ignored root `package.json#pnpm` block.
- Preserved the existing resolved dependency graph.

Changed files:

- `pnpm-workspace.yaml`
- `package.json`
- the six architecture/operations memory files

Validation:

- `pnpm install --frozen-lockfile` — pass; ignored-setting warning removed.
- Lockfile SHA-256 before/after —
  `A95947EAAF1B9D3801A27D5F551EF29239E1CF930BBD1FF8AAD0DF925E41A2C3`;
  no lockfile mutation.
- Recursive dependency listing — API, web, and database all resolve
  `drizzle-orm@0.40.1`.
- `pnpm lint` — pass.
- `pnpm typecheck` — pass.
- `pnpm test` — pass by valid Turbo cache replay from the prior fresh
  uncached 261-test run; 102 database cases remain environment-gated.
- `pnpm build` — pass; Nest rebuilt, 77-page Next build replayed from valid
  cache.
- `pnpm test:database-release-plan` — pass, 7 tests.
- `pnpm verify:workflow-action-refs` — pass, 5 refs.

Unresolved:

- Read-only API probes with all three locally configured GitHub CLI identities
  receive repository 404, so the uncommitted CI lane cannot be dispatched.
- `git ls-remote --heads origin` independently fails with
  `Repository not found`; the configured remote is
  `https://github.com/Third-Code-Solutions/ERP.git`.
- No account switch, commit, push, CI run, database write, feature-flag change,
  or deployment was performed.

## 2026-07-28 — Supabase reconciliation and release hardening

Completed:

- Verified the authorized Supabase project ref
  `aqqrtkmtcsfkbyyqxowv` is active PostgreSQL 17.
- Captured pre-release row, money, audit, and Storage baselines.
- Dry-ran all 23 missing migration versions before execution.
- Confirmed transaction-mode port 6543 failed before SQL execution because
  prepared statements are unsupported there.
- Applied the reviewed migration set using session-mode port 5432.
- Added and applied
  `20260727162024_security_advisor_hardening.sql`.
- Reached a current 44/44 migration ledger with no unexpected versions.
- Verified 86 public tables, 315 RLS policies, 30 protected-table groups,
  finance/inventory controls, privileges, helper hardening, and tenant
  isolation invariants.
- Preserved all captured business baselines: 2 tenants, 13 users, 25 projects,
  13 purchase orders, 4 invoices, 660 audit rows, 37 Storage objects,
  378,642,000 purchase-order cents, and 118,200,654 invoice-net cents.
- Did not apply `supabase/seed.sql`; it is explicitly a local/CI reset fixture.
- Replaced deprecated `[inbucket]` local configuration with `[local_smtp]`.
- Removed remaining former-product labels from source comments and planning
  text.
- Prevented database test harnesses from discovering hosted application URLs
  in `.env.local`. Database tests now require explicit disposable
  configuration.

Changed files for this release-hardening increment:

- `supabase/migrations/20260727162024_security_advisor_hardening.sql`
- `supabase/config.toml`
- `packages/database/src/sql/audit-triggers.sql`
- `packages/database/src/__tests__/_db-harness.ts`
- `packages/database/src/__tests__/rls-isolation.test.ts`
- `scripts/verify-database-repro.mjs`
- the six architecture/operations memory files
- former-brand comments/planning references

Validation:

- `pnpm install --frozen-lockfile` — pass.
- `pnpm lint` — pass; current lint remains TypeScript-only.
- `pnpm typecheck` — pass.
- Fresh `pnpm turbo test --force` — pass: 235 executed, 128 explicitly
  disposable-database-gated.
- Fresh `pnpm turbo build --force` — pass: Nest production bundle and all
  77 Next.js pages.
- `pnpm test:database-release-plan` — pass, 7 tests.
- Hosted release planner with `--require-current` — pass, 44/44.
- Hosted catalog verifier — pass, 44 migrations and 30 protected tables.
- `pnpm verify:workflow-action-refs` — pass, 5 refs.
- Official `actionlint` binary — pass.
- `git diff --check` — pass; line-ending warnings only.
- Gitleaks 8.30.1 staged scan — pass, zero findings.
- Former-brand/external-source trace scan — pass, zero findings.

Deployment blockers:

- GitHub origin still returns `Repository not found`.
- Vercel CLI 54.7.1 cannot access scope `pavi-2e9809a4`; the connected Vercel
  app can inspect the exact project but its no-argument deploy operation cannot
  safely select this out-of-workspace source tree.
- Railway CLI identity is unauthorized for project
  `a21fd382-80b2-4218-8025-11f420a062e3`.
- No application deployment or feature-flag enablement was claimed.

## 2026-07-28 — M1 source publication and Railway deployment

Completed:

- Switched the active GitHub CLI identity to `kurtgav`.
- Published the reviewed source to private repository
  `Third-Code-Solutions/ERP`; `origin/main` reached
  `f28af8098de29e8f5627cd383261ef8d1c456df2`.
- Added reviewed Railway Docker deployment configuration and a bounded build
  context.
- Renamed Railway service `c45b3d01-036a-4663-a524-0713d782fce3` to
  `Third Code ERP API`.
- Added managed Redis service
  `55639597-de49-4825-9073-eafad0332efe`.
- Configured NestJS database, Supabase, Redis, CORS, runtime, start, health,
  restart, and watch-path settings without exposing values in source or logs.
- Deployed Railway release `8ccba547-8dde-4c37-8bcb-3f3834c18358`.
- Corrected the public domain target to injected runtime port 8080.
- Verified live API `/health` and `/ready`; PostgreSQL and Redis both report
  ready.
- Added Vercel `ERP_CORE_API_URL`, reconnected the project from the stale
  transferred-repository redirect to `Third-Code-Solutions/ERP`, and created a
  main-branch deploy hook.
- Returned `ERP_PROJECT_WRITES_VIA_API` to disabled for Production and Preview
  before any current frontend release.

Changed files:

- `railway.toml`
- `.dockerignore`
- `.gitignore`
- the six architecture/operations memory files

Validation:

- `pnpm --filter @third-code-erp/api typecheck` — pass.
- `pnpm --filter @third-code-erp/api test` — pass, 12 tests.
- `pnpm --filter @third-code-erp/api build` — pass.
- `git diff --check` — pass.
- Railway remote Docker build — pass.
- Railway `/health` — 200, service `third-code-erp-api`.
- Railway `/ready` — 200, database `ok`, Redis `ok`.
- Local Docker build — not run; Docker Desktop engine unavailable.

External blockers and rollback:

- GitHub Actions run `30288549139` failed before any step because the
  organization account has failed payments or an insufficient spending limit.
  Every dependent job was skipped.
- Vercel deployment `dpl_5Sdged8VSEc1if2UTAxWgPxYQ43P` was blocked before
  build because its historical commit mapped to non-team GitHub user
  `thirdcodekurt`. The production alias remained on the prior READY release.
- Rollback remains immediate: keep the Vercel write flag disabled, leave the
  prior frontend alias untouched, and redeploy the prior Railway release if
  API health regresses.

## 2026-07-28 — M1 Vercel production release

Completed:

- Pushed commit `e0060b40097fed9733eea8149e09f92460807f7d` as
  `kurtgav <kurtgavin.design@gmail.com>`.
- Vercel accepted the GitHub identity, built the Next.js application, and
  promoted production deployment `dpl_GctXj21P7kEQM4xbsfPU5rmUEC7t`.
- Enabled Vercel Web Analytics after browser QA found its script returning
  404.
- Redeployed the same reviewed SHA as
  `dpl_EUTTu6My37zSWEzt57XvPTa3MdhZ`; state is READY and the canonical alias
  points to it.
- Kept `ERP_PROJECT_WRITES_VIA_API=false` for Production and Preview.

Validation:

- Production `/` — 200.
- Production `/auth/login` — 200 with correct email/password autocomplete.
- Unauthenticated `/dashboard` — 307 to `/auth/login`.
- `/robots.txt` — 200 with private application routes disallowed.
- `/sitemap.xml` — 200 with the canonical landing URL.
- Canonical metadata, index/follow metadata, title, and description — pass.
- Desktop 1280×720 — no horizontal overflow; required images load.
- Mobile 390×844 — no horizontal overflow; navigation and CTAs remain usable.
- Final browser console — zero errors and zero warnings.
- Web Analytics script — 200 JavaScript.
- Runtime script metadata — exact production deployment
  `dpl_EUTTu6My37zSWEzt57XvPTa3MdhZ`.
- Former-product/prohibited-source live text scan — zero findings.
- Railway `/health` and `/ready` remained 200 after frontend release.

Remaining:

- GitHub Actions cannot start runners until the organization billing/spending
  issue is resolved.
- Live Supabase Auth and denial-path evidence for the Nest guard remains
  pending.
- The migrated Project-write flag remains disabled.

## 2026-07-28 — M1 live authorization and UUID compatibility

Completed:

- Inspected production authorization fixtures read-only: 13 active Auth-backed
  users across all canonical roles, two tenants, 24 Projects in the populated
  tenant, and one Project in a tenant with no users.
- Generated and immediately consumed one-time Supabase magic links for an
  allowed role and a Viewer. No passwords were read, printed, or reset.
- Exercised the deployed Nest guard only through guaranteed no-write paths.
- Found a real compatibility defect: a valid production Project uses a
  non-v4 UUID, while the route required UUID v4 and returned 400 before tenant
  lookup.
- Added a failing regression test, changed the route to accept all valid UUID
  forms, retained malformed-ID rejection, and deployed the fix.
- Published commit `bf3ca842b46fa832c4bd40a0f7f8bc27014ce43b`
  as `kurtgav <kurtgavin.design@gmail.com>`.
- Railway Git deployment `dd6d0098-c9b9-4825-ab2a-3da3131a09db` and explicit
  follow-up deployment `6b2a49aa-a7fa-4d4b-8b0a-51a06e6bdfae` both succeeded
  with `apps/api/Dockerfile`, `/ready`, and the reviewed start command.
- Vercel production deployment `dpl_FJjskHKyz1TztVwpNdoNR2TUhs7B` is READY on
  the same Git commit.

Changed files:

- `apps/api/src/projects/projects.controller.ts`
- `apps/api/test/projects.e2e.spec.ts`
- the six architecture/operations memory files

Validation:

- Regression red phase — expected 200, received 400.
- `pnpm --filter @third-code-erp/api test:e2e` — pass, 3 tests.
- `pnpm --filter @third-code-erp/api test` — pass, 13 tests.
- `pnpm --filter @third-code-erp/api lint` — pass.
- `pnpm --filter @third-code-erp/api typecheck` — pass.
- `pnpm --filter @third-code-erp/api build` — pass.
- Railway `/health` and `/ready` — 200.
- Missing bearer — 401.
- Invalid bearer — 401.
- Malformed Project UUID — 400.
- Viewer without `project.update` — 403.
- Allowed user targeting another tenant — 404.
- Allowed user with stale timestamp — 409.
- Before/after target Project snapshots — equal.
- Before/after audit count/latest timestamp — equal, 660 rows.

Rollback and unresolved:

- Rollback: redeploy Railway deployment
  `8ccba547-8dde-4c37-8bcb-3f3834c18358` or revert the one-line UUID parser
  change. Project-write feature flag remains false.
- GitHub Actions still cannot start runners because of organization
  billing/spending limits.
- Successful hosted mutation/audit attribution, observability, reconciliation,
  and rollback drill remain required before enabling the migrated write path.

## 2026-07-28 — M1 command observability and rollback selection

Completed:

- Added UUID correlation from the Next Project adapter through Nest and back
  in the `x-request-id` response header.
- Added Project-route middleware that records one JSON command outcome after
  response completion.
- Restricted log content to event, request ID, operation, method, status,
  outcome, and duration. Tests prove bearer tokens, payload contents, query
  values, and Project IDs are absent.
- Added exact feature-flag tests and Server Action branch tests. Empty,
  `false`, and `TRUE` retain the legacy database/audit path; only exact `true`
  selects Nest.
- Added an inert Vitest-only alias for Next's `server-only` boundary marker.
- Published commit `4fd1451e756ccb578ed013016d644e5048af6f92`
  as `kurtgav <kurtgavin.design@gmail.com>`.
- Railway deployment `83849120-b063-4275-8727-0f6b13f0cd4e` succeeded from
  the reviewed Dockerfile with `/ready` and
  `node apps/api/dist/main.js`.
- Vercel production deployment `dpl_9X7Vwgjj22R7WxyhJte8aTLBYiSd` is READY
  on the same commit.

Changed files:

- `apps/api/src/observability/request-observability.middleware.ts`
- `apps/api/src/observability/request-observability.middleware.spec.ts`
- `apps/api/src/projects/projects.module.ts`
- `apps/api/test/projects.e2e.spec.ts`
- `apps/web/src/lib/erp-core-client.ts`
- `apps/web/src/lib/erp-core-client.test.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/actions.test.ts`
- `apps/web/vitest.config.ts`
- `apps/web/test/server-only.ts`
- the six architecture/operations memory files

Validation:

- TDD red phase: missing API observability module and missing Web
  `x-request-id`.
- API tests — 17/17 pass; HTTP tests — 4/4 pass.
- Web tests — 67/67 pass.
- Root lint, typecheck, test, and production build — pass.
- Total root tests — 244 pass; 128 database cases skipped without the
  disposable `DATABASE_URL`.
- Forbidden external-ERP/legacy-brand trace scan — zero findings.
- Staged secret-pattern scan — zero findings.
- Railway `/health` and `/ready` — 200.
- Production frontend and Analytics script — 200.
- Live no-write PATCH — 401 with caller UUID echoed.
- Railway application log — same UUID, `project.update`, 401, `rejected`;
  safe fields only.

Rollback and unresolved:

- No database, schema, storage, provider-environment, or feature-flag write
  occurred.
- Local branch rehearsal proves `false` selects the existing Server Action
  database/audit path and `true` selects Nest only.
- Provider-level enable/rollback was intentionally not run; the hosted flag
  remains disabled.
- GitHub Actions run `30293798902` failed before any step because recent
  account payments failed or the spending limit must be increased. Actionlint
  had zero steps; seven dependent jobs were skipped.
- Successful hosted mutation/audit attribution, reconciliation, clean CI, and
  provider-level enable/rollback remain required before activation.

## 2026-07-28 — M1 controlled hosted transaction and restoration

Completed:

- Verified the selected record was designated demo data and captured its full
  mutable-field baseline plus the same-tenant audit tail before writing.
- Confirmed the requested `kurtgav` identity remains the Git/provider release
  identity. No matching application Auth user exists, so no membership was
  fabricated; the transaction used an existing authorized demo-tenant owner.
- Generated and consumed a one-time Supabase magic link without reading or
  changing a password. The resulting one-hour authenticated session resolved
  to the expected existing owner.
- Sent one direct PATCH to the deployed Nest Project command. Only the nullable
  notes field received a unique temporary marker; the optimistic timestamp
  matched the captured baseline.
- Verified the 200 response, caller UUID echo, same-tenant result, committed
  value, actor attribution, exact `notes` plus `updated_at` audit diff, and
  predecessor hash.
- Restored every original business value through a second authorized Nest
  PATCH using the first result's optimistic timestamp.
- Independently reconciled the final hosted state through the connected
  Supabase project: business fields equal the baseline, exactly two Project
  audit rows were added, both actors/actions/diff keys are correct, marker
  transitions round-trip, and the tenant hash chain is continuous.
- Revoked the temporary refresh session, cleared the one-hour access JWT and
  all credentials from the in-memory execution kernel, and kept
  `ERP_PROJECT_WRITES_VIA_API=false`.

Changed files:

- the six architecture/operations memory files only

Validation:

- Railway `/health` and `/ready` before the transaction — 200.
- Controlled update — 200; UUID
  `a51faa1d-87d7-4274-9d8c-ab36d5019cbb` echoed.
- Exact-value restoration — 200; UUID
  `95e83e6a-7fe3-4059-84e7-c0dba0431c65` echoed.
- Railway application logs — both UUIDs, `project.update`, 200,
  `succeeded`; safe fields only.
- Supabase reconciliation — original notes restored; two new Project audit
  rows; actor, action, diff, round trip, predecessor hashes, and full tenant
  chain valid.
- Root lint and typecheck — pass.
- Root tests — 244 pass; 128 database cases remain skipped without the
  explicitly disposable `DATABASE_URL`.
- Root production build — pass; Nest compiled and Next generated all 77 pages.
- Post-proof frontend, Web Analytics, Railway `/health`, and Railway `/ready`
  checks — 200.
- Evidence commit `9a43e2308018cb2e1be28efbd7f2c7924de1aef4`
  published to both `main` and `agent-02/third-code-erp-landing` as
  `kurtgav <kurtgavin.design@gmail.com>`.
- Vercel production deployment `dpl_FKBxqFQgZP2KmLr8eoJfjY5LmQsJ` — READY
  on that commit, canonical alias attached, creator `kurtgav`.
- Railway correctly retained code deployment
  `83849120-b063-4275-8727-0f6b13f0cd4e`; documentation-only paths are
  outside the API service watch set.

Rollback and unresolved:

- Business rollback is complete. The intended append-only audit evidence and
  expected `updated_at` advances remain.
- No schema, storage, source-runtime, provider-environment, or feature-flag
  mutation occurred.
- GitHub Actions still cannot start runners because of organization
  billing/spending limits. Run `30295276528` failed with zero Actionlint
  steps and seven skipped dependent jobs.
- Clean disposable PostgreSQL/Redis CI and the provider-level
  enable/rollback drill remain required before activation.

## 2026-07-28 — M1 tenant-scoped Project canary control

Completed:

- Rechecked clean source and provider identities before editing. Git, GitHub
  CLI, Vercel, and Railway remain associated with `kurtgav`.
- Tried to start the pinned disposable PostgreSQL 17/Redis lane locally.
  Docker Desktop is installed, and `pnpm dlx supabase@2.109.1 --version`
  returns the CI-pinned version.
- Diagnosed the local runtime failure from Docker and Windows evidence:
  firmware virtualization is disabled, no hypervisor is present, and Docker
  reports `HCS_E_HYPERV_NOT_INSTALLED`. No Windows feature, BIOS, production
  database, or hosted environment was changed.
- Inspected the Vercel project environment UI read-only. The Project-write
  flag exists for Production and Preview under `kurtgav`; the sensitive value
  is not disclosed by the dashboard. The editor was cancelled without saving.
- Found that the existing single global Boolean could not perform the required
  controlled-tenant canary: exact `true` would route every tenant at once.
- Added a second server-side gate,
  `ERP_PROJECT_WRITES_VIA_API_TENANT_IDS`, evaluated against the authenticated
  user's database-derived tenant.
- Made missing, empty, invalid, non-matching, and mixed-wildcard allowlists
  fail closed to the legacy path. `*` works only as the sole explicit entry.
- Passed the tenant ID from the authorized membership lookup into the selector.
  No browser-controlled tenant value is accepted.
- Added a Project cutover runbook covering entry gates, read-only baselines,
  tenant canary order, audit/hash reconciliation, rollback, and abort recovery.
- Kept `ERP_PROJECT_WRITES_VIA_API=false`. No tenant allowlist or provider
  environment value was added or changed.

Changed files:

- `apps/web/.env.example`
- `apps/web/src/lib/erp-core-client.ts`
- `apps/web/src/lib/erp-core-client.test.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/actions.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/actions.test.ts`
- `docs/runbooks/project-write-cutover.md`
- `docs/DEPLOYMENT.md`
- the six architecture/operations memory files

Validation:

- TDD red phase — three expected failures proved the global selector ignored
  tenant scope.
- Targeted Web tests — 4/4 pass.
- Root lint and typecheck — pass.
- Root tests — 244 pass; 128 database cases remain skipped without a
  disposable PostgreSQL instance.
- Root production build — pass; Nest compiled and Next generated all 77 pages.
- Source commit `79f32b7f24ade6d8902115db7e8b282af7e6f892` published to
  both `main` and `agent-02/third-code-erp-landing` as
  `kurtgav <kurtgavin.design@gmail.com>`.
- Vercel production deployment `dpl_7knv7FjxiYZ9Wj6DgvkC6cHVSjer` — READY
  on the source commit, canonical alias attached, creator `kurtgav`.
- Vercel working-branch preview `dpl_JCBnrVAeyoRuZbn6JsaehFTUHQm1` — READY
  on the same source commit, creator `kurtgav`.
- Railway deployment event `505b161b-2826-4b18-afc2-41504cf3fb80` — SKIPPED
  with `No changes to watched files`; the API correctly retained successful
  code deployment `83849120-b063-4275-8727-0f6b13f0cd4e`.
- Live canonical frontend, Railway `/health`, and Railway `/ready` — 200.
- Live landing output contains `Third Code ERP` and no
  external-ERP/legacy-brand trace.

Rollback and unresolved:

- Source rollback: revert the tenant-canary commit. With the production flag
  still exact false, deployment of this source does not route Project writes.
- GitHub Actions run `30296861757` remains blocked before runner startup by
  organization billing/spending limits. Actionlint had zero steps; seven
  dependent jobs were skipped.
- Local disposable parity requires enabling firmware virtualization and
  Windows Virtual Machine Platform, then restarting Windows.
- Clean zero-skip PostgreSQL/Redis CI remains required before configuring a
  tenant allowlist or changing the production flag.

## 2026-07-28 — M1 native zero-skip database evidence

Completed:

- Kept Docker Desktop and existing WSL distributions untouched after confirming
  firmware virtualization is unavailable.
- Imported a dedicated Alpine WSL1 test distribution and installed PostgreSQL
  17.10, pgvector 0.6.2, and Redis 8.0.4.
- Rebuilt the disposable database from zero through all 47 migrations and seed
  data. No hosted application database was used as a fixture.
- Made the security-advisor hardening migration portable when the optional
  `public.rls_auto_enable()` guide helper is absent.
- Added forward fixes for the receivable mirror trigger return, cash-posting
  PL/pgSQL alias resolution, bank-reversal ordering/concurrency, and Project
  Budget revision handoff.
- Updated payables/cash fixtures to satisfy current three-way-match and Cost
  Code evidence requirements.
- Corrected deterministic Stock Movement enum-order expectations and preserved
  exact transfer quantity/value assertions.

Changed files:

- `supabase/migrations/20260727162024_security_advisor_hardening.sql`
- `supabase/migrations/20260727194749_fix_receivable_mirror_return.sql`
- `supabase/migrations/20260727194757_fix_cash_posting_alias_resolution.sql`
- `supabase/migrations/20260727194805_fix_finance_workflow_guards.sql`
- `scripts/verify-database-repro.mjs`
- four database runtime test files
- the six architecture/operations memory files

Validation:

- Clean migration replay and seed — pass, 47/47.
- Catalog, RLS, function ACL, trigger, index, and ledger verifier — pass.
- Optional `rls_auto_enable()` verifier paths — absent pass; present and locked
  pass.
- Database release planner — current, 47/47, no gaps or unexpected versions.
- Dedicated database tests — 212/212 pass, zero skipped.
- Nest PostgreSQL/Redis integration — 1/1 pass.
- Supabase connected project check — `ERP`,
  `aqqrtkmtcsfkbyyqxowv`, ACTIVE_HEALTHY, PostgreSQL 17.
- Hosted migration release — pass, 47/47 with canonical head
  `20260727194805`; no gaps or unexpected versions.
- Hosted/local function parity — five repaired function MD5 fingerprints are
  identical.
- Hosted ACL verification — repaired privileged functions deny anon and
  authenticated execution and retain service-role execution.
- Hosted affected-row baseline — unchanged before/after: audit 662, invoices
  4, and zero rows in bank lines, cash transactions, journal lines, Project
  Budgets, and Supplier Bill lines.
- Supabase advisors after DDL — zero ERROR findings. Existing extension,
  intentional RLS-helper execution, leaked-password protection, duplicate
  index, and informational performance findings remain separately scoped.
- Root lint and typecheck — pass.
- Root tests — 244 pass; Turbo's filtered database task reports its normal 128
  skips, separately superseded by the fail-closed zero-skip lane above.
- Root production build — pass; Nest compiled and Next generated all 77 pages.

Rollback and unresolved:

- Source rollback: revert the forward-fix commit. After hosted application,
  database rollback is a reviewed compensating forward migration; never delete
  migration history or reset the linked project.
- Hosted Supabase is current at 47 migrations. Repository source publication
  and exact release-SHA/provider verification remain.
- GitHub Actions remains blocked before runner startup by organization
  billing/spending limits. Exact pinned Supabase PostgreSQL and Redis parity
  remains required before Project-write activation.
- `ERP_PROJECT_WRITES_VIA_API=false`; no tenant allowlist or provider
  environment changed.

Release evidence:

- Source commit `42010b9adce6ae89286449edfc1e27c9ffe1eda7`
  authored by `kurtgav <kurtgavin.design@gmail.com>`.
- GitHub refs `main` and `agent-02/third-code-erp-landing` both resolve to the
  exact source commit.
- Vercel production deployment `dpl_Hc4nUrodLQy98fextJvaowQLMU6J` — READY,
  canonical aliases attached, creator `kurtgav`, exact source commit.
- Vercel preview deployment `dpl_Cei1wPguAotpuJLaE4YoJUiFzxoR` — READY,
  creator `kurtgav`, exact source commit.
- Vercel canonical landing, `/api/health`, and `/api/ready` — 200. Build error
  filter and 15-minute runtime error scan — clean.
- Railway deployment `9e72f2c2-4e55-4878-ab4e-ace21b3fb0b7` — SUCCESS,
  running, exact source commit, commit author `kurtgav`. CLI session is
  `Kurt Gavin <kurtgavin.design@gmail.com>`.
- Railway `/health` and `/ready` — 200; database and Redis both `ok`.
- GitHub Actions run `30300165903` — billing/spending-limit failure before
  runner steps; Actionlint has zero steps and seven dependent jobs were
  skipped.

## 2026-07-28 — M1 release-tool reproducibility

Completed:

- Reran GitHub Actions run `30300434327`. Actionlint check
  `90092637986` again failed before runner startup with the exact
  account-payment/spending-limit annotation; it produced zero steps and no
  job log. Seven dependent jobs were skipped.
- Reproduced the Actionlint job in the isolated Linux lane. Upstream resolved
  the mutable bootstrap to Actionlint 1.7.12 and the workflow passed.
- Replaced the mutable `main` bootstrap with an explicit Actionlint 1.7.12
  release download and SHA-256 verification.
- Kept application code, database state, provider environments, tenant
  allowlist, and production write routing unchanged.

Changed files:

- `.github/scripts/run-actionlint.sh`
- `.github/workflows/ci.yml`
- the six architecture/operations memory files

Validation:

- Actionlint 1.7.12 on Linux — pass.
- Actionlint Linux release SHA-256 — pass.
- Pinned GitHub Action tag-to-commit checks — 5/5 pass.
- Frozen pnpm 10.33.0 install — pass; lockfile unchanged.
- Root lint and typecheck — pass.
- Root tests — 244 pass; the normal non-database lane reports 128 database
  skips, already superseded for source parity by the dedicated 212/212
  zero-skip lane.
- Root production build — pass; Nest compiles and Next generates 77 pages.
- Gitleaks 8.30.1 exact staged scan — zero findings.
- Repository identity — `kurtgav <kurtgavin.design@gmail.com>`.

Rollback and unresolved:

- Source rollback: revert the release-tool commit. No runtime or data rollback
  is required.
- Hosted CI remains blocked by GitHub account billing/spending limits. Local
  workflow validation cannot replace the missing hosted runner execution.
- `ERP_PROJECT_WRITES_VIA_API=false`; tenant allowlist remains empty.

Release evidence:

- Commit `d4ef08151fa60e62e239c0f049b08b1f83820789`, authored by
  `kurtgav <kurtgavin.design@gmail.com>`, is synchronized to GitHub `main` and
  `agent-02/third-code-erp-landing`.
- GitHub Actions run `30301208797`, Actionlint check `90094308552` — failed
  before runner startup with the account-payment/spending-limit annotation;
  zero steps, no job log, seven dependent jobs skipped.
- Vercel production `dpl_Ch8gGs6VZgN1kKWM2RdWuPkrNdhV` — READY on the exact
  commit, canonical alias attached, creator `kurtgav`.
- Vercel preview `dpl_By2dCRLkMR6vKEntDGc2HVechvV4` — READY on the exact
  commit, creator `kurtgav`.
- Vercel production build error-only scan — clean; runtime error clusters in
  the 15-minute release window — none.
- Canonical landing, `/api/health`, and `/api/ready` — 200.
- Railway event `6091af41-a567-4edb-8d56-5c2067dbe3f0` — SKIPPED with
  `No changes to watched files`; commit author `kurtgav`. Healthy API
  deployment `9e72f2c2-4e55-4878-ab4e-ace21b3fb0b7` remains RUNNING on
  `42010b9adce6ae89286449edfc1e27c9ffe1eda7`.
- Railway CLI identity — `Kurt Gavin <kurtgavin.design@gmail.com>`.
- Railway `/health` — 200; `/ready` — 200 with database and Redis both `ok`.

## 2026-07-29 -- Vercel cost-control course correction

Completed:

- Inspected the connected Vercel project and the last 24 hours of deployments.
- Confirmed four CI-only source commits each triggered one production build
  from `main` and one preview build from the synchronized feature ref: eight
  READY deployments total.
- Confirmed latest production deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt` is READY on
  `f24e5603a35571f8dcadd43fc09c64d12646a7d0`.
- Stopped further Git pushes and explicit Vercel deployment calls.
- Prepared LF enforcement for SQL and a value/path-specific Gitleaks allowlist
  locally; neither change has been pushed.
- Added the local Vercel fail-closed configuration
  `git.deploymentEnabled=false`; it remains unpushed until provider Git
  disconnection is approved and verified.
- Hardened transient-runner cleanup, removed stale runner credentials and work
  directories, and confirmed GitHub reports zero registered runners.
- Recorded decision D-034: source pushes do not authorize Vercel releases.

Validation:

- GitHub self-hosted run `30419757852` passed workflow validation, lint,
  typecheck, unit tests, all 48 migrations, 212/212 database tests, Nest
  integration, production build, and native Nest smoke.
- The only failure was Gitleaks rule `generic-api-key` on the deterministic
  `--restrict-key=0123456789abcdef0123456789abcdef` schema delimiter.
- The workflow contains no Vercel deploy command.
- Vercel deployment inventory showed no active build after the audit.
- Vercel JSON parse, PowerShell parse, Actionlint 1.7.12, Gitleaks 8.30.1
  across 90 commits, and `git diff --check` all pass for the local remediation.
- Root lint, typecheck, unit suites, Nest/Next production build, and all 77
  generated Next pages pass locally without cloud compute.
- The isolated database lane replays all 48 migrations on PostgreSQL 17, runs
  212/212 database tests with zero skips, passes Nest database integration, and
  reproduces schema SHA-256
  `963464C47A8C3B2F771ABB940A0DC106C103FD5DF2410707884B736110A58D26`.
- Disposable PostgreSQL/Redis services stopped cleanly after validation.

Provider and CI evidence:

- Vercel Git was disconnected with user authorization. Existing production
  stayed READY; landing, health, and readiness remained HTTP 200.
- Guard commit `ae373ce6f399e0d4bc5c7ef23537cc4f9b842837` was pushed to both
  release refs as `kurtgav`; Vercel created zero deployments.
- Self-hosted run `30421480977` passed every substantive gate, including the
  48-migration/212-test database lane, production build, native Nest smoke, and
  Gitleaks. It was cancelled only after setup-node's post-job pnpm cache upload
  remained stuck.
- Remote dependency-cache upload is removed from the self-hosted workflow.
  Follow-up run `30422175962` passed every step on exact SHA
  `277e03484c00b6c9c6e27bae7d708302bb6d2e88` in 5m33s.
- GitHub reports zero registered runners and Windows reports zero runner
  processes. Credential files are erased from all retained runner directories.
  Windows still holds non-secret work files open; physical deletion will be
  retried separately.
- Vercel still reports zero deployments after both source pushes. Production
  deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt` remains READY; landing,
  health, and readiness return HTTP 200.

## 2026-07-28 -- Production dashboard enum-catalog repair

Completed:

- Reproduced production digest `862076041` in an isolated PostgreSQL 17
  database. Exact failure: `invalid input value for enum
  purchase_order_status: "partial_delivered"` (`22P02`).
- Traced the crash to the dashboard committed-purchase-order query. The
  canonical application schema includes `partial_delivered`; migration
  `20260512130000_third_code_erp_po_approval.sql` omitted it.
- Added forward migration
  `20260728005112_fix_purchase_order_status_catalog.sql`.
- Applied the same migration to Supabase project
  `aqqrtkmtcsfkbyyqxowv`.
- Extended the fail-closed database verifier with the exact ordered
  purchase-order status catalog.

Changed files:

- `supabase/migrations/20260728005112_fix_purchase_order_status_catalog.sql`
- `scripts/verify-database-repro.mjs`
- the six architecture/operations memory files

Validation:

- Isolated PostgreSQL 17 direct enum cast -- pass.
- Database replay/catalog verifier -- pass, 48 migrations and 30 protected
  tables.
- Read-only database release planner -- current, 48/48, no gaps or unexpected
  history.
- Dedicated database suite -- 212/212 pass, zero skips.
- Root lint and typecheck -- pass.
- Root test lane -- pass; dedicated database lane supersedes its intentional
  database skips.
- Nest and Next production builds -- pass; Next generated 77 pages.
- Hosted enum catalog -- exact 12 canonical labels; direct
  `partial_delivered` cast passes.
- Hosted pre/post reconciliation -- 13 purchase orders, `378642000` total
  cents, 662 audit rows, and identical status counts.

Rollback and unresolved:

- The safe rollback is forward compensation only. Removing a PostgreSQL enum
  label is destructive and is not an emergency rollback.
- No business or audit rows changed.
- Anonymous production `/dashboard` correctly redirects to sign-in after the
  repair.
- `ERP_PROJECT_WRITES_VIA_API=false`; tenant allowlist remains empty.

## 2026-07-29 -- Authenticated dashboard incident closure

Completed:

- Reused the user's authenticated in-app session without copying credentials,
  cookies, local storage, or tokens.
- Hard-reloaded `https://thirdcode-erp.vercel.app/dashboard` on production
  deployment `dpl_5a132nUPMyqNHUMT4JwA8EpBqgHr`.
- Verified production title `Dashboard | Third Code ERP`, authorized Admin
  identity, Key performance indicators, and Risk Signals content.
- Browser console error scan returned zero errors.
- Vercel runtime records authenticated `/dashboard` requests on the repaired
  deployment and zero `/dashboard` runtime-error clusters in the proof window.
- Confirmed GitHub CLI and connected GitHub app both use `kurtgav`; local Git
  author remains `kurtgav <kurtgavin.design@gmail.com>`.
- Reran CI run `30318929116` under `kurtgav`. Actionlint check
  `90343298615` again failed before runner startup with zero steps because
  GitHub reports failed account payments or an insufficient spending limit.

Changed files:

- the six architecture/operations memory files only

Validation:

- Authenticated production dashboard hard reload -- pass.
- Critical dashboard-region render -- pass.
- Browser console -- zero errors.
- Vercel `/dashboard` runtime errors -- zero in proof window.
- Repository worktree before documentation update -- clean at
  `cf6c8e2ce1ee331f0b0b4d5428ab4ea88d540518`.

Rollback and unresolved:

- Documentation-only rollback: revert this evidence commit.
- GitHub-hosted CI remains externally blocked before runner execution.
- `ERP_PROJECT_WRITES_VIA_API=false`; tenant allowlist remains empty.

## 2026-07-29 -- No-cost short-lived CI alternative

Completed:

- Confirmed GitHub-hosted run `30379589707`, attempt 3, check `90353729857`
  was rejected with zero executed steps by the organization billing/spending
  limit.
- Added a manual `kurtgav`-only workflow for a short-lived repository runner.
- Added checksum-pinned cross-platform Actionlint 1.7.12 and Gitleaks 8.30.1
  launchers.
- Added a test-only Supabase system fixture and an isolated WSL1 database lane
  using PostgreSQL 17, exact Redis 7.4.9, and database
  `erp_self_hosted_ci`.
- Added native Nest production smoke and fail-safe cleanup scripts.
- Added a pinned GitHub Actions Runner 2.336.0 bootstrap that verifies the
  archive digest, refuses public repositories or non-`kurtgav` identities,
  dispatches one job, deregisters the runner, and deletes its work directory.
- Recorded and cancelled diagnostic run `30418930049`. GitHub accepted the
  workflow dispatch but deleted `--ephemeral` registrations before the runner
  listener could open a session. The replacement uses one short-lived standard
  registration with explicit process stop, deregistration, and erasure.
- Added the operator runbook and recorded decision D-033.

Changed files:

- `.github/actionlint.yaml`
- `.github/workflows/ci.yml`
- `.github/workflows/ci-self-hosted.yml`
- `package.json`
- `scripts/lib/run-pinned-release-tool.mjs`
- `scripts/run-actionlint.mjs`
- `scripts/run-gitleaks.mjs`
- `scripts/ci/run-transient-github-runner.ps1`
- `scripts/ci/run-wsl1-database-lane.ps1`
- `scripts/ci/smoke-api.ps1`
- `scripts/ci/stop-wsl1-database-lane.ps1`
- `scripts/ci/supabase-system-bootstrap.sql`
- `docs/runbooks/self-hosted-ci.md`
- the six architecture/operations memory files

Validation:

- PowerShell parser -- pass for all four runner/database/smoke scripts.
- Actionlint 1.7.12 and pinned action-reference validation -- pass.
- Root lint and typecheck -- pass.
- Root unit tests and seven database release-planner tests -- pass.
- Fresh Next/Nest production build -- pass; 77 Next pages.
- Clean PostgreSQL 17 replay -- pass, 48 migrations.
- Database suite -- 212/212 pass, zero skips.
- Nest database integration -- pass.
- Before/after schema SHA-256 -- identical,
  `963464C47A8C3B2F771ABB940A0DC106C103FD5DF2410707884B736110A58D26`.
- Native Nest production smoke -- health, database/Redis readiness, and
  unauthenticated Project PATCH 401 all pass.
- Gitleaks 8.30.1 -- 86 commits, zero findings.

Rollback and unresolved:

- No production runtime, database, feature flag, or tenant allowlist changed.
- Remove the manual workflow and runner scripts to roll back this alternative.
- Remote GitHub self-hosted workflow proof is still required after push.
- Redis reports the WSL1 host `vm.overcommit_memory` warning; persistence and
  background saves are disabled in this disposable test-only process.
- `ERP_PROJECT_WRITES_VIA_API=false`; tenant allowlist remains empty.

## 2026-07-29 -- M1 read-only Project cutover preflight

Outcome:

- Verified the connected Supabase ERP project is healthy on PostgreSQL 17.6.
- Inspected tenant, Project, user, Auth, audit-trigger, function-hardening, and
  audit-chain state with read-only SQL only.
- Identified a reversible E2E Project and an authorized Admin in the main demo
  tenant without recording raw identifiers or business values in Git.
- Blocked that target: its full append-only tenant history has two predecessor
  discontinuities and 151 hashes that do not verify under the current formula.
- Rejected the alternate QA tenant: its one-row chain is clean, but it has no
  application user or Supabase Auth identity.
- Added a redacted Project cutover planner using a repeatable-read, read-only
  transaction. It fails closed on target scope, capability, Auth, PostgreSQL
  version, audit controls, predecessor continuity, hash verification, and
  Project history.
- Kept Vercel Git disconnected; Vercel recorded zero new deployments.
- Publishing the root `package.json` planner aliases matched Railway's API
  watch patterns and created one deployment,
  `dffa3105-7db3-4bd2-8ba9-505bf2248aee`, on exact commit `62d9106f`. No API
  source changed. The deployment completed successfully; `/health` and
  `/ready` remain HTTP 200.
- No database write, Auth mutation, feature-flag change, or allowlist change
  occurred.

Changed files:

- `.github/workflows/ci.yml`
- `.github/workflows/ci-self-hosted.yml`
- `package.json`
- `scripts/lib/project-cutover-plan.mjs`
- `scripts/plan-project-cutover.mjs`
- `scripts/plan-project-cutover.test.mjs`
- `docs/runbooks/project-write-cutover.md`
- the six architecture/operations memory files

Validation:

- Project cutover planner unit tests -- 6/6 pass.
- Planner syntax check -- pass.
- Hosted read-only planner against the selected demo target -- expected
  `blocked`; PostgreSQL 17, target/actor/Auth/control checks pass, full-chain
  integrity checks fail with the recorded historical mismatch counts.
- No secret, UUID, email, or business value appears in planner output.
- Root lint, typecheck, unit suites, and production build -- pass; the root
  database suite intentionally skips runtime cases without `DATABASE_URL`.
- Authoritative self-hosted database lane remains 212/212 with zero skips.
- Hosted migration ledger -- current, 48/48, no gaps or unexpected versions.
- Actionlint 1.7.12 and pinned action-reference validation -- pass.
- Gitleaks 8.30.1 -- 93 commits, zero findings.
- GitHub hosted run `30423405464` -- blocked by the existing account
  billing/spending limit before any step; self-hosted proof remains the
  authoritative green lane.
- Vercel deployment count after source publication -- zero; canonical landing,
  `/api/health`, and `/api/ready` remain HTTP 200.

Rollback and unresolved:

- Source rollback: revert this planner/documentation milestone; no production
  data requires rollback. If the operational-tooling Railway rebuild proves
  defective, redeploy last-known-good API deployment
  `2b77cc8e-3c5a-44df-8c4d-58926aced3bb`.
- Do not enable the provider flag for either current tenant.
- Next: inspect and execute the supported dedicated-canary onboarding path,
  then require a zero-blocker planner result before requesting one paid Vercel
  production release.

## 2026-07-29 -- Dedicated canary onboarding inspection

Outcome:

- Traced the deployed customer onboarding path without mutation.
- Confirmed canonical `/auth/signup` returns HTTP 200 and renders the account
  form.
- Confirmed the hosted `on_auth_user_created` trigger exists.
- Confirmed its non-public `SECURITY DEFINER` function creates one tenant and
  same-ID application profile; direct execution is revoked from `anon` and
  `authenticated`.
- Confirmed new profiles receive Admin role and `/projects/new` creates a
  tenant-scoped Project with the authenticated actor.
- Determined no implementation change is needed for canary provisioning.

Validation:

- Repository source trace -- signup, Auth trigger, profile resolution, and
  Project creation paths verified.
- Hosted function and trigger inspection -- pass, read-only.
- Live signup page -- HTTP 200.
- No Auth user, tenant, profile, Project, audit row, email, provider variable,
  or deployment changed.

Rollback and unresolved:

- No state or source change requires rollback.
- Execution requires explicit approval for an unused user-controlled email and
  completion of its confirmation step.
- After confirmation, the exact next gate is the redacted read-only Project
  cutover planner; production routing remains disabled.

## 2026-07-29 -- Signup provisioning hardening

Outcome:

- Added and applied forward migration
  `20260729051205_harden_signup_provisioning.sql`.
- Hardened `public.handle_new_user()` with an empty `search_path`, fully
  qualified relations and built-ins, bounded display metadata, a deterministic
  bounded tenant slug, and safe missing-email fallbacks.
- Kept atomic tenant plus same-ID Admin provisioning and the existing Auth
  trigger contract.
- Revoked direct execution from `PUBLIC`, `anon`, and `authenticated`; retained
  `service_role`.
- Reconciled the connector-assigned hosted migration version into repository
  history without executing the SQL twice.

Validation:

- Hosted release plan -- current, PostgreSQL 17, 49/49 migrations.
- Hosted function -- `SECURITY DEFINER`, `search_path=""`, qualified
  `public.tenants`/`public.users`, trigger enabled, client execution denied.
- Hosted row counts before/after -- 13 Auth users, 13 application profiles,
  2 tenants; unchanged.
- Disposable PostgreSQL 17/Redis 7.4.9 lane -- 49 migrations, verifier pass,
  218/218 database tests with zero skips, Nest database integration pass.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` -- pass.
- Database release/cutover planner tests, Actionlint, pinned action references,
  Gitleaks, and `git diff --check` -- pass.
- Supabase security/performance advisors -- no finding on
  `handle_new_user`; pre-existing function, extension, Auth configuration,
  foreign-key, duplicate-index, and unused-index findings remain backlog.
- Source commit `72afd93bbd09925d7de9a839b7dd8259db519eac` -- pushed to
  `main` and `agent-02/third-code-erp-landing` as `kurtgav`.
- Railway deployment `1a0cd374-7bd1-449c-9083-ecf4598ccd04` -- success;
  `/health` and `/ready` HTTP 200 with PostgreSQL and Redis ready.
- Vercel deployment count after publication -- zero; Git remains disconnected.
- GitHub hosted run `30424816981` -- failed before any Actionlint step and
  skipped all dependent jobs because of the existing account billing block;
  local and no-cost disposable validation remains authoritative.

Rollback and unresolved:

- No data rollback is required; the migration changed only a function
  definition and privileges.
- If signup regression appears, disable public signup operationally and apply a
  reviewed forward compensation restoring the prior function body and
  privileges. Never edit applied migration history or delete provisioned rows.
- Canary creation still requires explicit approval for an unused
  user-controlled email and completion of its confirmation step.
- Project routing remains disabled and the tenant allowlist remains empty.

## 2026-07-29 -- Signup organization classification persistence

Outcome:

- Added a canonical six-value organization-type domain catalog and reused it
  in the signup form options and client validation.
- Added `public.tenants.organization_type` as constrained, non-null tenant
  profile data with safe default `other`.
- Updated the hardened Auth provisioning trigger to whitelist signup metadata;
  tampered values cannot grant authority and fall back to `other`.
- Applied hosted migration
  `20260729054456_persist_signup_organization_type.sql` and reconciled the
  connector-assigned version into the repository ledger.
- Existing tenants were backfilled to `other`. No Auth user, email, Project,
  provider variable, or deployment was created.

Changed files:

- `packages/shared-types/src/organization-types.ts`
- `packages/shared-types/src/index.ts`
- `apps/web/src/app/(auth)/auth/signup/signup-options.ts`
- `apps/web/src/app/(auth)/auth/signup/signup-options.test.ts`
- `apps/web/src/app/(auth)/auth/signup/signup-form.tsx`
- `packages/database/package.json`
- `packages/database/src/schema/tenants.ts`
- `packages/database/src/sql/handle-new-user.sql`
- `packages/database/src/__tests__/signup-provisioning.test.ts`
- `scripts/verify-database-repro.mjs`
- `supabase/migrations/20260729054456_persist_signup_organization_type.sql`
- `pnpm-lock.yaml`
- the six architecture/operations memory files
- `docs/runbooks/project-write-cutover.md`

Validation:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` -- pass.
- Root suites: shared types 76, Web 69, API 17; database 88 pass and 132
  expected skips without a disposable `DATABASE_URL`.
- Release planner tests 7/7; cutover planner tests 6/6; Actionlint 1.7.12;
  pinned action references; Gitleaks 8.30.1; `git diff --check` -- pass.
- Disposable PostgreSQL 17/Redis 7.4.9 lane -- 50 migrations, verifier pass,
  220/220 database tests with zero skips, Nest integration 1/1, schema
  fingerprint
  `D9225C443A3B88EC62F777B3C8983992ADC4991C060594671832483903650D37`.
- Hosted release ledger -- current, 50/50, head `20260729054456`.
- Hosted row counts before/after -- 13 Auth users, 13 application profiles,
  2 tenants; unchanged.
- Hosted organization contract -- `NOT NULL`, default `other`, validated
  catalog constraint; both existing tenants equal `other`.
- Hosted signup authority -- `search_path=""`, trigger enabled, client
  execution denied, `service_role` execution retained.
- Supabase advisors -- 12 security and 284 performance notices; zero finding
  tied to the new organization field, constraint, or signup function. Existing
  advisor backlog remains unresolved.
- Source commit `828b63f90f13f6ff735a2b972781a69fa7ffcf2f` -- pushed
  atomically to `main` and `agent-02/third-code-erp-landing` as `kurtgav`.
- Railway deployment `f480586e-fe8d-4214-a33e-7bfdaaa5f38c` -- success from
  exact source commit; `/health` and `/ready` HTTP 200 with PostgreSQL and
  Redis `ok`.
- Vercel deployment count after source publication -- zero; Git remains
  disconnected.

Rollback and unresolved:

- Applied migration history is immutable. If signup regresses, disable public
  signup and apply a reviewed forward compensation restoring the prior trigger
  while retaining or safely deprecating the additive profile column.
- Canary creation still requires explicit approval for an unused
  user-controlled email plus confirmation.
- Project routing remains disabled; tenant allowlist remains empty.
- Exact next action: complete approved normal signup, email confirmation, and
  one non-critical Project; then run the redacted cutover planner with
  `--require-ready`.

## 2026-07-29 -- Architecture memory reconciliation

Outcome:

- Recounted the repository at 50 Supabase migrations and 45 Drizzle schema
  files; confirmed migration head `20260729054456`.
- Reconciled current M1 documentation from stale 44/49/218 values to the
  verified 50-migration, 220/220 zero-skip database baseline.
- Updated current Railway source/deployment evidence to source
  `828b63f90f13f6ff735a2b972781a69fa7ffcf2f` and deployment
  `f480586e-fe8d-4214-a33e-7bfdaaa5f38c`.
- Recorded that `AGENTS.md` references a missing PRD and obsolete pnpm 9,
  PostgreSQL 16, tRPC, and Inngest target rules. No unapproved rewrite of that
  owner-controlled file was performed.
- Kept M1 canary routing disabled. No Auth, database, provider, or runtime state
  changed.

Changed files:

- `docs/architecture/CURRENT_STATE.md`
- `docs/architecture/TARGET_STATE.md`
- `docs/architecture/MIGRATION_PLAN.md`
- `docs/architecture/DECISIONS.md`
- `docs/operations/WORK_LOG.md`
- `docs/operations/NEXT_ACTIONS.md`
- `docs/blockers/2026-07-29-stale-repository-governance.md`
- `docs/changesets/2026-07-29-architecture-memory-reconciliation.md`

Validation:

- Repository recount and dependency-manifest inspection -- pass.
- Current drift search -- no stale 44/49/218 claim remains in current-state or
  current M1 status; chronological work-log evidence remains unchanged.
- Markdown/diff hygiene -- pass.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` -- pass.
- Root tests -- 250 pass; 132 disposable-database-gated cases skip as designed.
- Release planner 7/7; cutover planner 6/6; Actionlint 1.7.12; pinned action
  references; Gitleaks 8.30.1 over 100 commits -- pass.

Rollback and unresolved:

- Revert the documentation commit; runtime and provider state are unaffected.
- M1 still requires explicit approval for one unused canary email.
- `AGENTS.md` reconciliation requires separate owner sign-off.
- Exact next action remains approved normal signup, email confirmation, one
  reversible non-critical Project, and a zero-blocker cutover planner.

## 2026-07-29 -- Public landing mobile QA correction

Outcome:

- Audited live landing at 1440px, 768px, and 390px with full-page screenshots,
  accessibility snapshots, computed line boxes, interaction sweeps, console,
  network, metadata, and structured data.
- Preserved the accepted landing architecture. Corrected the mobile hero from
  six measured lines to exactly three and reduced the mobile action headline.
- Removed decorative capability, operation, workflow, and FAQ ordinals while
  retaining the functional carousel position.
- Enforced at least 44px for every visible mobile link, button, and summary.
- Scoped Vercel Analytics to `VERCEL=1`; self-hosted production no longer
  requests the unavailable insights script.
- Replaced duplicate image preload hints with one eager, high-priority,
  responsive hero image. Decorative and below-fold copies remain lazy.
- Added final desktop, tablet, and mobile evidence under
  `docs/design-references/`.
- No database, Auth, Nest, Redis, queue, tenant-routing, provider variable, or
  deployment state changed.

Changed files:

- `apps/web/src/app/layout.tsx`
- `apps/web/src/components/marketing/third-code-landing.tsx`
- `apps/web/src/components/marketing/third-code-landing.module.css`
- `docs/architecture/CURRENT_STATE.md`
- `docs/architecture/TARGET_STATE.md`
- `docs/architecture/MIGRATION_PLAN.md`
- `docs/architecture/DECISIONS.md`
- `docs/operations/WORK_LOG.md`
- `docs/operations/NEXT_ACTIONS.md`
- `docs/research/PAGE_TOPOLOGY.md`
- `docs/research/BEHAVIORS.md`
- `docs/research/components/third-code-landing.spec.md`
- `docs/changesets/2026-07-29-public-landing-mobile-qa.md`
- three `docs/design-references/third-code-landing-*-2026-07-29.png` files

Validation:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` -- pass.
- Root tests -- 250 pass; 132 disposable-database-gated cases skip as designed.
- Optimized Web build -- 77/77 routes generated.
- Browser widths 1440/768/390 -- no horizontal overflow; H1 line counts 3/3/3.
- Mobile visible targets below 44px -- zero.
- Decorative ordinal labels -- zero.
- Accordion, hover expansion, carousel, and FAQ interactions -- pass.
- JSON-LD -- valid Organization, SoftwareApplication, and FAQPage graph.
- Local production console -- zero errors and zero warnings.
- Live canonical, robots, sitemap, manifest, health, and readiness -- HTTP 200.
- Provenance scan -- no prohibited external ERP source or brand terms.
- Source commit `f40b2472d070085ef114143b65cfd822bda30f0d` -- pushed
  atomically to `main` and `agent-02/third-code-erp-landing` as `kurtgav`.
- Vercel deployment count after source publication -- zero; Git remains
  disconnected.

Rollback and unresolved:

- Revert feature commit `f40b2472d070085ef114143b65cfd822bda30f0d`
  and this evidence update. Runtime/database/provider rollback is unnecessary.
- Live Vercel remains on deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`;
  corrected source is intentionally not deployed.
- M1 still requires explicit approval for one unused canary email, normal
  signup and confirmation, one reversible non-critical Project, and a
  zero-blocker cutover planner.
- Any paid frontend build still requires exact charge disclosure and explicit
  user approval.

## 2026-07-29 -- M2 document-processing evidence design

Outcome:

- Traced complete upload path through browser, Next.js upload handlers, inline
  DXF extraction, visual/AI extraction, Inngest retry, Python CAD parsing,
  scope replacement, and draft-BOM creation.
- Verified Python directly deletes/inserts `scope_items`, commits with
  `DATABASE_URL`, and downloads files using a Storage service-role key.
- Verified BullMQ/Redis foundation exists in NestJS but has no registered
  business queue or processor.
- Read hosted PostgreSQL 17.6 catalog without business-data writes.
  `documents` and `scope_items` have RLS but no composite tenant/Project
  foreign keys and no audit triggers.
- Defined an original evidence-only Python contract, explicit Nest
  capabilities, durable job state machine, immutable evidence, opaque BullMQ
  payload, transaction/idempotency rules, compatibility adapter, test matrix,
  staged rollout, and rollback.
- Kept M1 routing disabled and Vercel Git disconnected. No application code,
  schema, business data, Auth, Storage, queue, provider setting, or deployment
  changed.

Changed files:

- `docs/architecture/M2_DOCUMENT_PROCESSING_EVIDENCE_CONTRACT.md`
- `docs/architecture/CURRENT_STATE.md`
- `docs/architecture/TARGET_STATE.md`
- `docs/architecture/MIGRATION_PLAN.md`
- `docs/architecture/DECISIONS.md`
- `docs/operations/WORK_LOG.md`
- `docs/operations/NEXT_ACTIONS.md`
- `docs/changesets/2026-07-29-m2-document-processing-design.md`

Validation:

- Repository source trace and Nest/Python symbol inspection -- pass.
- Hosted catalog inspection -- read-only, PostgreSQL 17.6.
- Vercel deployments since disconnect baseline -- zero.
- Documentation path, prohibited-term, Markdown, and diff checks -- pass.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` -- pass.
- Root tests -- 250 pass; 132 disposable-database-gated cases skip as
  designed because this documentation-only milestone did not inject a database
  target.
- Optimized Web build -- 77/77 routes generated.

Rollback and unresolved:

- Revert this documentation-only milestone; runtime and provider state are
  unchanged.
- M1 still requires explicit canary-email approval, normal signup and
  confirmation, one reversible Project, and a zero-blocker cutover plan.
- M2 application code still requires separate owner-approved `AGENTS.md`
  reconciliation.

## 2026-07-29 -- Upload tenant-Project access hardening

Outcome:

- Found shared `getProject` queried only tenant, loaded one arbitrary Project,
  then compared requested ID in application code.
- Found upload sign and complete routes did not first prove requested Project
  belongs to authenticated tenant.
- Fixed shared lookup to query tenant and Project ID together.
- Added same-tenant Project guard to both upload routes before quota, Storage,
  document insert, parsing, AI, or queue work.
- Preserved same-tenant signed-upload and document-recording response behavior.
- Changed no UI, copy, schema, business data, Auth, Storage, queue, provider
  setting, or deployment.

Changed files:

- `apps/web/src/lib/project-queries.ts`
- `apps/web/src/lib/project-queries.test.ts`
- `apps/web/src/app/api/upload/sign/route.ts`
- `apps/web/src/app/api/upload/sign/route.test.ts`
- `apps/web/src/app/api/upload/complete/route.ts`
- `apps/web/src/app/api/upload/complete/route.test.ts`
- `docs/architecture/M2_DOCUMENT_PROCESSING_EVIDENCE_CONTRACT.md`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-upload-project-access-hardening.md`

Validation:

- Focused Project-query and upload-route tests -- 6/6 pass.
- Cross-tenant/missing Project -- 404 before quota, Storage, document insert,
  parsing, AI, or queue calls.
- Valid same-tenant sign and complete compatibility paths -- pass.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` -- pass.
- Root tests -- 256 pass; 132 disposable-database-gated cases skip as designed.
- Optimized Web build -- 77/77 routes generated.
- Prohibited provenance and diff-hygiene checks -- pass.

Rollback and unresolved:

- Revert this source/documentation milestone; runtime and provider state remain
  unchanged.
- Live protection requires one explicitly approved Vercel production build.
  Bundle it with existing landing candidate; create no duplicate preview.
- Composite database constraints remain required in M2.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-30 -- RFQ terminal NestJS adapter

Completed:

- Added strict shared complete/cancel command and success contracts.
- Added the capability-guarded Nest transition route and parser.
- Moved tenant lock, terminal state checks, completion coverage validation,
  guarded update, actor stamp, and semantic audit into one Nest transaction.
- Added a separate fail-closed Next-to-Nest adapter gate. Existing Server
  Action results, route revalidation, and post-commit notification behavior
  remain compatible.
- Extended real PostgreSQL integration proof through completion,
  cross-tenant denial, repeat conflict, cancellation, and reason audit.
- Kept all cutover flags disabled. No UI, database migration, provider
  configuration, or live data changed.

Changed files:

- `packages/shared-types/src/erp-api/procurement.ts`
- `packages/shared-types/src/erp-api/procurement.test.ts`
- `apps/api/src/procurement/transition-rfq.pipe.ts`
- `apps/api/src/procurement/procurement.controller.ts`
- `apps/api/src/procurement/procurement.controller.spec.ts`
- `apps/api/src/procurement/procurement.service.ts`
- `apps/api/src/procurement/procurement.service.spec.ts`
- `apps/api/integration/procurement.database.integration.spec.ts`
- `apps/web/src/lib/erp-core-client.ts`
- `apps/web/src/lib/erp-core-client.test.ts`
- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.ts`
- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.test.ts`
- `docs/research/components/rfq-terminal-nest-adapter.spec.md`
- the six architecture/operations memory files

Validation:

- Focused shared, API, and Web contracts: 61/61 pass.
- Root lint and typecheck: pass.
- Root application tests: 397/397 pass.
- Local database tests: 99 pass and 137 credential-dependent checks skip as
  designed.
- Production build: pass; 77/77 pages generated.
- Disposable PostgreSQL 17/Redis 7.4.9 lane: 54/54 migrations, 236/236
  database tests with zero skips, stable schema fingerprint, and 2/2 Nest
  database integration tests.
- Actionlint 1.7.12, pinned action-reference checks, both release planners,
  Gitleaks 8.30.1, diff check, and product-path ERPNext/Frappe scan: pass.

Rollback and unresolved:

- Source rollback is one revert. Existing RFQ integrity migrations remain
  forward-only and unchanged.
- Production flags remain disabled. A provider canary still requires an
  approved clean tenant and exact environment/monitoring/rollback review.
- Vercel remains disconnected and no frontend deployment is authorized.

## 2026-07-30 — Inert NestJS RFQ quote adapter

Completed:

- Added ProcurementModule, strict quote endpoint, shared contracts, capability
  policy, tenant-scoped transaction, idempotency lock, state checks, and
  semantic audit writer.
- Added disabled Next.js cutover with exact tenant allowlist and fail-closed
  behavior. No provider flag enabled; no Vercel deployment requested.
- Added unit, HTTP contract, action/client, authorization, and disposable
  PostgreSQL integration coverage.

Validation:

- Lint and full typecheck passed.
- Shared 79/79, web 265/265, API rerun 26/26.
- Disposable lane: 54/54 migrations, database 236/236 zero skips, API
  integration 2/2, stable schema hash
  `36B8999F16B825D89D8F782CBF28180D074AD677A9E8B2C16B713C79BB931BB6`.
- Nest and Next production builds passed; Next generated 77/77 pages.
- Gitleaks, Actionlint, workflow action refs, and diff checks passed.
- Full parallel test run exposed local CPU timeout only; all affected API
  tests passed immediately API-only after the bounded timeout adjustment.

Unresolved:

- Adapter is intentionally disabled. M1 canary/provider approval remains the
  activation gate.
- Complete/cancel remain Next.js authority.

## 2026-07-30 — RFQ adapter provider and canary verification

Completed:

- Confirmed Railway deployed exact commit `cdb246a` as deployment
  `f51c7aba-d5d9-4ccd-9cbe-46fa508117af` under `kurtgav`.
- Confirmed live health/readiness, PostgreSQL, Redis, anonymous 401, and no
  deployment error logs.
- Confirmed Vercel created zero deployments after the retained baseline.
- Queried hosted Supabase read-only. Neither existing tenant is a valid M1
  canary: QA has no application/Auth user; demo audit integrity remains
  invalid.
- Confirmed all Project and RFQ cutover variables are absent from Railway.
- Confirmed GitHub run `30475864702` was blocked before any job step by the
  existing account billing/spending condition.

Changed state:

- Documentation only. No database, Auth, tenant, record, provider variable,
  Vercel deployment, Railway deployment, or live data changed.

Unresolved:

- Dedicated canary requires explicit approval for one unused user-controlled
  email and its confirmation step.
- Root `AGENTS.md` still conflicts with the approved architecture and requires
  explicit owner sign-off before reconciliation.

## 2026-07-30 -- Atomic RFQ quote and terminal workflow

Outcome:

- Replaced independent quote, RFQ-status, and audit writes with one
  server-only transaction service that locks and tenant-scopes the RFQ.
- Added stable BOM-line identity and tenant-scoped UUID submission
  idempotency. Exact retry returns the durable quote; conflicting key reuse
  fails without mutation.
- Removed browser-supplied material authority. Material identity is derived
  from the locked RFQ line and validated against the same tenant.
- Fixed RFQ creation so uncontracted catalog lines retain their material ID
  and every new line persists its canonical BOM-line ID.
- Completion now requires `quotes_received` plus full locked line coverage.
  Cancellation and completion use explicit allowed source states.
- Quote creation, first-quote status change, terminal transition, and their
  audits are atomic. Completion notification is post-commit and cannot
  misreport transaction failure.
- Added four validated tenant-composite quote references, restrictive evidence
  parents, durable submission uniqueness, and a PostgreSQL RFQ state trigger.
- Applied migration `20260729162944_rfq_quote_workflow_integrity.sql` through
  the connected Supabase project `aqqrtkmtcsfkbyyqxowv`.
- Hosted Supabase is healthy and current at 54/54. RFQ and quote counts remain
  zero; four constraints are validated; the state trigger is enabled; browser
  quote mutation privileges remain denied.
- No Vercel deployment was created. Git remains disconnected and the retained
  production deployment remains unchanged.

Changed files:

- `apps/web/src/app/(dashboard)/procurement/rfqs/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.ts`
- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.test.ts`
- `apps/web/src/components/rfq/log-quote-form.tsx`
- `apps/web/src/components/rfq/price-comparison-table.tsx`
- `apps/web/src/lib/procurement/rfq-service.ts`
- `apps/web/src/lib/procurement/rfq-service.test.ts`
- `apps/web/src/lib/procurement/rfq-workflow-service.ts`
- `apps/web/src/lib/procurement/rfq-workflow-service.test.ts`
- `packages/database/src/schema/bom-extras.ts`
- `packages/database/src/__tests__/rfq-quote-workflow-integrity.test.ts`
- `supabase/migrations/20260729162944_rfq_quote_workflow_integrity.sql`
- `docs/research/components/rfq-quote-workflow-integrity.spec.md`
- the six architecture/operations memory files
- `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`

Validation:

- Focused RFQ Web suites -- 26/26 pass.
- RFQ database contract/runtime suites -- 12/12 pass in the zero-skip lane.
- Root lint and full workspace typecheck -- pass.
- Root tests -- 453 application tests pass.
- Nest/Next production build -- pass; Next generated 77/77 static pages.
- Disposable PostgreSQL 17/Redis 7.4.9 lane -- 54/54 migrations, 236/236
  database tests, 1/1 Nest integration, no skips, stable schema fingerprint
  `36B8999F16B825D89D8F782CBF28180D074AD677A9E8B2C16B713C79BB931BB6`.
- Hosted Supabase -- 54/54; head `20260729162944`; no missing/unexpected
  migration; no RFQ/quote row mutation.
- gitleaks 8.30.1, actionlint 1.7.12, pinned action-reference checks,
  `git diff --check`, and prohibited external ERP source/brand scan -- pass.
- Source commit `20d276c0ca0fd11a315ca0c41cdb7d7e903d4a59` is authored
  by `kurtgav <kurtgavin.design@gmail.com>` and is contained in docs head
  `cc5733fa98136c500aa2602b9232a6f9ae34df78`; both GitHub refs match.
- Vercel deployments after retained baseline `1785295180454` -- zero.
- Railway deployment `733f1197-344a-41d9-ad95-af4fda876242` -- SUCCESS on
  docs head `cc5733f`; live `/health` is `ok` and `/ready` reports PostgreSQL
  and Redis `ok`.
- GitHub Actions run `30471712383` -- failed before any step started because
  of the account payment/spending-limit restriction; every dependent job has
  zero executed steps.

Rollback and unresolved:

- Revert application source commit `20d276c` only if necessary.
- Do not remove migration `20260729162944`; correct defects with a reviewed
  forward migration because reversal reopens tenant, replay, evidence, and
  state-machine risks.
- RFQ workflow authority remains transitional Next.js code. Next safe slice is
  an inert, disabled NestJS procurement adapter preserving the same contract.
- Frontend activation still requires one explicitly approved consolidated
  queued Standard Vercel build.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-30 -- Portable self-hosted Web runtime

Outcome:

- Rejected static-only hosting because the application requires dynamic SSR,
  Middleware, Server Actions, route handlers, and request-specific CSP nonces.
- Added opt-in Next standalone output while preserving the default local and
  Vercel-compatible build.
- Added a non-root Node 22 Alpine Dockerfile and provider-neutral release
  revision reporting.
- Added a free self-hosted CI smoke that builds an isolated standalone
  artifact and verifies process health, SSR landing, nonce CSP, robots,
  sitemap, and manifest.
- Kept Vercel Git disconnected. No deployment, DNS, redirect, database,
  Supabase, Railway, or live-traffic change was made.

Changed files:

- `.github/workflows/ci-self-hosted.yml`
- `apps/web/Dockerfile`
- `apps/web/next.config.ts`
- `apps/web/src/app/api/health/route.ts`
- `apps/web/src/app/api/ready/route.ts`
- `apps/web/src/lib/deployment-revision.ts`
- `apps/web/src/lib/deployment-revision.test.ts`
- `scripts/ci/smoke-web-standalone.ps1`
- `docs/DEPLOYMENT.md`
- the six architecture/operations memory files

Validation and constraints:

- Default Next production build passes with 77/77 generated pages.
- Isolated standalone build and runtime smoke pass: health, real SSR landing,
  nonce CSP, robots, sitemap, and manifest.
- Transient self-hosted run `30484376284` passed install, workflow checks,
  lint, typecheck, unit tests, the clean PostgreSQL 17/Redis lane, and the
  production build. Its standalone step built 77/77 pages, then hit a
  Windows deep-path cleanup failure.
- Moved the isolated standalone worktree to the repository drive root, kept
  the verified containment guard, and added bounded cleanup retries. Local
  rerun passes all runtime assertions, removes its worktree, and leaves port
  3090 closed.
- Root lint and typecheck pass.
- Application suites pass: Shared 79/79, API 26/26, Web 276/276; total 381.
- Local database suite remains 99 passed and 137 skipped because this
  source-only slice did not inject disposable database credentials.
- Default production build passes with Nest compilation and Next 77/77 page
  generation.
- Frontend release browser test passes 1/1 in installed Chrome at
  1440/768/390 with interactions, canonical discovery output, no horizontal
  overflow, and zero console/page errors.
- Gitleaks 8.30.1, Actionlint 1.7.12, workflow action-reference checks,
  database release planner 7/7, Project cutover planner 6/6, and diff checks
  pass.
- Vercel deployment inventory remains zero after retained baseline timestamp
  `1785295180454`; Git integration remains disconnected.
- Direct Windows standalone build with pnpm's linked layout reaches 77/77 but
  fails while tracing symlinks with `EPERM`; the committed Windows smoke uses
  an isolated hoisted layout and passes.
- Alpine WSL1 cannot directly execute its current PIE Node binary on the old
  WSL1 kernel. Docker Desktop also cannot start because WSL2 virtualization is
  disabled. No system feature, firmware setting, or reboot was changed.
- The Docker image source is reviewed but not locally image-built. A
  Docker-capable Linux build and image scan remain a pre-cutover gate.
- Rollback is one application commit. No database or provider rollback exists
  because nothing live changed.

## 2026-07-30 -- Host-portable public origin

Outcome:

- Audited current landing source, retained live Vercel output, generated
  desktop/mobile evidence, metadata, structured data, sitemap, robots,
  manifest, interactions, responsive behavior, and console state.
- Confirmed production is older than current source: retained live output
  still exposes decorative ordinals already removed from the source candidate.
- Added one strict public-origin resolver for canonical metadata,
  structured-data IDs, robots, and sitemap output.
- Added alternative-host configuration to both environment examples.
- Removed synthetic sitemap `lastModified`.
- Extended the release browser test across `robots.txt`, `sitemap.xml`, and
  `manifest.webmanifest`.
- No visible UI, database, Railway, Supabase, Vercel setting, or deployment
  changed.

Changed files:

- `.env.example`
- `apps/web/.env.example`
- `apps/web/src/lib/public-origin.ts`
- `apps/web/src/lib/public-origin.test.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/robots.ts`
- `apps/web/src/app/sitemap.ts`
- `apps/web/e2e/frontend-release-local.spec.ts`
- the six architecture/operations memory files

Validation:

- Public-origin unit tests: 8/8 pass.
- Root lint and typecheck: pass.
- Application tests: shared 79/79, API 26/26, Web 273/273.
- Local database lane: 99 passed, 137 skipped because production credentials
  were intentionally absent; no database code or schema changed.
- NestJS and Next.js production build: pass; Next generated 77/77 pages.
- Frontend release browser test: 1/1 pass against installed Chrome at
  1440/768/390, including interactions, no overflow, no console/page errors,
  and SEO endpoint assertions.
- Built output contains the retained canonical origin, a consistent sitemap
  directive, no sitemap `lastmod`, and the expected manifest.
- gitleaks, actionlint, workflow action-reference checks, and diff checks:
  pass.

Rollback and unresolved:

- Revert the isolated source commit. No provider or database rollback exists.
- Live Vercel remains on the retained older landing artifact until an explicit
  consolidated deployment approval.
- Root layout remains dynamically rendered for CSP nonce integrity. Cost
  optimization needs a separate security review.
- M1 canary and root `AGENTS.md` reconciliation still await explicit approval.

## 2026-07-29 -- Cortex directional relationship meaning

Outcome:

- Added explicit outgoing/incoming labels for 15 canonical graph edge types
  plus a fail-safe `Connected` fallback.
- Extended the existing entity response with at most 12 relationship rows
  assembled only from role-filtered neighbors and citations.
- Kept the record authorization gate before neighbor retrieval and preserved
  existing source/type ownership checks and non-enumerating denial.
- Added canonical relationship links, static fallback, origin metadata,
  two-column desktop/tablet layout, and one-column mobile layout.
- Changed no schema, hosted data, Auth, Storage, queue, backend, provider
  setting, or deployment. Vercel Git remained disconnected.

Changed files:

- `apps/web/src/lib/cortex/entity-response.ts`
- `apps/web/src/lib/cortex/entity-response.test.ts`
- `apps/web/src/app/api/cortex/entity/[refTable]/[refId]/route.ts`
- `apps/web/src/app/api/cortex/entity/[refTable]/[refId]/route.test.ts`
- `apps/web/src/components/cortex/cortex-relationship-list.tsx`
- `apps/web/src/components/cortex/cortex-relationship-list.test.tsx`
- `apps/web/src/components/cortex/cortex-entity-panel.tsx`
- `apps/web/src/app/globals.css`
- `docs/research/components/cortex-relationship-list.spec.md`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-cortex-relationship-meaning.md`

Validation:

- Focused response, route, and render suite -- 11/11 pass.
- Root lint and all-package typecheck -- pass.
- Root tests -- 341 pass; 132 writable-database-gated cases skip.
- API and Web production builds -- pass; Web generated 77/77 static steps.
- Local production entity API without session -- 401.
- Built-CSS browser proof at 1440/768/390 -- two/two/one columns, 44px
  targets, visible two-pixel focus, safe ellipsis, and zero overflow.
- Browser console -- zero errors and zero warnings after fresh local load.

Rollback and unresolved:

- Revert this source/documentation milestone; runtime and provider state remain
  unchanged.
- Authenticated populated-record proof remains pending a controlled valid
  identity; invalid demo credentials were not bypassed.
- Live activation requires one explicitly approved consolidated Vercel build.
  Do not create a separate preview or reconnect Git.
- Database integration assertions remain pending a disposable writable target.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex operational record context

Outcome:

- Audited every UUID-backed dashboard detail page. Cortex context existed only
  on Project detail and the graph workspace.
- Added one exact route resolver for 16 CRM, finance, procurement, inventory,
  claims, variation, punchlist, and warranty detail surfaces.
- Injected one shared Cortex panel from the authenticated dashboard layout.
- Excluded Project detail and every collection, create, edit, print, portal,
  malformed, and unsupported path.
- Preserved path RBAC, tenant derivation, current-role node scope, and
  non-enumerating entity denial.
- Corrected cash-transaction citations to open exact detail records.
- Changed no schema, hosted data, Auth, Storage, queue, provider setting, or
  deployment.

Changed files:

- `apps/web/src/lib/cortex/record-route.ts`
- `apps/web/src/lib/cortex/record-route.test.ts`
- `apps/web/src/components/cortex/cortex-route-context.tsx`
- `apps/web/src/components/cortex/cortex-route-context.test.tsx`
- `apps/web/src/app/(dashboard)/layout.tsx`
- `apps/web/src/lib/cortex/entity-registry.ts`
- `apps/web/src/lib/cortex/entity-registry.test.ts`
- `apps/web/src/app/globals.css`
- `docs/research/components/cortex-record-context.spec.md`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-cortex-operational-record-context.md`

Validation:

- Focused route, render, registry, RBAC, and entity API suite -- 55/55 pass.
- Root lint and all-package typecheck -- pass.
- Root tests -- 334 pass; 132 writable-database-gated cases skip.
- API and Web production builds -- pass; Web generated 77/77 static steps.
- Local production -- health 200, readiness 200, unauthenticated record route
  redirects to login, direct Cortex entity request returns 401.
- Browser proof at 1440/768/390 -- 32/32/44px targets, visible focus, 24px
  panel separation, and zero horizontal overflow.

Rollback and unresolved:

- Revert this source/documentation milestone; runtime and provider state remain
  unchanged.
- Live activation requires the one explicitly approved consolidated Vercel
  build. Do not create a separate preview or reconnect Git.
- Authenticated live role-by-role proof remains pending that approved build and
  controlled canary identities.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Document mutation authority hardening

Outcome:

- Verified upload sign, upload complete, and document delete authenticated
  users but did not enforce explicit mutation capability.
- Added `document.manage` for operational roles and kept `viewer` read-only.
- Added 403 denial before Project, quota, Storage, database, parser, AI, or
  queue work for callers without capability.
- Added actor- and tenant-scoped audit for signed URL issuance.
- Made document creation and its audit entry one PostgreSQL transaction.
- Rebuilt document deletion as one locked, tenant-and-Project-bound
  transaction covering derived scope rows, document row, and audit append.
- Moved best-effort Storage deletion after successful official transaction.
- Removed trust in caller Project ID for cache invalidation by using the
  Project loaded from the deleted record.
- Changed no React/UI design, schema, hosted data, Auth identity, Storage
  object, queue, provider setting, or deployment.

Changed files:

- `packages/auth/src/server.ts`
- `apps/web/src/lib/audit.ts`
- `apps/web/src/lib/document-capability.test.ts`
- `apps/web/src/app/api/upload/sign/route.ts`
- `apps/web/src/app/api/upload/sign/route.test.ts`
- `apps/web/src/app/api/upload/complete/route.ts`
- `apps/web/src/app/api/upload/complete/route.test.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/documents/actions.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/documents/actions.test.ts`
- `docs/architecture/M2_DOCUMENT_PROCESSING_EVIDENCE_CONTRACT.md`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-document-mutation-authority.md`

Validation:

- Focused capability, sign, complete, and delete tests -- 26/26 pass.
- Operational capability matrix and `viewer` denial -- pass.
- Missing capability denial before side effects -- pass.
- Audit-failure fail-closed and Storage-after-commit ordering -- pass.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` -- pass.
- Root tests -- 278 pass; 132 disposable-database-gated cases skip as
  designed because this source slice did not inject a writable database.
- Optimized Web build -- 77/77 routes generated.
- Gitleaks 8.30.1 full-history scan -- no leaks.
- Prohibited provenance and diff-hygiene checks -- pass.

Rollback and unresolved:

- Revert this source/documentation milestone; runtime and provider state remain
  unchanged.
- Live protection requires one explicitly approved consolidated Vercel build.
- M2 composite constraints, database audit triggers, durable processing
  evidence, and Nest transaction authority remain required.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex canonical entity registry

Outcome:

- Reconciled the 48-value Cortex node enum with graph RBAC, display metadata,
  entity sources, and record navigation.
- Replaced independent partial maps with one typed registry.
- Kept four reserved enum types with no UUID-backed mirror table explicitly
  non-queryable instead of inventing unsupported sources.
- Added direct record links for active and newer finance/inventory entities,
  with safe list or Project fallbacks where no detail surface exists.
- Made the entity endpoint reject unregistered sources, cross-type source
  pairing, and forbidden types before context retrieval.
- Reused canonical labels in citation chips.
- Changed no schema, hosted data, Auth, Storage, queue, provider setting, or
  deployment.

Changed files:

- `apps/web/src/lib/cortex/entity-registry.ts`
- `apps/web/src/lib/cortex/entity-registry.test.ts`
- `apps/web/src/lib/cortex/href.ts`
- `apps/web/src/lib/cortex/rbac.ts`
- `apps/web/src/lib/cortex/rbac.test.ts`
- `apps/web/src/app/api/cortex/entity/[refTable]/[refId]/route.ts`
- `apps/web/src/app/api/cortex/entity/[refTable]/[refId]/route.test.ts`
- `apps/web/src/components/cortex/cortex-entity-panel.tsx`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-cortex-entity-registry.md`

Validation:

- Focused registry, RBAC, and entity-route suite -- 24/24 pass.
- Root lint and all-package typecheck -- pass.
- Root tests -- 296 pass; 132 disposable-database-gated cases skip because no
  writable database target was injected.
- Optimized production build -- pass; 77/77 static-generation steps.
- Local production smoke -- health 200, readiness 200, unauthenticated
  finance entity lookup 401.
- Gitleaks 8.30.1 full-history scan and prohibited-provenance scan -- clean.
- Hosted read-only inventory -- 48 enum types; 385 current nodes across 14
  active types.

Rollback and unresolved:

- Revert this source/documentation milestone; runtime and provider state remain
  unchanged.
- Live activation requires the single explicitly approved consolidated Vercel
  build. Do not create a separate preview or reconnect Git.
- Database Cortex authorization remains authoritative and must be updated with
  any future enum/mirror addition.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex grounded citation navigation

Outcome:

- Preserved the exact plain-text Cortex response body and added a bounded
  citation response header for immediate source links.
- Added one shared citation renderer using canonical registry labels and
  record routes.
- Rehydrated saved citation node IDs from current tenant-scoped graph data
  under the viewer's current role.
- Removed trust in stored titles, references, Project IDs, and routes.
- Omitted malformed, stale, superseded, cross-tenant, and forbidden records.
- Added visible focus behavior and 44px mobile citation targets.
- Changed no schema, hosted data, Auth, Storage, queue, or provider setting.
  Vercel Git remained disconnected.
- Source publication triggered one Railway API build because
  `packages/database` is in the service watch set. Deployment
  `2991586f-070e-470a-add0-56ce264b74e8` built the NestJS Dockerfile, passed
  healthcheck, and replaced the prior healthy API artifact.
- Vercel recorded zero deployments; the Next.js citation UI remains
  source-only.

Changed files:

- `packages/database/src/cortex/graph.ts`
- `packages/database/src/cortex/retrieve.ts`
- `packages/database/src/__tests__/cortex-substrate.test.ts`
- `apps/web/src/lib/cortex/citation-header.ts`
- `apps/web/src/lib/cortex/citation-header.test.ts`
- `apps/web/src/app/api/cortex/chat/route.ts`
- `apps/web/src/app/api/cortex/chat/route.test.ts`
- `apps/web/src/app/api/cortex/conversations/[id]/route.ts`
- `apps/web/src/app/api/cortex/conversations/[id]/route.test.ts`
- `apps/web/src/components/cortex/cortex-citation-list.tsx`
- `apps/web/src/components/cortex/cortex-agent.tsx`
- `apps/web/src/components/cortex/cortex-entity-panel.tsx`
- `apps/web/src/app/globals.css`
- `docs/research/components/cortex-citations.spec.md`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-cortex-citation-navigation.md`

Validation:

- Focused citation, chat, conversation, entity, RBAC, and registry tests --
  32/32 pass.
- Root lint and all-package typecheck -- pass.
- Root tests -- 303 pass; 132 database-gated cases skip because this
  source-only slice did not inject a writable database.
- Optimized production build -- pass; 77/77 static-generation steps.
- Local production smoke -- health 200, readiness 200, unauthenticated entity
  lookup 401, unauthenticated chat POST 401.
- Browser CSS proof -- visible desktop focus, exact 44px targets at 390px, no
  horizontal overflow.
- Railway deployment logs -- Nest build and startup pass; `/health` 200;
  `/ready` 200 with PostgreSQL and Redis `ok`.
- Live Vercel remained on revision `f24e5603a355`; health and readiness 200.

Rollback and unresolved:

- For backend rollback, redeploy retained Railway artifact
  `f480586e-fe8d-4214-a33e-7bfdaaa5f38c` only if the new health/readiness or
  API compatibility checks regress. Current deployment is healthy.
- Live activation requires the single explicitly approved consolidated Vercel
  build. Do not create a separate preview or reconnect Git.
- The database integration assertions remain pending a disposable writable
  target; hosted production was not mutated for this slice.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex evidence trail

Outcome:

- Verified hosted Cortex has 637 node-provenance events across every one of
  385 current nodes; each current node has one to three events.
- Added server normalization for mutation, document, AI-run, import, and
  unknown provenance origins.
- Returned at most six safe evidence events after existing tenant/source/type/
  role authorization.
- Prevented actor ID, internal origin reference, hashes, sequence, tenant ID,
  and subject ID from reaching browser response.
- Added a collapsed native evidence disclosure with safe explanations, UTC
  timestamps, 44px target, visible focus, and reduced-motion handling.
- Changed no schema, hosted data, Auth, Storage, queue, backend, provider
  setting, or deployment. Hosted Supabase inspection was aggregate read-only.

Changed files:

- `apps/web/src/lib/cortex/entity-response.ts`
- `apps/web/src/lib/cortex/entity-response.test.ts`
- `apps/web/src/app/api/cortex/entity/[refTable]/[refId]/route.ts`
- `apps/web/src/app/api/cortex/entity/[refTable]/[refId]/route.test.ts`
- `apps/web/src/components/cortex/cortex-evidence-trail.tsx`
- `apps/web/src/components/cortex/cortex-evidence-trail.test.tsx`
- `apps/web/src/components/cortex/cortex-entity-panel.tsx`
- `apps/web/src/app/globals.css`
- `docs/research/components/cortex-evidence-trail.spec.md`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-cortex-evidence-trail.md`

Validation:

- Focused evidence, response, and entity route suite -- 17/17 pass.
- Root lint and all-package typecheck -- pass.
- Root tests -- 350 pass; 132 writable-database-gated cases skip.
- API and Web production builds -- pass; Web generated 77/77 static steps.
- Hosted aggregate queries -- 637 node events; 385/385 current nodes covered;
  one to three events per node.
- Local production unauthenticated entity lookup -- expected 401.
- Built-CSS browser proof at 1440/768/390 -- native disclosure, 44px target,
  visible focus, readable UTC timeline, reduced indicator geometry, and zero
  page/detail overflow.
- Browser UI console -- clean before the intentional 401 resource request.

Rollback and unresolved:

- Revert this source/documentation milestone; runtime and provider state remain
  unchanged.
- Authenticated populated-record proof remains pending a controlled valid
  identity; authorization was not bypassed.
- Live activation requires one explicitly approved consolidated Vercel build.
  Do not create a separate preview or reconnect Git.
- GitHub-hosted CI remains externally blocked before job start by account
  payment/spending status. Local full gates are the no-cost verification path.
- Database integration assertions remain pending a disposable writable target.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex focused neighborhood

Outcome:

- Added an `Open focused graph` backlink to authorized operational record
  context.
- Preserved the existing whole-graph API when no focus is supplied.
- Added complete-pair validation for canonical source table plus UUID.
- Reauthorized authenticated tenant, source/type ownership, and current-role
  access before focused retrieval; missing, mismatched, and forbidden records
  return the same 404.
- Added a bounded database helper returning the focus plus one visible hop.
  Focus, edges, and joined neighbors all have explicit tenant and current-row
  predicates.
- Added server-derived focus identity, automatic drawer selection, persistent
  highlight, visible-canvas centering, truthful bounded-count wording, and
  clear-focus behavior.
- Browser QA found and fixed Cortex grid intrinsic-width overflow plus the
  existing tablet topbar and mobile fixed-sidebar overflow.
- Tablet/mobile now flow the drawer below the graph; narrow screens use a 64px
  icon navigation rail with accessible link names retained.
- No schema, business row, password, Storage object, queue, or provider setting
  changed. The gated E2E generated and consumed one-time test sessions and
  globally revoked them after verification.

Changed files:

- `packages/database/src/cortex/graph.ts`
- `apps/web/src/app/api/cortex/graph/route.ts`
- `apps/web/src/app/api/cortex/graph/route.test.ts`
- `apps/web/src/app/(dashboard)/cortex/page.tsx`
- `apps/web/src/components/cortex/cortex-entity-panel.tsx`
- `apps/web/src/components/cortex/cortex-graph-view.tsx`
- `apps/web/src/components/cortex/cortex-graph-canvas.tsx`
- `apps/web/src/components/nav/topbar.tsx`
- `apps/web/src/components/nav/profile-menu.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/e2e/cortex-focused-local.spec.ts`
- the six architecture/operations memory files
- `docs/changesets/2026-07-29-cortex-focused-neighborhood.md`

Validation:

- Focused graph route suite -- 6/6 pass.
- Root lint and all-package typecheck -- pass.
- Root tests -- 356 pass; 132 writable-database-gated cases skip because no
  disposable `DATABASE_URL` was injected.
- API and Web optimized production build -- pass; Web generated 77/77 static
  steps.
- Hosted Supabase read-only evidence -- selected current Project has 78 direct
  graph edges; no schema or business row changed.
- Authenticated production-build E2E -- real Project backlink, invalid focus
  400, authorized focused response 200, exact focus present, at most 81 nodes
  and 80 links, loaded record drawer, clear-focus compatibility, and global
  test-session revocation all pass.
- Browser screenshots at 1440/768/390 -- zero horizontal overflow; focused
  canvas, responsive drawer, topbar, and mobile icon rail visually reviewed.
- Browser console and page errors -- zero.
- Gitleaks 8.30.1, actionlint 1.7.12, diff check, and repository-wide
  prohibited external ERP source/brand scan -- clean.
- Vercel provider check -- latest deployment remains
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`; zero new deployments from this work.
- GitHub publication -- commit
  `5ed6984d789dcc62bffc6a61f2e16fe759e281b7` reached both
  `agent-02/third-code-erp-landing` and `main` under
  `kurtgav <kurtgavin.design@gmail.com>`.
- GitHub Actions run `30447346925` -- failed before any step started. The
  annotation reports recent account payments failed or the spending limit must
  be increased. All dependent jobs skipped; no code failure was observed.
- Railway deployment `dd9f0f50-e8bd-4411-a49b-ffea0984030a` -- `SUCCESS` for
  exact commit `5ed6984d789dcc62bffc6a61f2e16fe759e281b7`; live
  `/health` 200 and `/ready` 200 with PostgreSQL and Redis `ok`.

Rollback and unresolved:

- Revert this source/documentation milestone. A revert touching
  `packages/database` will create one Railway rollback build; verify live
  health/readiness and exact revision. No schema or provider-configuration
  rollback is required.
- Live activation requires one explicitly approved consolidated Vercel build.
  Do not create a preview, reconnect Git, or spend provider credit.
- Destructive database integration remains pending a disposable writable
  target.
- Durable conversation focus metadata remains required before record-scoped
  Cortex chat can be honest across saved follow-ups.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Durable Cortex conversation record context

Outcome:

- Added one optional immutable canonical source-table and UUID pair to saved
  Cortex conversations.
- Added tenant-, source/type-, and current-role authorization before creating,
  listing, loading, or replying in a record-scoped conversation.
- Added non-enumerating denial for missing, mismatched, revoked, and forbidden
  context, plus 409 denial for client attempts to switch an existing
  conversation to another record.
- Grounded the model prompt and deterministic fallback in the authorized
  focused record.
- Preserved existing unscoped conversations and the plain-text chat response.
- Removed authenticated browser write authority from Cortex conversations and
  messages. Official writes remain server-side.
- Applied hosted migration
  `20260729115110_cortex_conversation_record_context.sql` to Supabase project
  `aqqrtkmtcsfkbyyqxowv`. Hosted ledger is 51/51; ten existing conversations
  remain and zero have an incomplete context pair.
- No UI presentation changed. Vercel Git remains disconnected; no Vercel
  deployment or spend occurred.

Changed files:

- `apps/web/src/app/api/cortex/chat/route.ts`
- `apps/web/src/app/api/cortex/chat/route.test.ts`
- `apps/web/src/app/api/cortex/conversations/route.ts`
- `apps/web/src/app/api/cortex/conversations/route.test.ts`
- `apps/web/src/app/api/cortex/conversations/[id]/route.ts`
- `apps/web/src/app/api/cortex/conversations/[id]/route.test.ts`
- `apps/web/src/lib/cortex/record-context.ts`
- `apps/web/src/lib/cortex/record-context.test.ts`
- `packages/database/src/schema/cortex-chat.ts`
- `packages/database/src/cortex/chat-store.ts`
- `packages/database/src/__tests__/cortex-conversation-context.test.ts`
- `packages/database/src/__tests__/cortex-cost-security-hardening.test.ts`
- `scripts/verify-database-repro.mjs`
- `supabase/migrations/20260729115110_cortex_conversation_record_context.sql`
- the six architecture/operations memory files

Validation:

- Focused Web API/context tests -- 16/16 pass.
- Root lint and typecheck -- pass.
- Root tests -- 369 pass; 134 writable-database cases skip unless an explicit
  disposable URL is injected.
- Root production build -- pass; Nest webpack build passes and Next generates
  77/77 static steps.
- Disposable PostgreSQL 17/Redis 7.4.9 lane -- 51/51 migrations, catalog
  verifier pass, 224/224 database tests with zero skips, Nest database
  integration pass, and unchanged schema fingerprint
  `C89987BD5B4E7DAA2F53DDD0036FBE3614D385844078453B052E992516935260`.
- Runtime database assertions -- complete context pair accepted, half pair
  rejected, and authenticated direct conversation insert rejected.
- Hosted catalog -- pair constraint validated; zero authenticated Cortex chat
  write policies, table grants, or column grants.
- Supabase advisors -- no new Cortex security finding. Existing security and
  performance findings remain separately tracked.
- Gitleaks 8.30.1, Actionlint 1.7.12, diff check, and prohibited external ERP
  source/brand scan -- clean.
- GitHub publication -- source commit
  `e948223b261b7c335ceaad85e359fec68888e84a` reached both
  `agent-02/third-code-erp-landing` and `main` under
  `kurtgav <kurtgavin.design@gmail.com>`.
- Railway deployment `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` -- `SUCCESS`
  for that exact commit; live `/health` and `/ready` return 200 with PostgreSQL
  and Redis `ok`.
- GitHub Actions run `30449560735` -- failed before any step started. The
  annotation reports recent account payments failed or the spending limit must
  be increased; all dependent jobs skipped.
- Vercel provider check -- zero deployments after retained production
  deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.

Rollback and unresolved:

- Application rollback is a source revert. The nullable hosted columns and
  server-only write privileges remain backward compatible with the retained
  frontend.
- Database rollback requires a reviewed compensating forward migration; never
  edit or delete applied migration history.
- `CortexAgent` does not yet send or display durable record context. That UI
  wiring is the exact next product slice.
- A missing leading index for the pre-existing
  `cortex_conversations.user_id` foreign key and other advisor findings remain
  outside this milestone.
- GitHub Actions remains blocked before runner start by account billing.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex conversation-context presentation

Outcome:

- Authorized URL focus now reaches Cortex chat through a server-derived record
  context rather than raw browser trust.
- Added persistent `Focused on`, `Company-wide`, and fail-closed
  `Record unavailable` states.
- Added record-specific suggestions and included the canonical pair in chat
  requests.
- Added scope labels to saved conversations. Exact matching context restores
  in place; other scopes navigate explicitly instead of switching silently.
- Added 44px mobile targets for Cortex header, suggestions, and composer.
- No database, hosted row, Auth user, Storage object, queue, provider setting,
  or deployment changed.

Changed files:

- `apps/web/src/app/(dashboard)/cortex/page.tsx`
- `apps/web/src/components/cortex/cortex-agent.tsx`
- `apps/web/src/components/cortex/cortex-agent.test.tsx`
- `apps/web/src/lib/cortex/agent-context.ts`
- `apps/web/src/lib/cortex/agent-context.test.ts`
- `apps/web/src/app/globals.css`
- `apps/web/e2e/cortex-focused-local.spec.ts`
- the six architecture/operations memory files

Validation:

- TDD red -- missing context helper and absent focus presentation.
- Focused context/component/API suites -- 22/22 pass.
- Root lint and typecheck -- pass.
- Root tests -- 375 pass; 134 disposable-database cases skip in the ordinary
  no-URL lane and remain covered by the preceding 224/224 zero-skip database
  release gate.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Authenticated local production-browser E2E -- pass using installed Chrome;
  exact Project focus, record-specific suggestions, company-wide restoration,
  1440/768/390 screenshots, zero overflow, zero console/page errors, and
  global one-time-session revocation.

Rollback and unresolved:

- Revert this source/documentation slice. The database/API context boundary
  remains compatible; no hosted or provider rollback is required.
- Live activation still requires one explicitly approved consolidated Vercel
  production build. Do not reconnect Git or create a preview.
- GitHub-hosted CI remains blocked before step start by account billing.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex saved-conversation deep links

Outcome:

- Added optional UUID `conversationId` parsing to the Cortex page.
- Added automatic saved-thread restore through the existing authorized detail
  API.
- Added URL synchronization after conversation create, history load, direct
  restore, and new-chat reset.
- Added latest-request-wins restore handling so a stale response cannot
  overwrite a newer selection or a cleared chat.
- Preserved canonical `refTable`/`refId` focus while adding or removing
  conversation identity.
- Added target conversation IDs to cross-context history links, reducing
  restore to one explicit navigation.
- No hosted write, AI request, schema, Auth identity, Storage object, queue,
  provider setting, or deployment changed.

Changed files:

- `apps/web/src/app/(dashboard)/cortex/page.tsx`
- `apps/web/src/components/cortex/cortex-agent.tsx`
- `apps/web/src/lib/cortex/agent-context.ts`
- `apps/web/src/lib/cortex/agent-context.test.ts`
- `apps/web/e2e/cortex-focused-local.spec.ts`
- the six architecture/operations memory files

Validation:

- TDD red -- context URL omitted conversation identity and URL synchronization
  helper did not exist.
- Context helper/component tests -- 7/7 pass.
- Root lint and typecheck -- pass.
- Root tests -- 376 pass; 134 disposable-database cases skip in the ordinary
  no-URL lane and remain covered by the 224/224 zero-skip release gate.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Authenticated local production E2E -- real Project focus authorization,
  deterministic intercepted company-wide conversation restore, two restored
  messages, stable deep-link URL, new-chat URL cleanup, responsive screenshots,
  zero overflow, zero console/page errors, and global test-session revocation.
- Hosted database writes and AI calls during deep-link proof -- zero.

Rollback and unresolved:

- Revert this source/documentation slice. Existing durable context and history
  remain functional; no hosted or provider rollback is required.
- Live activation still requires one explicitly approved consolidated Vercel
  production build. Do not reconnect Git or create a preview.
- GitHub-hosted CI remains blocked before step start by account billing.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cortex recent-conversation search

Outcome:

- Added keyboard-first search to the existing bounded list of 30 authorized
  recent chats; no API or database history expansion.
- Added case- and diacritic-insensitive all-term matching across conversation
  title and human record-scope label while preserving server order.
- Added an honest recent-count label, accessible clear control, and bounded
  no-results state.
- Kept tenant, user, record UUID, and graph-node identifiers out of searchable
  and visible text.
- No hosted write, AI request, schema, Auth identity, Storage object, queue,
  provider setting, or deployment changed.

Changed files:

- `apps/web/src/lib/cortex/agent-context.ts`
- `apps/web/src/lib/cortex/agent-context.test.ts`
- `apps/web/src/components/cortex/cortex-agent.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/e2e/cortex-focused-local.spec.ts`
- the six architecture/operations memory files

Validation:

- Focused helper/component tests -- 8/8 pass.
- Root lint and typecheck -- pass.
- Root tests -- 377 pass; 134 disposable-database cases skip in the ordinary
  no-URL lane and remain covered by the 224/224 zero-skip release gate.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Authenticated local production E2E -- title-plus-record filter, clear/reset,
  company-wide deep-link restore, mobile panel screenshot, 1440/768/390
  responsive proof, zero overflow, zero console/page errors, and global
  one-time-session revocation.
- Vercel provider check -- zero deployments after retained READY production
  baseline `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- Railway provider check -- active API remains successful deployment
  `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` at source
  `e948223b261b7c335ceaad85e359fec68888e84a`.
- Source commit `b15c24201326a51db021c4cfd6e57c14923c71e9` -- pushed to
  both `main` and `agent-02/third-code-erp-landing` under
  `kurtgav <kurtgavin.design@gmail.com>`.
- Railway deployment event `4b8183fe-bbdb-471f-9e68-c08a0d7e401f` --
  `SKIPPED`, exact source SHA, `No changes to watched files`.
- GitHub Actions run `30453629029` -- failed before any step started because
  the account reports failed payments or an exceeded spending limit; all
  dependent jobs skipped.

Rollback and unresolved:

- Revert this source/documentation slice. Existing API, context, deep links,
  database, and provider state remain functional.
- Live activation still requires one explicitly approved consolidated Vercel
  production build. Do not reconnect Git or create a preview.
- GitHub-hosted CI remains blocked before step start by account billing.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Cost-controlled frontend release candidate

Outcome:

- Disconnected Vercel Git remained verified.
- Disabled on-demand concurrent builds and selected Standard 4 vCPU/8 GB.
- Inventoried the complete frontend delta against retained production:
  31 commits, 64 Web files, 39 runtime files, and 25 test/E2E files.
- Found a cross-auth-state rate-limit defect through combined browser QA.
- Isolated anonymous IP buckets from authenticated user buckets.
- Added a reusable release E2E covering landing response, SEO/GEO metadata,
  JSON-LD, interactions, responsive layout, mobile targets, and errors.
- Prepared one-build production validation and instant-rollback instructions.
- Did not create a Vercel deployment, preview, Railway deployment, database
  migration, hosted row, Auth identity, Storage object, queue job, or AI call.

Changed files:

- `apps/web/src/middleware.ts`
- `apps/web/src/lib/request-rate-limit.ts`
- `apps/web/src/lib/request-rate-limit.test.ts`
- `apps/web/e2e/frontend-release-local.spec.ts`
- `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`
- the six architecture/operations memory files

Validation:

- Root lint and typecheck -- pass.
- Root tests -- 379 application tests pass.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Combined Cortex and public landing browser E2E -- 2/2 pass sequentially.
- Landing visual QA -- 1440, 768, and 390; zero horizontal overflow, console
  errors, and page errors.
- gitleaks 8.30.1 -- pass; no leaks.
- actionlint 1.7.12 and `git diff --check` -- pass.
- Prohibited external ERP brand/source scan -- zero matches.
- Source commit `e53f20d63eb937440c2b29c88c920a543a49a3ef` -- pushed to
  both repository refs under `kurtgav <kurtgavin.design@gmail.com>`.
- Railway API -- remains successful deployment
  `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` at backend source
  `e948223b261b7c335ceaad85e359fec68888e84a`.
- Vercel -- zero deployments after retained READY deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- GitHub Actions run `30455237294` -- zero executed steps; account
  billing/spending block remains external.

Rollback and unresolved:

- Source rollback is a revert of `e53f20d`; no provider rollback is needed
  because the candidate is not deployed.
- If the candidate is later activated and fails verification, use Vercel
  Instant Rollback to `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- Production activation requires explicit approval for one manual queued
  Standard build.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Permission-aware dashboard

Outcome:

- Found that every role could load `/dashboard` while the page always executed
  executive pipeline, GP, forecast, rep-scorecard, and alert queries.
- Added a tested role-mode selector backed by the canonical
  `/pipeline/board` permission.
- Made loader selection occur before query invocation.
- Preserved the full executive dashboard for authorized roles.
- Added a calm Today surface for restricted roles with tenant- and
  assignee-scoped pending task counts.
- Derived quick links from the canonical navigation registry so forbidden
  workspaces cannot appear.
- Added an auditable original component specification and gated one-time-link
  browser coverage.
- No database migration, hosted row, role, password, Auth identity, Storage
  object, queue job, AI call, Railway deployment, or Vercel deployment changed.

Changed files:

- `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- `apps/web/src/lib/dashboard-queries.ts`
- `apps/web/src/lib/dashboard-access.ts`
- `apps/web/src/lib/dashboard-access.test.ts`
- `apps/web/src/components/dashboard/role-work-dashboard.tsx`
- `apps/web/src/components/dashboard/role-work-dashboard.module.css`
- `apps/web/src/components/dashboard/role-work-dashboard.test.tsx`
- `apps/web/e2e/dashboard-role-local.spec.ts`
- `docs/research/components/role-work-dashboard.spec.md`
- the six architecture/operations memory files
- `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`

Validation:

- Role matrix and loader/component suites -- 17/17 pass.
- Root lint and typecheck -- pass.
- Root tests -- 396 application tests pass; ordinary no-URL database lane
  remains 90 pass and 134 skipped, covered by the retained 224/224 zero-skip
  PostgreSQL 17 release gate.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Authenticated viewer local production E2E -- pass at 1440, 768, and 390;
  only assignee-scoped work and permitted links, no executive metrics or
  Finance/Pipeline links, zero overflow, zero console/page errors.
- One-time viewer session -- globally revoked after QA.
- gitleaks 8.30.1, actionlint 1.7.12, diff checks, and prohibited external ERP
  brand/source scan -- pass.
- Source commit `36e618274769ef49a18974dbe3bed8f0b4db7edd` -- pushed to
  both repository refs under `kurtgav <kurtgavin.design@gmail.com>`.
- Railway API -- remains successful deployment
  `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` at backend source
  `e948223b261b7c335ceaad85e359fec68888e84a`.
- Vercel -- zero deployments after retained READY deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- GitHub Actions run `30456997160` -- zero executed steps; account
  billing/spending block remains external.

Rollback and unresolved:

- Revert source commit `36e6182`; no provider rollback is needed because the
  candidate is not deployed.
- Live activation still requires one explicitly approved consolidated queued
  Standard Vercel build.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Permission-safe universal search

Outcome:

- Confirmed the search API already filtered record types by canonical route
  permissions and tenant-scoped every base record.
- Closed the remaining raw-backslash `ILIKE` escape gap while preserving
  literal `%` and `_` matching.
- Added authenticated-tenant predicates to opportunity-account and BOM-project
  joins.
- Added explicit private/no-store and Cookie-vary headers to success,
  short-query, and unauthorized responses.
- Preserved viewer scope: tenant documents plus authenticated-assignee tasks
  only.
- Extended the existing one-time-link viewer browser gate with real normal
  search, literal wildcard probe, cache headers, allowed result types, and
  command-palette rendering.
- No database migration, hosted row, role, password, Auth identity, Storage
  object, queue job, AI call, Railway build, or Vercel deployment changed.

Changed files:

- `apps/web/src/app/api/search/search-policy.ts`
- `apps/web/src/app/api/search/route.ts`
- `apps/web/src/app/api/search/route.test.ts`
- `apps/web/e2e/dashboard-role-local.spec.ts`
- the six architecture/operations memory files
- `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`

Validation:

- Focused universal-search suite -- 11/11 pass.
- Root lint and typecheck -- pass.
- Root tests -- 399 application tests pass; ordinary no-URL database lane
  remains 90 pass and 134 skipped, covered by the retained 224/224 zero-skip
  PostgreSQL 17 release gate.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Authenticated viewer local E2E -- pass with a real tenant document, only
  document/task result types, a zero-hit literal `%`, `_`, and backslash probe,
  private/no-store headers, Cookie variation, command-palette result, 1440,
  768, and 390 dashboard layouts, zero overflow, and zero console/page errors.
- One-time viewer session -- globally revoked after every completed QA run.
- gitleaks 8.30.1, actionlint 1.7.12, diff checks, and prohibited external ERP
  brand/source scan -- pass.
- Source commit `8dc051e70d56cf3f0cde9c2f409c4f97928d337d` -- pushed to
  both repository refs under `kurtgav <kurtgavin.design@gmail.com>`.
- Railway correctly skipped deployment
  `37ee8021-9037-4f4c-b0d9-cf9219699c25` because no watched backend file
  changed. Active API remains successful deployment
  `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` at source
  `e948223b261b7c335ceaad85e359fec68888e84a`.
- Vercel -- zero deployments after retained READY deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- GitHub Actions run `30460436767` -- zero executed steps; account
  billing/spending block remains external.

Rollback and unresolved:

- Revert source commit `8dc051e`; no provider rollback is needed because the
  candidate is not deployed.
- Live activation still requires one explicitly approved consolidated queued
  Standard Vercel build.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Private Search-to-Cortex handoff

Outcome:

- Added explicit `Search records` and `Ask Cortex` command-palette modes while
  preserving record search as the default.
- Prevented Ask mode from issuing `/api/search` requests.
- Added opaque UUID handoff state in same-tab `sessionStorage`, bounded to 100
  normalized characters, five minutes, and one consume.
- Restricted server acceptance to company-wide Cortex without record focus or
  saved-conversation identity.
- Prefilled and focused the Cortex composer, removed the draft and temporary
  route marker, and proved no automatic AI request occurs.
- Added original component specification, selection/draft unit coverage, and
  authenticated responsive browser coverage.
- No database migration, hosted row, role, password, Auth identity, Storage
  object, queue job, AI call, Railway build, or Vercel deployment changed.

Changed files:

- `apps/web/src/components/nav/command-palette.tsx`
- `apps/web/src/components/nav/command-palette-selection.ts`
- `apps/web/src/components/nav/command-palette-selection.test.ts`
- `apps/web/src/lib/cortex/draft-handoff.ts`
- `apps/web/src/lib/cortex/draft-handoff.test.ts`
- `apps/web/src/app/(dashboard)/cortex/page.tsx`
- `apps/web/src/components/cortex/cortex-agent.tsx`
- `apps/web/e2e/dashboard-role-local.spec.ts`
- `docs/research/components/search-cortex-handoff.spec.md`
- the six architecture/operations memory files
- `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`

Validation:

- Focused draft/selection/Cortex suites -- 12/12 pass; existing search route
  suite remains 11/11.
- Root lint and typecheck -- pass.
- Root tests -- 408 application tests pass; ordinary no-URL database lane
  remains 90 pass and 134 skipped, covered by the retained 224/224 zero-skip
  PostgreSQL 17 release gate.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Authenticated viewer local E2E -- pass with real authorized document search,
  explicit Ask mode, zero question-bearing search request, exact composer
  prefill/focus, zero chat request, prompt-free final URL, removed draft
  storage, 1440/768/390 layouts, and zero overflow or console/page errors.
- One-time viewer session -- globally revoked after QA.
- Desktop and mobile screenshots -- visually reviewed; clean hierarchy,
  readable action, and no overflow.
- gitleaks 8.30.1, actionlint 1.7.12, diff checks, and prohibited external ERP
  brand/source scan -- pass.
- Source commit `8058c8a5db18828656fc182939dce7aa06c698af` -- pushed to
  both repository refs under `kurtgav <kurtgavin.design@gmail.com>`.
- Railway correctly skipped deployment
  `e2c6d6a8-82cb-4f19-996f-b67518b9d949` because no watched backend file
  changed. Active API remains successful deployment
  `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` at source
  `e948223b261b7c335ceaad85e359fec68888e84a`.
- Vercel -- Git remains disconnected and zero deployments exist after retained
  READY deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- GitHub Actions run `30462707850` -- all jobs contain zero executed steps;
  account billing/spending block remains external.

Rollback and unresolved:

- Revert source commit `8058c8a`; no provider rollback is needed because the
  candidate is not deployed.
- Live activation still requires one explicitly approved consolidated queued
  Standard Vercel build.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Atomic public canvas signing

Outcome:

- Found that public signing used zero UUID as audit actor, ignored the audit
  foreign-key failure, and committed document/session/source writes
  independently.
- Added 512 KiB PNG bounds, base64 and PNG-signature validation, trimmed
  bounded signer identity, strict canvas-token shape, and random Storage keys.
- Added a second signed/revoked/expired check under a row lock.
- Moved document creation, tenant-scoped source transition, session stamp, and
  nullable-actor entity audit into one database transaction.
- Added compensating Storage deletion for database, audit, or concurrent-replay
  failure.
- Preserved public URL, visible form, token-hash model, invalid-token state, and
  successful `{ ok: true }` response.
- No database migration, hosted row, role, password, Auth identity, durable
  business row, Storage object, queue job, AI call, Railway build, or Vercel
  deployment changed during validation.

Changed files:

- `apps/web/src/app/portal/sign/[token]/actions.ts`
- `apps/web/src/app/portal/sign/[token]/actions.test.ts`
- `docs/research/components/public-canvas-signing.spec.md`
- the six architecture/operations memory files
- `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`

Validation:

- Focused public-signing integrity suite -- 5/5 pass.
- Root lint and typecheck -- pass.
- Root tests -- 413 application tests pass; ordinary no-URL database lane
  remains 90 pass and 134 skipped, covered by the retained 224/224 zero-skip
  PostgreSQL 17 release gate.
- Nest and Next production builds -- pass; Next generates 77/77 static steps.
- Connected local browser -- unauthenticated `/portal/sign/dummy` rendered
  `Link not found`, returned bounded invalid-link copy, and emitted zero
  console warnings/errors.
- Packaged Playwright CLI did not start because its updated bundled Chromium
  binary is absent locally; no application assertion ran in that attempt.
  Connected-browser evidence completed the same non-mutating route proof.
- gitleaks 8.30.1, actionlint 1.7.12, diff checks, and prohibited external ERP
  brand/source scan -- pass.
- Source commit `e99b88fd232957ec8a224968ecb63441a2eab9d9` -- pushed to
  both repository refs under `kurtgav <kurtgavin.design@gmail.com>`.
- Railway correctly skipped deployment
  `ebe99b8c-886e-478e-b3bc-30620fbf11cf` because no watched backend file
  changed. Active API remains successful deployment
  `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` at source
  `e948223b261b7c335ceaad85e359fec68888e84a`.
- Vercel -- Git remains disconnected and zero deployments exist after retained
  READY deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- GitHub Actions run `30464538827` -- all jobs contain zero executed steps;
  account billing/spending block remains external.

Rollback and unresolved:

- Revert source commit `e99b88f`; no provider rollback is needed because the
  candidate is not deployed.
- Production success-path proof requires a newly created controlled signing
  session because it writes official signature, document, source, and audit
  state. Do not use historical demo records.
- RFQ auto-dispatch integrity is recorded in the following milestone.
- Public signing authority remains in Next.js pending incremental NestJS
  migration.
- Live activation still requires one explicitly approved consolidated queued
  Standard Vercel build.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.

## 2026-07-29 -- Atomic RFQ auto-dispatch integrity

Outcome:

- Found a browser-callable RFQ creation path that accepted caller-supplied
  system tenant authority, used a fabricated zero-UUID actor, and committed
  RFQ and audit independently.
- Found that BOM approval emitted `bom/approved` while the consumer listened
  only for `bom/internal_approved`; automatic RFQ creation was not wired.
- Replaced both paths with a server-only, tenant-scoped transaction service.
- Added BOM row locking, actor revalidation, one-result retry semantics,
  transactional audit, and post-commit notification.
- Added a unique tenant/BOM RFQ key and validated tenant-composite BOM foreign
  key.
- Removed direct browser insert, update, and delete privileges from RFQs and
  quotes while preserving authenticated tenant-scoped reads.
- Applied forward migrations `20260729152059` and `20260729153620` to Supabase
  project `aqqrtkmtcsfkbyyqxowv`. Hosted state is current at 53/53; RFQ count,
  quote count, and duplicate count remain zero.
- No Vercel deployment was created. Visible UI and copy are unchanged.

Changed files:

- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.ts`
- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.test.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/bom/actions.ts`
- `apps/web/src/lib/inngest-rfq.ts`
- `apps/web/src/lib/inngest-rfq.test.ts`
- `apps/web/src/lib/procurement/rfq-service.ts`
- `apps/web/src/lib/procurement/rfq-service.test.ts`
- `packages/database/src/schema/bom-extras.ts`
- `packages/database/src/schema/boms.ts`
- `packages/database/src/__tests__/rfq-transaction-integrity.test.ts`
- `supabase/migrations/20260729152059_rfq_transaction_integrity.sql`
- `supabase/migrations/20260729153620_close_rfq_browser_writes.sql`
- `docs/research/components/rfq-auto-dispatch-integrity.spec.md`
- the six architecture/operations memory files
- `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`

Validation:

- Focused RFQ Web suites -- 15/15 pass.
- RFQ Drizzle contract suite -- 5/5 pass.
- Root lint, typecheck, test, and production build -- pass.
- Root tests -- 433 application tests pass.
- Next production build -- 77/77 static-generation steps.
- Disposable PostgreSQL 17/Redis 7.4.9 lane -- 53/53 migrations and 228/228
  database assertions with zero skips; schema fingerprint stable.
- Hosted migration plan -- current at 53/53 with no missing or unexpected
  versions.
- gitleaks 8.30.1, actionlint 1.7.12, action-reference checks, diff checks, and
  prohibited external ERP source/brand scan -- pass.
- Source commit `f173957559a93eb724daf9eeed3fbbb1c4576baf` -- pushed to
  both repository refs under `kurtgav <kurtgavin.design@gmail.com>`.
- Railway deployment `94c78bd2-327a-4f6a-a49e-1d77195d850d` -- SUCCESS for
  the exact source SHA; live `/health` and `/ready` pass with database and
  Redis `ok`.
- Vercel -- Git remains disconnected and zero deployments exist after retained
  READY deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- GitHub Actions run `30467875222` -- Actionlint failed before any step started
  because of the account payment/spending-limit restriction; all dependent
  jobs skipped with zero executed steps.

Rollback and unresolved:

- Revert application source commit `20d276c` only if necessary. Do not undo
  the live integrity migrations; correct them with a reviewed forward
  migration.
- RFQ quote logging, completion, and cancellation are now row-locked,
  tenant-scoped, idempotent, state-machine guarded, and atomic with audit in
  source commit `20d276c`; hosted migration `20260729162944` is current.
- RFQ transaction authority remains transitional Next.js code. The next safe
  slice is an inert disabled NestJS procurement adapter preserving the same
  contract.
- Frontend activation still requires one explicitly approved consolidated
  queued Standard Vercel build.
- M1 canary and `AGENTS.md` approval blockers remain unchanged.
## 2026-07-30 -- Manual BOM-to-RFQ NestJS adapter

Outcome:

- Added strict shared request/result contracts for manual RFQ creation.
- Added capability-guarded NestJS `POST /v1/procurement/rfqs`.
- Added tenant-derived authority, BOM row locking, exact replay, contracted
  rate filtering, pending RFQ insertion, and one atomic semantic audit.
- Added an independent fail-closed Next.js tenant gate while preserving the
  existing Server Action contract and post-commit notification.
- Kept the automatic Inngest path unchanged.
- Left both creation cutover variables unset.
- No UI, schema, hosted data, Python, queue, Storage, or Vercel deployment
  changed.

Changed files:

- `packages/shared-types/src/erp-api/procurement.ts`
- `packages/shared-types/src/erp-api/procurement.test.ts`
- `apps/api/src/procurement/create-rfq.pipe.ts`
- `apps/api/src/procurement/procurement.controller.ts`
- `apps/api/src/procurement/procurement.controller.spec.ts`
- `apps/api/src/procurement/procurement.service.ts`
- `apps/api/src/procurement/procurement.service.spec.ts`
- `apps/api/integration/procurement.database.integration.spec.ts`
- `apps/web/src/lib/erp-core-client.ts`
- `apps/web/src/lib/erp-core-client.test.ts`
- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.ts`
- `apps/web/src/app/(dashboard)/procurement/rfqs/actions.test.ts`
- `docs/research/components/rfq-create-nest-adapter.spec.md`
- the six architecture/operations memory files

Validation:

- Focused shared, API, Web client, and Server Action suites -- pass.
- Root lint and typecheck -- pass.
- Root application tests -- 412 pass.
- Ordinary database lane -- 99 pass and 137 expected disposable-only skips.
- Nest and Next production builds -- pass; Next 77/77 static steps.
- Disposable PostgreSQL 17/Redis 7.4.9 lane -- 54/54 migrations, stable schema
  fingerprint, 236/236 database assertions with zero skips, and 2/2 Nest
  database integration tests.
- Actionlint 1.7.12, pinned action references, release-planner tests, gitleaks
  8.30.1, diff checks, and prohibited external ERP runtime scan -- pass.

Rollback and unresolved:

- Keep `ERP_RFQ_CREATE_WRITES_VIA_API` unset or exact `false`; tenant allowlist
  stays empty.
- Revert this source milestone if needed. No migration or data rollback exists.
- Production provider evidence will be appended after reviewed publication.
- Automatic BOM-approved RFQ dispatch remains in Next.js/Inngest. Next safe
  slice moves it to NestJS/BullMQ behind another disabled tenant gate.
- Frontend release remains one explicitly approved queued Standard build.

Provider evidence:

- Source commit `b8d1e518e63d0fcf9802efe30b2f1569ad6c6de4` is published on
  `main` and `agent-02/third-code-erp-landing`, authored by
  `kurtgav <kurtgavin.design@gmail.com>`.
- Railway deployment `5ebaca8a-e1cb-4d25-afb3-a98930046ebc` is SUCCESS for
  the exact source SHA. It uses `apps/api/Dockerfile`; image digest is
  `sha256:341680353751a36c4fdc61c330b31a98c32b0be77aea983b702e7c0bbf1329b2`.
- Live API `/health` and `/ready` return 200; readiness reports database and
  Redis `ok`. Anonymous `POST /v1/procurement/rfqs` returns 401. The deployment
  error-log query returned no entries.
- Vercel Git remains disconnected. The retained production deployment is
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`; no frontend deployment was created.
- Hosted GitHub Actions run `30494823225` executed zero steps because the
  account payment/spending-limit restriction prevented the job from starting.
- Free transient self-hosted run `30495135107` passed the exact source SHA in
  15m22s: workflow validation, lint, typecheck, tests, clean PostgreSQL
  17/Redis verification, production builds, Web and Nest runtime smoke checks,
  and secret scanning.
- The transient runner is deregistered; GitHub reports zero registered runners
  and no runner process remains. Two Windows-locked, credential-free runner
  work directories retain only non-secret `.runner` metadata and require
  manual cleanup.

## 2026-07-30 -- Approved-BOM RFQ BullMQ dispatch

Outcome:

- Wrote an original clean-room dispatch specification before code.
- Added strict shared dispatch result, versioned job, and dead-letter
  contracts.
- Added protected NestJS `POST /v1/procurement/rfqs/dispatch`, deriving all
  authority and queue policy from the authenticated server context.
- Added deterministic tenant/BOM job identity, five exponential attempts, and
  one deterministic final dead-letter record.
- Added execution-time membership and `rfq.dispatch` reauthorization,
  approved-BOM enforcement, and reuse of the existing atomic RFQ transaction.
- Added an independent exact Next.js flag and strict tenant allowlist while
  preserving Inngest as the disabled-path authority. Selected Nest failure
  never falls back to Inngest.
- Kept both automatic dispatch environment variables unset. Notification
  parity remains the explicit blocker before any tenant cutover.
- Changed no React/UI, schema, migration, hosted data, Supabase, Python,
  Storage, provider configuration, or Vercel deployment.

Changed files:

- `packages/shared-types/src/erp-api/procurement.ts`
- `packages/shared-types/src/erp-api/procurement.test.ts`
- `apps/api/src/auth/capability.guard.ts`
- `apps/api/src/procurement/**`
- `apps/api/integration/procurement.database.integration.spec.ts`
- `apps/api/integration/rfq-dispatch.redis.integration.spec.ts`
- `apps/web/src/lib/erp-core-client.ts`
- `apps/web/src/lib/erp-core-client.test.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/bom/actions.ts`
- `apps/web/src/app/(dashboard)/projects/[id]/bom/actions.test.ts`
- `scripts/ci/run-wsl1-database-lane.ps1`
- `docs/research/components/rfq-auto-dispatch-nest-bullmq.spec.md`
- the six architecture/operations memory files

Validation:

- Focused shared/API/Web suites -- 60/60 pass.
- `pnpm lint` -- pass.
- `pnpm typecheck` -- pass.
- `pnpm test` -- pass: 430 application tests; ordinary database lane 99 pass
  with 137 intentional disposable-only skips.
- `pnpm build` -- pass: Nest production bundle and 77/77 Next generated pages.
- Disposable PostgreSQL 17/Redis 7.4.9 lane -- 54/54 migrations, 236/236
  zero-skip database assertions, 5/5 Nest integration tests, and stable schema
  SHA-256
  `36B8999F16B825D89D8F782CBF28180D074AD677A9E8B2C16B713C79BB931BB6`.
- Real Redis evidence -- duplicate suppression, three-attempt bounded failure
  exercising the production processor, one dead letter, shutdown/restart,
  reconnect, and post-restart processing pass. Unit tests separately assert
  the production five-attempt policy.
- Actionlint, immutable workflow-action reference checks, database and Project
  release-planner tests, Gitleaks, `git diff --check`, and prohibited
  ERPNext/Frappe runtime scan -- pass.

Failures found and fixed:

- The first database assertion counted both the database trigger audit and the
  intended semantic audit; the assertion now filters the exact semantic action
  and source.
- The first dead-letter test waited for a worker that intentionally does not
  exist; it now verifies durable job presence.
- The first WSL restart helper used unsafe shell expansion and the long
  database run could leave Redis stopped before API integration. The helper now
  uses pinned absolute Redis paths and recreates the disposable process
  immediately before integration tests.

Rollback and unresolved:

- Keep `ERP_RFQ_AUTO_DISPATCH_VIA_API` absent/false and its allowlist empty, or
  revert the source commit. Existing Inngest behavior remains authoritative.
- Do not enable the BullMQ path until an idempotent NestJS notification
  outbox/delivery slice passes equivalent evidence and a controlled hosted
  canary is explicitly approved.
- Vercel Git remains disconnected. No frontend build is authorized.

Provider evidence:

- Source commit `dffb6052dde794a80abd8bbb24acc59adcd6fd10` is published on
  `main` and `agent-02/third-code-erp-landing` under
  `kurtgav <kurtgavin.design@gmail.com>`.
- Railway deployment `5e717900-d78a-4472-846f-df5784167354` is SUCCESS for the
  exact source SHA. Image digest is
  `sha256:13a83447269e7588cf4141ca02491122e0a5101b24678d1657e69034d4717864`.
- Live API `/health` and `/ready` return 200; readiness reports PostgreSQL and
  Redis `ok`. Anonymous dispatch returns 401. Deployment error logs are empty.
- Railway reports zero `ERP_RFQ_AUTO_DISPATCH*` environment variables.
- Vercel reports zero deployments after retained baseline timestamp
  `1785295180454`; Git remains disconnected and no paid frontend build ran.
- Hosted GitHub Actions run `30498025937` completed with zero executed steps:
  Actionlint could not start and all dependent jobs were skipped. GitHub
  reports zero registered self-hosted runners. The complete local and
  disposable PostgreSQL/Redis evidence above remains the release gate.

## 2026-07-30 -- RFQ notification outbox and BullMQ delivery

Outcome:

- Wrote an original clean-room notification outbox specification before code.
- Added atomic RFQ, semantic-audit, outbox-intent, and recipient-snapshot
  persistence in NestJS/PostgreSQL.
- Added UUID-only BullMQ jobs, deterministic job identity, five-attempt
  database and queue ceilings, active-claim suppression, stale recovery, and
  durable dead-letter state.
- Added idempotent in-app delivery and server-built Resend delivery with one
  provider idempotency key per delivery.
- Removed browser write authority from notifications and exposed no browser
  privileges on outbox/delivery tables.
- Made the one-minute recovery sweep opt-in and false by default to avoid
  continuous Redis work while automatic routing is disabled.
- Applied hosted migration
  `20260729233017_notification_outbox_foundation.sql` to Supabase project
  `aqqrtkmtcsfkbyyqxowv`.
- Kept all production cutover flags disabled. Existing Inngest behavior
  remains authoritative.

Changed files:

- `apps/api/src/config/environment.ts`
- `apps/api/src/config/environment.spec.ts`
- `apps/api/src/procurement/notification-*`
- `apps/api/src/procurement/procurement.service.ts`
- `apps/api/src/procurement/procurement.service.spec.ts`
- `apps/api/src/procurement/rfq-dispatch.processor.ts`
- `apps/api/src/procurement/rfq-dispatch.processor.spec.ts`
- `apps/api/src/procurement/procurement.module.ts`
- `apps/api/integration/procurement.database.integration.spec.ts`
- `apps/api/integration/rfq-dispatch.redis.integration.spec.ts`
- `packages/database/src/schema/notifications.ts`
- `packages/database/src/__tests__/notification-outbox.test.ts`
- `packages/shared-types/src/erp-api/procurement.ts`
- `packages/shared-types/src/erp-api/procurement.test.ts`
- `scripts/verify-database-repro.mjs`
- `supabase/migrations/20260729233017_notification_outbox_foundation.sql`
- `docs/research/components/rfq-notification-outbox-nest-bullmq.spec.md`
- the six architecture/operations memory files

Validation:

- Focused shared, database, and API tests pass.
- Root tests pass: 444 application tests; ordinary database run passes 103
  tests with 137 intentional disposable-only skips.
- Sequential root lint and typecheck pass after the production build. The
  first parallel run only raced Next's generated `.next/types` replacement.
- Production build passes: Nest bundle and 77/77 Next generated pages.
- Disposable PostgreSQL 17/Redis 7.4.9 lane passes 55/55 migrations, 240/240
  zero-skip database assertions, and 7/7 Nest integration tests.
- Real integration proves atomic replay, one in-app notification, one provider
  call, active-claim suppression, database attempt ceiling, final dead letter,
  Redis restart/reconnect, and database-pending recovery after Redis loss.
- Stable schema SHA-256 is
  `5429BBD50089170BFCA7E624C928DB6EBEA30E3D2585E26439CEF592710B6E8C`.
- Actionlint 1.7.12, immutable action-reference checks, both release planners,
  Gitleaks 8.30.1, and `git diff --check` pass.

Hosted database evidence:

- Project `ERP` is `ACTIVE_HEALTHY` on PostgreSQL 17.6.
- Ledger is 55/55 at `20260729233017`.
- New outbox and delivery tables contain zero rows.
- Three tenant-composite foreign keys are present and validated.
- `anon` and `authenticated` cannot access either server-only table.
- `authenticated` cannot insert, update, or delete notifications.
- Advisor additions are informational only: RLS-with-no-policy for two
  intentionally fail-closed tables and unused indexes on two empty tables.

Provider evidence:

- Source commit `a93da5f5025677444ca14407c98a189673c952dc` is published on
  `main` and `agent-02/third-code-erp-landing`, authored by
  `kurtgav <kurtgavin.design@gmail.com>`.
- Railway deployment `50fad0aa-8506-457a-a405-152dc31d2340` is SUCCESS for
  that exact SHA. Image digest is
  `sha256:50d598e279aa8d6b3681a0f2a230ed46d682bdc80e0802ff9bd81023dbd11a55`.
- Live `/health` and `/ready` return 200; PostgreSQL and Redis report `ok`.
  Anonymous dispatch returns 401. Deployment error logs and recent HTTP 5xx
  logs are empty.
- Railway has no automatic-dispatch, notification-sweep, or email-delivery
  variables. The new path is inert and creates no scheduled provider work.
- GitHub Actions run `30499929834` failed before executing a step. Actionlint
  has zero steps and every dependent job is skipped because the hosted account
  billing restriction remains.
- Vercel project `thirdcode-erp` reports zero deployments after retained
  production deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`, baseline
  timestamp `1785295180454`. Git remains disconnected.

Rollback and unresolved:

- Keep automatic routing, its tenant allowlist, and recovery scheduling
  absent/false. Revert application source if needed; leave the forward
  migration applied and preserve delivery evidence.
- Resend configuration is intentionally absent from this disabled milestone.
- A production canary still requires explicit clean-tenant approval,
  environment diff, monitoring, reconciliation, and rollback.
- Vercel Git remains disconnected and no frontend deployment is authorized.

## 2026-07-30 -- Controlled Supabase, Vercel, and Railway production release

Scope:

- Publish the already validated ERP state to the named production providers.
- Execute no database or backend mutation when parity and release identity
  prove they are already current.
- Bound Vercel billing by creating only the builds required for one production
  release, then disconnect Git.

Repository and validation:

- Release source:
  `31c04942a93dce78f165880fb02bdf38d25eb506`, authored by
  `kurtgav <kurtgavin.design@gmail.com>`, published on `main` and
  `agent-02/third-code-erp-landing`.
- Sequential lint and typecheck pass.
- Sequential tests pass: 88 shared, 64 API, 292 web, and 103 ordinary database
  tests with 137 intentional disposable-only skips; 444 application tests
  total.
- Production build passes: NestJS build and 77/77 Next.js generated pages.
- Disposable PostgreSQL 17/Redis 7.4.9 lane passes all 55 migrations, 240/240
  database assertions, 7/7 Nest integration tests, Redis restart/recovery, and
  schema SHA-256
  `5429BBD50089170BFCA7E624C928DB6EBEA30E3D2585E26439CEF592710B6E8C`.
- Actionlint 1.7.12, immutable action-reference verification, both release
  planners, and Gitleaks 8.30.1 pass.

Supabase:

- Project `aqqrtkmtcsfkbyyqxowv` reports PostgreSQL 17.6 and 55 migrations
  through `20260729233017_notification_outbox_foundation`.
- Repository and hosted ledgers match exactly. No migration was executed.
- `notification_outbox` contains zero rows after release.

Vercel:

- Protected preview `dpl_92JBFVyZjGozKPg2vcu5Hv4wNx9c` is `READY` on exact
  source `31c04942a93dce78f165880fb02bdf38d25eb506`.
- Production deployment `dpl_Htv5nb1A8oHbtowQpmrToYQgxDDL` is `READY` on the
  same source and aliases `https://thirdcode-erp.vercel.app`.
- Vercel required two total builds: one protected preview and one production
  rebuild using production environment variables. No retries were created.
- Root, health, readiness, robots, sitemap, and manifest return 200. Dashboard
  renders in the authenticated browser without a Server Components error.
- Web health and readiness report revision `31c04942a93d`; database readiness
  reports `up`.
- Production deployment has no runtime-error cluster and no HTTP 5xx.
- Git connection to `Third-Code-Solutions/ERP` was removed successfully after
  verification. Future source pushes cannot auto-deploy.
- Rollback reference:
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.

Railway:

- Project `a21fd382-80b2-4218-8025-11f420a062e3`, service
  `c45b3d01-036a-4663-a524-0713d782fce3`, remains online in production.
- Deployment `50fad0aa-8506-457a-a405-152dc31d2340` remains `SUCCESS` on
  application source `a93da5f5025677444ca14407c98a189673c952dc`, image
  `sha256:50d598e279aa8d6b3681a0f2a230ed46d682bdc80e0802ff9bd81023dbd11a55`.
- Current repository delta is documentation-only, so the later Railway event
  correctly skipped with `No changes to watched files`.
- `/health` and `/ready` return 200; PostgreSQL and Redis report `ok`.
  Anonymous RFQ dispatch returns 401. Last-hour HTTP 5xx query is empty.

Rollback and unresolved:

- Frontend rollback: promote retained deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- Backend rollback: retain or redeploy the prior healthy Railway image only if
  backend behavior regresses; no backend change occurred in this release.
- Database rollback: none required because no SQL ran.
- Automatic RFQ routing and notification recovery remain disabled pending a
  separately approved canary.

## 2026-08-01 PO authority audit and disabled Nest adapter

Objective: close immediate PO authorization gaps and define smallest safe
NestJS migration seam without changing live UI/API behavior or consuming a
provider deployment.

Findings:

- `apps/web/src/app/(dashboard)/procurement/actions.ts` remains direct-write
  authority for PO creation, lines, cost-code edits, transitions, approval
  stamps, supplier issuance, and receiving.
- Tenant filters existed on most queries, but capability checks were missing
  on several creation/legacy/receiving entry points. BOM creation also did not
  verify supplied project/vendor belonged to caller tenant.
- Existing PO number allocation and BOM/grouped creation are not yet a single
  idempotent PostgreSQL transaction. This remains a cutover blocker.

Changes:

- Added `po.receive` to shared web permission matrix.
- Added `po.create` to Nest capability guard matrix.
- Hardened current Server Actions with profile-derived actor/tenant,
  `po.create`/`po.receive` checks, same-tenant project/vendor validation, and
  integer centavo line validation.
- Added shared strict PO command/result schemas, `CreatePurchaseOrderPipe`,
  `PurchaseOrderController`, and `PurchaseOrderCreationService`.
- Added five tests covering disabled service behavior, required idempotency
  header, rejection of caller authority fields, and validated principal
  forwarding. Adapter service always fails closed; it writes nothing.
- Added defensive runtime parsing for standalone PO line payloads: non-array,
  null, primitive, non-integer, and negative values are rejected before any
  cost-code lookup or write.

Validation:

- Shared-types: 91 tests passed.
- API: 70 tests passed.
- Web: 292 tests passed.
- Database: 103 tests passed; 137 disposable-environment tests skipped because
  this local gate had no `DATABASE_URL`.
- Root lint and typecheck passed.
- Production build passed: Nest webpack compile and Next 77/77 pages.
- `git diff --check` passed; no migration or provider deployment was run.
- No SQL, hosted Supabase migration, Vercel build, Railway deployment, or
  browser UI mutation performed.

Rollback/unresolved:

- Revert source commit; leave `ERP_PO_CREATE_WRITES_ENABLED` absent/false.
- Commit `1c41d5e2bb69fb91deb778f76e60e10521d19000` is pushed to
  `agent-02/third-code-erp-landing` on `Third-Code-Solutions/ERP` under the
  local `kurtgav` GitHub CLI account. The Codex GitHub connector remains
  separately authenticated as `jdy1000`; it was not used for the push.
- Next action: add durable tenant-composite idempotency migration, implement
  Nest standalone transaction, prove disposable PostgreSQL parity, then
  tenant-canary one command. Keep other PO workflows on current path.
## 2026-08-01 - standalone PO transaction/idempotency milestone

Objective: move the smallest official PO write behind a transaction-safe Nest
boundary without changing the existing UI or default API behavior.

Completed:

- Added migration candidate 20260801090000, Drizzle schema, tenant-composite
  idempotency checks, RLS/service-only grants, and tenant PO-number uniqueness.
- Implemented capability recheck, idempotency replay/conflict handling,
  same-tenant reference validation, advisory numbering lock, bounded exact
  centavo math, line insertion, semantic audit, and atomic result persistence.
- Added exact API/Next feature gates, UUID tenant allowlists, stable hidden
  request keys, and fail-closed delegation.

Validation:

- Database: 106 passed, 137 environment-gated skips.
- API: 70 passed.
- Web focused client: 16 passed; full web suite: 295 passed.
- Typechecks for database, API, web, and shared contracts passed.
- Root lint, typecheck, test, and production build passed (77/77 Next pages
  and Nest compile).
- Docker integration was unavailable because the local Docker engine pipe could
  not be reached. Hosted Supabase stayed at 55/55; no hosted SQL or provider
  deployment was performed.
- Read-only Supabase release planner: PostgreSQL 17, linear 55/56 ledger,
  missing only 20260801090000; no migration SQL executed. Conservative SQL
  review flags the migration's drop-constraint statements.

Unresolved: run real PostgreSQL 17/Redis replay, rollback, cross-tenant, audit,
number-concurrency, and centavo-boundary probes before enabling one tenant.

Source evidence: commit 0252937402925c88e657982b5e60ec914e851c74 pushed by
kurtgav to Third-Code-Solutions/ERP branch
agent-02/third-code-erp-landing. Changed files are the candidate Supabase
migration, database enum/table/index/schema exports and contract test, Nest
environment/service/unit tests, shared command bounds/tests, Next server
action/form/core-client/gates/tests, and the six required architecture and
operations memory files. The exact next action is the disposable
PostgreSQL 17/Redis proof described in NEXT_ACTIONS.md; no provider release is
authorized by this milestone.

## 2026-08-01 - live landing regression milestone

Objective: verify and protect the existing public landing surface while
continuing the incremental ERP authority migration.

Completed:

- Audited the live landing page at desktop and mobile widths with browser
  automation, including accordion, carousel, FAQ, metadata, and console checks.
- Added `apps/web/src/components/marketing/third-code-landing.test.ts`.
- Added durable evidence in `docs/research/LIVE_LANDING_AUDIT_20260801.md`,
  `docs/research/live-landing-snapshot.md`, and
  `docs/design-references/live-landing-desktop.png`.
- Updated landing behavior/spec and architecture/operations memory files.

Validation: focused landing test 3/3; full web suite 298 passed; web
typecheck passed; live browser checks passed with zero console errors. No
Vercel, Railway, or hosted Supabase mutation occurred. Disposable
PostgreSQL/Redis proof remains blocked by disabled local hardware
virtualization, not by a test failure.

Next action: keep the landing surface stable and run the full 56-migration
PostgreSQL 17/Redis transaction proof on an already available owned Linux or
CI runner, with no new paid provider commitment.

## 2026-08-01 - disposable PostgreSQL/Redis authority proof

Objective: replace Docker-only integration blockage with a no-cost disposable
runtime and prove the first Nest transaction boundary end to end.

Completed:

- Ran `scripts/ci/run-wsl1-database-lane.ps1` in Alpine WSL1 distro
  `ThirdCodeERP-Test`.
- Rebuilt PostgreSQL 17 database from zero and applied all 56 migrations;
  ledger exactly matched repository and schema hash remained unchanged across
  the test run.
- Executed database tests 243/243 with zero skips.
- Executed Nest integration tests 7/7: tenant/auth, idempotency, rollback,
  audit, Redis restart, and Redis data-loss recovery.

Validation: lane exited 0; schema SHA-256
`427DEBE7531E969D9142C618180FB896FFE12C55C654655256DF1BA7647F2384`. Only
known Redis memory-overcommit warning remains. No hosted Supabase SQL,
Vercel deployment, or Railway deployment occurred.

Next action: perform read-only Supabase reconciliation and obtain correct
`kurtgav` Vercel/Railway provider sessions before any controlled canary.

## 2026-08-01 - PO approval workflow authority slice

Objective: move the smallest approval state machine into NestJS without
changing current UI behavior or enabling production writes.

Completed:

- Added candidate migration `20260801100000_purchase_order_workflow_idempotency.sql`
  and Drizzle schema with tenant-composite foreign keys, RLS, and service-only
  grants.
- Added strict shared contracts and Nest route/service for submit, PM approve,
  Commercial approve, and first-two-step rejection. The service locks the
  request and PO, rechecks membership/capability, commits stamps/status/audit,
  and replays idempotently. No issuance or email side effect is included.
- Added exact disabled workflow flags, controller/pipe/unit/contract tests,
  and a real database integration test covering commit, replay, state guard,
  audit, rollback, and tenant isolation.

Validation:

- WSL1 disposable lane: 57 migrations; database 243/243 with zero skips;
  Nest/Redis integration 8/8; schema before/after hash matched.
- API focused suite 74/74; shared contract suite 17/17; API/database
  typechecks and root lint passed.
- Hosted Supabase, Vercel, and Railway were not mutated. Provider auth still
  needs `kurtgav` / `kurtgavin.design@gmail.com`.

Next action: read-only hosted Supabase reconciliation at migration 57, then
provider identity/readiness/log verification. Keep workflow flags false and
do not deploy until a single-tenant canary is explicitly reviewed.

Hosted read-only reconciliation (2026-08-01): PostgreSQL 17; applied 55;
applied head `20260729233017`; repository 57; missing exactly
`20260801090000_purchase_order_create_idempotency.sql` and
`20260801100000_purchase_order_workflow_idempotency.sql`; unexpected history
0; applied-after-gap 0; no SQL executed. SHA-256 candidates are recorded by
the planner; both carry the conservative `drop-object` review flag.

## 2026-08-01 - server-only PO workflow client seam

Added `purchaseOrderWorkflowWritesUseCoreApi` and
`transitionPurchaseOrderThroughCoreApi` to the server-only Next core client,
with strict result validation, exact keyed requests, and 18/18 focused web
tests. No visible UI or copy changed; no Server Action delegates yet because
Nest notification parity is a separate gate. The independent client flags are
absent/false by default.

Final release gates (2026-08-01): root `pnpm typecheck` and `pnpm lint` passed;
full `pnpm test` passed (shared 93, database 106 with the normal
environment-gated skips, web 300, API 74); `pnpm build` passed with Nest
compile and 77/77 Next pages generated. Worktree is clean at commit
`6c0ce47`. No hosted SQL or provider deployment was performed.

## 2026-08-01 - PO workflow notification parity milestone

Objective: make the disabled Nest Purchase Order approval boundary preserve
transactional notification intent and role routing without changing visible UI
or the current Server Action path.

Completed:

- Added candidate migration `20260801110000_purchase_order_workflow_notifications.sql`
  with strict Purchase Order workflow payload integrity.
- Added independent `ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED` and tenant
  allowlist gates, default false/empty. A workflow transition now requires
  both write and notification gates, then commits status, audit, outbox, and
  role-routed in-app/email delivery rows atomically.
- Added BullMQ delivery support with payload/aggregate/current-role checks,
  stale processing and dead-letter handling, idempotent in-app inserts, and a
  bounded Resend Purchase Order workflow email.
- Added shared contracts, recipient-routing tests, email tests, and a real
  database integration probe for commit/replay/rollback and delivery.

Validation:

- Disposable Alpine WSL1 lane: PostgreSQL 17, Redis 7.4.9, 58/58 migrations;
  database 244/244 without skips; Nest/Redis integration 8/8; schema hash
  `F7F4A6AF4ABDDCF233B207D7652382A256D102F987A1670162DAB44C911EA243`.
- Full serial `pnpm exec turbo test --concurrency=1 --force`: shared 94, API
  79, web 300, database 107 with 137
  normal environment-gated skips. Root typecheck, lint, and build passed;
  Nest compiled and Next generated 77/77 pages.
- Read-only Supabase planner: PostgreSQL 17, 55 applied, repository 58,
  missing exactly the three linear candidates 20260801090000,
  20260801100000, and 20260801110000; no SQL executed. Vercel and Railway
  were not deployed.

Unresolved: provider sessions remain Vercel unauthenticated and Railway
`joeseffdy@gmail.com`; authenticate as `kurtgav` /
`kurtgavin.design@gmail.com`, verify readiness/logs/spend controls, and review
a one-tenant canary. Keep all PO and notification flags false.

## 2026-08-01 - Read-only project canary audit gate

Ran `scripts/plan-project-cutover.mjs --json` against one existing demo
tenant/project/actor selected read-only from hosted PostgreSQL. The planner
confirmed PostgreSQL 17, target existence, Auth identity, project audit
trigger, hardened audit function, and non-public audit function permissions.

Result: `blocked`. The tenant audit chain has 2 predecessor-link mismatches
and 151 hash mismatches; the selected actor lacks `project.update`. No rows,
permissions, feature flags, migration ledger, provider session, or deployment
changed. Next action is a separate audit recovery review, then a fresh
read-only canary plan; do not enable PO/project writes.

## 2026-08-01 - Audit hash parity hardening milestone

Forensic read-only evidence showed the database trigger and server audit
writers used different hash inputs. Added `computeDatabaseAuditHash` with
PostgreSQL UTC timestamp rendering; API `AuditService`, Next `writeAuditLog`,
and shared `verifyHashChain` now use it. Existing rows remain immutable.

Validation: shared audit 17/17; serial full suite shared 95, database 107 plus
137 normal skips, web 300, API 79; WSL1 PostgreSQL 17/Redis 7.4.9 58/58
migrations, 244/244 DB assertions, 8/8 integration; root typecheck/lint/build
passed and Next generated 77/77 pages. No hosted SQL, audit repair, or
provider deployment occurred.

## 2026-08-01 - Read-only audit recovery planner milestone

Added `scripts/plan-audit-recovery.mjs`, `scripts/lib/audit-recovery-plan.mjs`,
and `scripts/plan-audit-recovery.test.mjs`. The planner uses an explicit
tenant selector, read-only repeatable-read isolation, opaque refs, bounded
system event buckets, hardened-function checks, and `--require-clear`.

Validation: planner contract 4/4, existing release/cutover contracts 7/7 and
6/6, actionlint passed. Hosted read-only run: PostgreSQL 17/UTC, 661 audit
rows, 2 predecessor-link mismatches, 151 hash mismatches, status
`review_required`. No audit rows, permissions, flags, migrations, or provider
deployments changed.

## 2026-08-01 - Audit hash profile verification milestone

Added `scripts/verify-audit-hash-profiles.mjs` and its pure profile contract
tests. Hosted read-only verification classified 661 rows as: database formula
510, legacy JSON formula 40, unknown 111, with 2 predecessor-link breaks.
`--require-current` remains blocked. No row rewrite, permission change,
migration, flag enablement, or provider deployment occurred.

## 2026-08-01 - Controlled hosted release gate

Pushed the reviewed branch under `kurtgav` at `ca9ff6d`. A single Vercel
preview reached `Ready`; Preview Protection prevented anonymous endpoint
verification, so no production promotion was made. Railway production stayed
on its active deployment and `/health` plus `/ready` remained 200.

Validation and release attempt:

- Read-only planner: PostgreSQL 17, hosted 55/58, linear missing suffix of
  exactly three migrations, no unexpected versions or later-after-gap rows.
- Preflight: one duplicate tenant/PO-number group containing 12 demo records;
  target idempotency tables and notification constraint absent.
- Applied all three reviewed SQL files inside one PostgreSQL transaction. The
  first migration's explicit uniqueness guard rejected the duplicate group;
  PostgreSQL rolled back. The hosted ledger still reports 55/58 and no schema,
  data, audit, permission, flag, or deployment mutation followed.

Changed files for this milestone: architecture and operations release notes
only. No business record was renamed or deleted. Exact next action is an
owner-approved reversible remediation plan for the duplicate group, followed
by a fresh read-only audit/release gate.

## 2026-08-01 - Purchase Order duplicate-remediation planner

Implemented a read-only release-evidence tool for the hosted migration blocker:

- `scripts/plan-purchase-order-duplicates.mjs` runs in a repeatable-read,
  read-only transaction and reports bounded duplicate groups.
- `scripts/lib/purchase-order-duplicate-plan.mjs` provides stable opaque refs,
  positive-limit parsing, status counts, and release blockers.
- `scripts/plan-purchase-order-duplicates.test.mjs` covers clear, blocked,
  truncated, and deterministic output paths.
- Root scripts and both CI workflows now run the contract test.

Hosted evidence: one duplicate group, 12 records, no truncation; status
`review_required`. No PO number, UUID, money, note, schema, data, audit row,
flag, provider setting, or deployment was changed.

Validation: planner contract 4/4, existing release/cutover/audit contracts,
actionlint, typecheck, serial full tests (95 shared, 107 database with normal
137 environment skips, 79 API, 300 web), lint, and production build (77/77
Next pages) passed. Exact next action remains owner-approved reversible data
remediation, then a fresh DB release planner.

## 2026-08-01 - Clean-room runtime branding guard

Scanned `apps/web/src` and text assets under `apps/web/public` for residual
ABI Ops, ERPNext, and Frappe markers. No runtime occurrences were found. Added
`apps/web/src/lib/branding-clean-room.test.ts`, which recursively checks future
runtime text while constructing forbidden tokens without embedding them
contiguously in the test source.

Validation: the new Vitest contract passed; no visible UI copy, database,
provider setting, feature flag, or deployment changed.

## 2026-08-01 - Controlled release gate aggregator

Added `scripts/plan-controlled-release.mjs` plus the pure
`scripts/lib/controlled-release-plan.mjs` helper and contract tests. The gate
composes the existing read-only database and duplicate planners, an explicit
audit planner selector, and live Railway/Vercel readiness probes. It prints a
bounded decision and never applies SQL, changes flags, changes provider
settings, or creates a deployment.

Hosted execution: `review_required`; database 55/58, one duplicate group with
12 demo records, and no `AUDIT_RECOVERY_TENANT_ID` in the current shell. Both
readiness endpoints returned HTTP 200. No hosted data or provider state
changed.

Validation: controlled gate 4/4, release/cutover/audit/hash/duplicate
contracts, actionlint, gitleaks, typecheck, lint, full package tests (95
shared, 107 database plus 137 normal skips, 79 API, 301 web), and production
build (77/77 pages). The first parallel run was invalidated because build and
typecheck raced on generated `.next/types`; ordered build then typecheck is
the recorded result.

Exact next action: obtain owner-approved reversible remediation for the 12
duplicate demo records and an explicit audit tenant selector, then rerun the
controlled gate. Keep provider deployment and all write flags disabled.

## 2026-08-01 - Stock Receipt draft authority slice

Added the disabled inventory command seam:

- `supabase/migrations/20260801120000_stock_receipt_create_idempotency.sql`;
- `packages/database/src/schema/stock-receipt-create-requests.ts` plus enum/
  index exports;
- `packages/shared-types/src/erp-api/inventory.ts` and exact-arithmetic tests;
- `apps/api/src/inventory/*`, capability policy, environment flags, HTTP/service
  tests, and `apps/api/integration/inventory.database.integration.spec.ts`.

The service derives the actor from tenant membership, validates active
project/global warehouses and accepted same-PO deliveries, maps tracked PO
lines, computes integer micro-unit/centavo values, and commits the request,
draft receipt, lines, result, and semantic audit atomically. Conflicting
idempotency keys are rejected; retries replay the original result. Existing
browser receiving writes were not rerouted.

Validation: production build (API webpack and Next 77/77 pages), root
typecheck, serial lint, full package tests (shared 104, database 110 plus 137
normal skips, API 85, web 301), Actionlint, Gitleaks, migration contract, and
the disposable PostgreSQL 17/Redis 7.4.9 lane (59 migrations, database suite
without skips, API integration including the new Stock Receipt proof) passed.
The first focused integration assertion counted the database trigger audit
row alongside the semantic row; it was corrected to assert the semantic diff,
then passed. No hosted SQL, data, provider setting, flag, or deployment
changed.

## 2026-08-01 - CAD parser authority boundary

Removed the Python worker's direct PostgreSQL/`scope_items` write path and
deleted its database helper/dependency. Added a bounded worker response
contract; the Next application now validates the document belongs to the
tenant/project, replaces only derived rows for that document, computes exact
integer line totals, and records audit evidence transactionally. The upload
route passes the authenticated actor; Inngest uses the same commit function
with a null system actor.

Changed files: `apps/workers/dxf-parser/{src/main.py,src/config.py,src/db.py,
pyproject.toml,Dockerfile,README.md,run-local.sh,.env.example}`;
`apps/web/src/lib/cad/{parse-and-store.ts,worker-contract.ts,
worker-contract.test.ts}`; `apps/web/src/lib/inngest.ts`; and the upload
completion route.

Validation: worker-contract 4/4; web 50 files/305 tests; web typecheck, lint,
ordered Next build 77/77 pages, and Python compileall passed. Python pytest was
not available. No Supabase SQL, Railway deploy, Vercel deploy, flag, or hosted
data mutation occurred.

## 2026-08-01 - NestJS CAD evidence-commit adapter

Added shared CAD evidence schemas/helpers, the server-only
`cad_evidence_commit_requests` migration/table, and disabled NestJS
`POST /v1/documents/:documentId/cad-evidence`. The command derives membership
from PostgreSQL, enforces `document.manage`, validates tenant/project scope,
replaces only document-derived rows, computes exact totals, records idempotent
result plus semantic audit, and fails closed by default. Added HTTP/service/
migration contracts and a disposable API database integration test. Fixed the
API role/capability map to include the existing `estimator` role and
`document.manage` policy; no visible UI changed.

Validation: focused 10/10 API tests; shared 108/108, database 113 passing with
137 normal skips, web 301/301, root typecheck, serial lint, build 77/77 pages,
Actionlint, Gitleaks, and `git diff --check` passed. The disposable lane
replayed 60 migrations, executed database tests 250/250 without skips, and
passed API integration 10/10. No hosted SQL, flag, provider setting, or
deployment was performed.

## 2026-08-01 - NestJS CAD processing-job intake

Added the first durable M2.1 processing seam. Shared contracts are strict and
bounded; the job row is tenant-scoped, idempotent, composite-FK protected,
RLS-enabled, and server-only. Nest derives membership and document project,
rechecks processing/read capabilities, stamps actor context, and returns
queued/replayed state. BullMQ receives only an opaque job UUID with
retry/backoff and duplicate suppression. The worker bridge is intentionally
not registered; no flag or caller can activate this slice by default.

Also recorded the live landing behavior/topology/component audit with 1440px
desktop and 390px mobile screenshots. No landing UI code changed.

Validation: focused API 105/105; disposable PostgreSQL 17/Redis 7.4.9 lane
replayed 61 migrations, passed 253/253 database assertions without skips, and
passed 11/11 API integration assertions. Hosted Supabase, Railway, Vercel,
flags, and business data were not changed.

## 2026-08-01 - Signed Nest-to-Python CAD evidence bridge

Added the next M2 source slice without changing the public upload path:

- `packages/shared-types/src/erp-api/document-processing.ts` now defines
  bounded private request/evidence schemas and limits.
- `apps/workers/dxf-parser/src/{main.py,models.py,storage.py,config.py}` adds
  HMAC-authenticated `/parse-evidence`, exact-object signed-URL download,
  source hashing, deterministic item keys, bounded evidence, and optional
  legacy service-role compatibility.
- `apps/api/src/cad/document-processing.{storage,worker,state,processor}.ts`
  adds server-only signed URL issuance, request signing/response validation,
  PostgreSQL claim/state transitions, retry/dead-letter handling, and the
  disabled BullMQ processor. `cad.module.ts` registers the provider set.
- `apps/api/src/config/environment.ts` adds closed-by-default bridge, parser
  URL/secret, and optional server-only Storage credentials. Processing intake
  now requires the bridge and CAD commit flags plus matching tenant allowlists.
- Added focused worker/processor/shared contracts and extended the disposable
  processing integration for claim/fail/succeed/replay behavior.

Validation: shared contract tests 6/6, API suite 111/111, API typecheck,
Python source bytecode compilation, isolated worker pytest 11/11, full ordered
repository tests, disposable PostgreSQL 17/Redis 7.4.9 replay (61/61
migrations, 253/253 database assertions, 11/11 API integration), typecheck,
serial lint, production build (77/77 pages), Actionlint, Gitleaks, and diff
checks passed. No hosted SQL, flags, provider settings, deployment, or
business data changed.

## 2026-08-01 - Durable CAD evidence and idempotent draft BOM

Added candidate migration `20260801150000_document_processing_evidence.sql`,
Drizzle schema, Nest evidence persistence, independent draft-BOM gate, and
idempotent Nest draft-BOM transaction. Validated worker payload is persisted
per tenant/job/attempt before scope commit. Draft creation locks the job,
revalidates actor/document context, writes integer-centavo BOM lines, attaches
`draft_bom_id`, and emits semantic audit evidence. Replays return the existing
evidence/BOM; mismatched evidence is rejected.

Validation: focused API processor/worker/service/environment tests 19/19,
API typecheck, disposable PostgreSQL 17/Redis 7.4.9 lane with 62/62
migrations, 253/253 database assertions without skips, and 11/11 API
integration assertions passed. No hosted SQL, flags, provider settings,
deployments, or business data changed.

## 2026-08-01 - Atomic CAD scope and draft BOM verification

Refactored the processor handoff so a requested draft BOM is passed as a
context to `CadEvidenceCommitService`; scope replacement, BOM/line creation,
job attachment, idempotency completion, and semantic audit now share one Nest
transaction. Replays lock and reuse the existing BOM. The database integration
probe exercises the same atomic path rather than a separate BOM write.

Validation: disposable PostgreSQL 17/Redis 7.4.9 lane passed 62/62
migrations, 253/253 database assertions without skips, and 11/11 API/Redis
integration assertions. Full workspace gates passed: shared 114/114, API
113/113, web 301/301, database 116 passing with 137 environment-gated local
skips, workspace typecheck, serial lint, Nest/Next production build (77/77
pages), Actionlint, Gitleaks, diff checks, and isolated Python worker pytest
11/11. Hosted Supabase, Railway, Vercel, flags, and business data remain
unchanged.

## 2026-08-01 - Source release handoff

Committed and pushed the reviewed source slice as
`9a773d4e692a4d2471416d14887cbab907f57a04` on
`origin/agent-02/third-code-erp-landing`, authored by `kurtgav`.
The read-only controlled-release planner remains `review_required`: hosted
Supabase is 55/62 migrations with seven candidates pending, one duplicate
Purchase Order-number group contains 12 demo records, and
`AUDIT_RECOVERY_TENANT_ID` is not approved/configured. Railway and Vercel
readiness endpoints remain HTTP 200, but no hosted SQL, flag, deployment, or
business-data mutation was performed.

## 2026-08-01 - Controlled release recheck

Re-ran the read-only controlled-release planner after the final atomic CAD
source handoff. The source worktree and remote branch are clean at
`ef1021f0df799014bff79fe782a31507f33969f5`; author identity remains
`kurtgav <kurtgavin.design@gmail.com>`. The planner still reports
`review_required`: hosted Supabase is 55/62 migrations with candidates
`20260801090000` through `20260801150000`, one tenant-scoped duplicate
Purchase Order-number group contains 12 records, and
`AUDIT_RECOVERY_TENANT_ID` is absent. Railway `/ready` and Vercel `/api/ready`
both returned HTTP 200. No SQL, provider setting, flag, deployment, or
business record changed. Next action requires owner-provided tenant UUID and
record-level duplicate remediation instructions.

## 2026-08-01 - CI secret-scan cost-free fix

Draft PR #1 exposed a GitHub Actions failure before application tests: the
organization-scoped `gitleaks/gitleaks-action@v2.3.9` now requires a paid
license. Replaced that action with the existing checksum-pinned
`scripts/run-gitleaks.mjs` and removed the obsolete action-reference check.
This preserves full-history secret scanning without a paid license or any
runtime/provider change. The PR was pushed again to trigger the corrected CI
run.

The corrected run then exposed a CI-only RLS setup mismatch: Supabase CLI's
local reset did not carry the minimal `anon`/`authenticated` default table
grants used by the repo's WSL reproducibility lane, causing four `projects`
permission errors. Added the existing test-only
`scripts/ci/supabase-system-bootstrap.sql` before the reset so both lanes use
the same system-role bootstrap. No application migration or hosted privilege
was changed.

The first bootstrap retry was rejected by the CLI-owned `auth` schema, so it
was narrowed to a new `scripts/ci/supabase-default-privileges.sql` fixture
that creates only missing roles, schema usage, and future-object grants. It
does not recreate or alter Supabase-managed auth/storage objects. The fixture
now runs after the CLI reset and grants only the legacy `public.projects`
and `public.users` client-role surfaces required by the RLS proof and cost
policy subqueries.

The next hosted run then reached the Nest integration stage and correctly
failed only on two WSL-specific Redis-restart cases: GitHub-hosted Linux has no
`ERP_REDIS_TEST_DISTRIBUTION` or repo-local Redis binary. Those cases are now
conditionally skipped unless the WSL restart contract is present; ordinary
BullMQ/Redis integration remains enabled, and the WSL lane still proves restart
recovery.

The following CI retry exposed that the test-only `projects`/`users` grants
were being compared by the schema-diff gate, and the pinned CLI did not create
the requested `--output` path. Moved the empty schema-diff assertion directly
after the clean reset, switched it to the pinned CLI `--file` flag, and apply
the legacy grant fixture only after that assertion and before database/RLS
tests. CI now pre-creates the diff artifact because the pinned CLI leaves it
absent on an empty diff. This keeps the reproducibility check migration-only
and leaves hosted privileges unchanged.

## 2026-08-01 - CI reproducibility gate green, hosted release still blocked

Pushed CI repair commits `d53509c` and `6980129` under `kurtgav` to
`agent-02/third-code-erp-landing`. Run `30707238189` passed Actionlint, secret
scan, typecheck, lint, unit tests, Postgres 17/Redis reproducibility,
database/RLS assertions, Nest transaction integration, container smoke, and
production build. E2E remained skipped by explicit credential gating.

The read-only controlled planner was rerun after CI success. It still reports
`review_required`: hosted Supabase is 55/62 with seven pending migrations;
the first candidate is blocked by one tenant-scoped duplicate Purchase Order
number group containing 12 demo records; and no owner-approved
`AUDIT_RECOVERY_TENANT_ID` is configured. Railway `/ready` and Vercel
`/api/ready` both returned HTTP 200. No hosted SQL, provider setting, flag,
deployment, or business data changed.

## 2026-08-02 - M2.5 processor canary source proof

Added `apps/api/integration/document-processing-processor.database.integration.spec.ts`.
The rollback-only canary creates a real tenant-scoped processing job, uses the
signed worker client with a bounded response, persists evidence, commits scope
through Nest authority, ignores duplicate delivery, verifies replacement and
semantic audit, and rolls back all fixture rows.

Validation: CI run `30708078211` passed Actionlint, secret scan, typecheck,
lint, unit tests, PostgreSQL 17/Redis 7.4.9 database/API integration,
container smoke, and production build. E2E remains skipped by explicit
credential gating. Hosted Supabase, Railway, Vercel, flags, and business data
were not changed.

## 2026-08-02 - M2.5 Redis transport proof

Added `apps/api/integration/document-processing.redis.integration.spec.ts`.
The real BullMQ/Redis lane publishes only `{schemaVersion, jobId}`, validates
the production queue class, and proves duplicate enqueue/delivery produces one
worker execution. The queue is isolated and obliterated after the test.

Validation: CI run `30708445023` passed the Redis proof, PostgreSQL processor
canary, database/API integration, container smoke, workspace gates, and
production build. E2E remains skipped by explicit credential gating. Hosted
Supabase, Railway, Vercel, flags, and business data were not changed.

## 2026-08-02 - Document-processing recovery source slice

Added PostgreSQL-owned stale-claim recovery, bounded queued-ID selection, and
`enqueuePending()` re-enqueue after Redis transport loss. The source slice
keeps Redis delivery-only and leaves the recovery entry point dormant pending
an explicit scheduler/flag/tenant design.

The first CI attempt `30709360939` exposed a missing `waitForState` test helper;
the fix was committed as `f02cbaf`. Final CI run `30709595007` passed the
PostgreSQL 17/Redis 7.4.9 recovery lane, processor canary, bounded retry and
terminal failure, Redis-loss re-enqueue, database/API integration, Nest smoke,
workspace checks, Actionlint, secret scan, and production build. E2E remains
skipped by explicit credential gating. Hosted Supabase, Railway, Vercel, flags,
and business data were not changed.

## 2026-08-02 - Final branch push and release audit

Pushed the reviewed source and memory docs as `39f6a62c2bf0463ac0fdcf4fe2788cb876f65510`
on `agent-02/third-code-erp-landing` under `kurtgav`. CI run `30710003798`
passed Actionlint, secret scan, typecheck, lint, unit tests, Postgres 17/Redis
reproducibility, production build, and container smoke; E2E remains skipped by
explicit hosted credential gating.

The read-only release planner remains `review_required`: hosted Supabase is
55/62 with seven pending migrations, one tenant-scoped 12-record Purchase Order
duplicate group remains, and no approved `AUDIT_RECOVERY_TENANT_ID` exists.
Railway `/ready` and Vercel `/api/ready` returned HTTP 200. No hosted SQL,
provider setting, deployment, flag, or business-data mutation was performed.

## 2026-08-02 - M2.6 tenant-scoped recovery scheduler

Added closed-by-default recovery scheduling for document-processing. BullMQ
creates the scheduler only when recovery, intake, worker-bridge, and Nest commit
gates are true and the recovery tenant IDs intersect processing and commit
allowlists. The scheduler payload is schema-version-only; the processor calls
the bounded PostgreSQL recovery query and logs rebuilt transport counts.

Validation: shared contract tests 7/7, API full suite 120/120, focused queue and
processor tests, workspace typecheck, serial lint, production build, and diff
checks passed. Database/Redis integration files were collected but skipped
locally because the explicit integration credential gate is absent. Hosted
Supabase, Railway, Vercel, flags, and business data were not changed.

CI run `30711326355` for commit `0ff4ece8449c882436f90c0dcb45edfc67765da4`
passed the full executable lane, including Postgres 17/Redis recovery,
cross-tenant exclusion, production build, and container smoke. E2E remains
skipped by explicit hosted-credential gating. The read-only release planner
still reports 55/62 hosted migrations, one 12-record tenant Purchase Order
duplicate group, and a missing approved `AUDIT_RECOVERY_TENANT_ID`; no hosted
SQL, provider action, flag, deployment, or business-data mutation occurred.

## 2026-08-02 - M2.7 Cortex source-grounded search

Added `apps/web/src/app/api/cortex/search/route.ts` and focused tests. The route
derives tenant and role from the authenticated profile, applies the Cortex
node-type scope in the database query, validates registry/ref-table ownership,
and returns source-cited record metadata plus safe deep links. Added a debounced
graph-toolbar dropdown so operators can find summaries and titles across the
full tenant graph without an embedding/LLM request per keystroke. Escaped ILIKE
wildcards in the shared Cortex retrieval helper.

Validation:

- Focused Cortex/search/graph/search-policy tests: 22/22 pass.
- Web suite: 306/306 pass.
- Database suite: 116 pass; 137 cases explicitly skipped without the injected
  integration database/Redis credentials.
- Workspace typecheck, serial lint, `git diff --check`, and Next production
  build (78/78 generated routes) pass.

Hosted Supabase, Railway, Vercel, flags, provider settings, and business data
were not changed. Commit `6d55248110e630ed01c16f903972c8d52ff70af2` is pushed
under `kurtgav`; CI run `30712546507` passed Actionlint, secret scan, typecheck,
lint, unit tests, Postgres 17/Redis reproducibility, and production build.
E2E remains skipped by explicit hosted-credential gating. The read-only planner
still reports 55/62 migrations, the 12-record Purchase Order duplicate group,
and missing `AUDIT_RECOVERY_TENANT_ID`.

## 2026-08-02 - M2.8 RAG suggestion hardening

Hardened `apps/web/src/app/api/ai/similar-items/route.ts` and added its six-test
route contract. The endpoint now uses `getUserProfile`, denies roles without
BOM visibility, bounds descriptions to 5–300 characters, returns private
no-store responses, filters non-finite/out-of-range similarities, identifies
approved-BOM history, and fails closed on provider/vector outages. Updated the
story index from the stale `apps/workers/rag-indexer` path to the actual
Inngest embedding refresh path.

Focused route tests passed 6/6. No hosted SQL, Storage, queue, provider
setting, deployment, or business-data mutation occurred. Remaining release
gate is unchanged: 55/62 hosted migrations, one 12-record duplicate Purchase
Order group, and missing approved `AUDIT_RECOVERY_TENANT_ID`.

## 2026-08-02 - M2.8 CI evidence

Pushed `fa283f94376aacd8f7febd9324b162697571efa1` under `kurtgav`.
GitHub Actions run `30713863937` completed green. Passed Actionlint, secret
scan, lint, typecheck, unit tests, Postgres 17 zero-to-current rebuild and
schema diff, database tests without skips, Nest transaction-boundary
integration, production container smoke, and workspace production build.
No Supabase, Railway, Vercel, Storage, queue, flag, or business-data mutation
was performed. Hosted planner blockers remain: 55/62 ledger, one 12-record
tenant Purchase Order duplicate group, and missing approved
`AUDIT_RECOVERY_TENANT_ID`.

## 2026-08-02 - M2.9 Python AI advisory boundary

Added `apps/workers/ai` FastAPI service and protocol tests. `/health` is public;
`/v1/embeddings` requires `AI_WORKER_SHARED_SECRET`, bounds batches and text,
does not echo input, validates provider order/dimensions, and has no ERP or
database credentials. Added worker-first client selection in `packages/ai`
with compatibility fallback only when `AI_WORKER_URL` is absent. RAG similar
items, auto-BOM, and Inngest embedding refresh now share provider readiness.

Validation: Python 6/6; focused Web 10/10; full Web 316/316; API 120/120;
shared-types 115/115; database 116 pass with 137 explicit local integration
skips; typecheck, lint, Next build 78/78 routes, gitleaks, actionlint,
workflow-ref verification, and diff checks pass. Docker worker smoke was
blocked before build by local Docker Desktop API HTTP 500. No hosted SQL,
deployment, provider setting, flag, or business-data mutation occurred.

CI evidence: pushed `56bb76eb2dc7f4f7f00fbe4690e06323696b0618` under `kurtgav`.
GitHub Actions run `30715179369` completed green, including Postgres 17
reproducibility, database tests without skips, Nest transaction-boundary
integration, container smoke, and workspace production build. E2E was skipped
by the explicit hosted-credential gate. PR #1 remains draft and clean; no
Supabase, Railway, Vercel, worker, provider, flag, queue, or business-data
mutation was performed.

## 2026-08-02 - M3.0 Change Request command boundary

Added the closed-by-default NestJS Change Request command, shared Zod
contract, explicit `change_request.create` capability, tenant-scoped
idempotency migration/table, atomic design notifications, semantic audit, and
the server-only Web client seam. Existing Next Server Action behavior and UI
were not replaced.

Validation: shared contract 3/3; database schema/migration 3/3; Nest
service/controller 5/5; Web client 20/20; environment 11/11; serial API
27 files/125 tests; workspace typecheck/lint; production build 78/78 routes;
secret scan; actionlint; workflow refs; and diff checks pass. Source commit
`765285a57d37885980f01774bffdb27676a203e0` passed CI run `30717165544`,
including Postgres 17 replay/schema diff, database tests without skips, Nest
transaction integration, container smoke, and production build. E2E remains
credential-gated. No hosted Supabase, Railway, Vercel, feature flag, queue,
provider, or business-data mutation was performed. Hosted planner blockers
remain unchanged.

## 2026-08-02 - M3.0 Change Request database evidence

Added `apps/api/integration/change-request.database.integration.spec.ts`.
The disposable PostgreSQL probe seeds two tenants and validates tenant/RBAC
denial, same-key replay, conflicting-key rejection, one design notification,
one semantic audit row, and full transaction rollback. Local execution was
explicitly skipped because disposable `DATABASE_URL` credentials are absent;
API typecheck passed and the serial API lane passed 27 files / 126 tests with
one integration skip. No hosted database, deployment, provider setting, flag,
queue, or business-data mutation occurred.

Landing browser audit also rechecked the live public page at 1440px and 390px:
title and Third Code ERP branding were present, console errors were zero, and
no public ERPNext/Frappe trace was observed. Vercel Git remains disconnected.

## 2026-08-02 - M3.0 disposable CI evidence

Pushed `77b6e04206a48ff47ffeee5567b56bf3e3195e65` under GitHub account
`kurtgav`. CI run `30718464238` passed Actionlint, lint, secret scan,
typecheck, unit tests, Postgres 17 zero-to-current replay/schema diff,
database tests without skips (256/256, including the new Change Request
integration), Nest container smoke, and the production build. E2E stayed
skipped by hosted-credential gating. No hosted Supabase, Railway, Vercel,
feature flag, queue, provider setting, or business-data mutation occurred.

## 2026-08-02 - M3.1 web Change Request cutover seam

Commit `d5ee498` adds an incremental Next.js-to-Nest seam for Change Request
creation. It introduces capability parity, closed-by-default tenant routing,
stable browser idempotency tokens, and focused action tests while preserving
the legacy direct Server Action path. No visible landing or dashboard design
was changed.

Results: web suite 53/53 files and 320/320 tests; workspace lint passed;
production build generated 78/78 routes; actionlint, gitleaks,
workflow-reference verification, and diff checks passed. No hosted Supabase,
Railway, Vercel, flag, queue, provider setting, or business-data mutation was
performed. Hosted planner blockers remain unchanged.

## 2026-08-02 - M3.1 CI and hosted-readiness verification

GitHub Actions run `30732430851` passed on SHA
`1b3bff1efac5901e34859263f43b1be94835eced`: all executable CI jobs passed,
including the Postgres 17 reproducibility/integration lane, 256/256 database
tests without skips, Nest smoke, and production build. E2E remained skipped by
credential gating. Read-only checks show Railway and Vercel ready (HTTP 200),
but the planner remains `review_required`; no hosted database or provider
mutation was made.

## 2026-08-02 - M3.2 Purchase Order workflow seam

Commit `fa3c20a` adds closed-by-default Next.js-to-Nest routing for Purchase
Order draft submission, PM approval, and Commercial approval. Browser retry UUIDs
remain stable until success. SCM issuance and rejection stay legacy pending
Nest state/notification parity. No visible UI design or copy changed.

Validation: Web suite 54/54 files and 325/325 tests; workspace typecheck and
lint; production build 78/78 routes; actionlint; gitleaks; workflow-reference
verification; and diff checks passed. No hosted Supabase, Railway, Vercel,
feature flag, queue, provider setting, or business-data mutation occurred.

## 2026-08-02 - M3.2 CI and hosted planner verification

Run `30733168171` passed on final SHA
`1bc232e55fa2f122aea5182b5ca442d536e916d4`: all executable jobs passed,
including Postgres 17 replay, 256/256 database tests without skips, Nest smoke,
and production build. E2E stayed credential-gated. Railway/Vercel readiness
returned 200; planner remains `review_required`; no hosted DB/provider state
changed.

## 2026-08-02 - M3.3 Purchase Order rejection seam

Implemented and pushed `16904f0` under `kurtgav`:

- Nest `PurchaseOrderWorkflowService` now authorizes and commits `reject` from
  `pending_scm_issuance` as well as the existing PM/Commercial pending states,
  returning the record to `draft` with idempotency, notification intent, and
  semantic audit in one transaction.
- Updated notification recipient routing and added forward-only migration
  `20260802100000_purchase_order_workflow_scm_rejection.sql` for the outbox
  payload constraint.
- The Next Server Action preserves tenant/status/role validation and uses the
  core client only for allowlisted tenants; the browser rejection action now
  holds a stable retry key until success. SCM supplier issuance remains legacy
  pending an outbox-owned email contract. Visible UI design/copy is unchanged.

Validation passed locally: Web 54 files / 326 tests, API 27 files / 127 tests,
database 20 files / 120 tests with 137 local integration skips, workspace
typecheck/lint, production build 78/78 routes, actionlint, gitleaks,
workflow-reference verification, migration files-only verification, and diff
checks. GitHub Actions run `30733959058` passed all executable jobs, including
Postgres 17 replay/schema diff, no-skip database tests, Nest integration and
container smoke, and build; E2E stayed credential-gated.

Hosted planner remains `review_required` (55/64 migrations, nine pending;
one 12-record Purchase Order duplicate group; missing
`AUDIT_RECOVERY_TENANT_ID`). No hosted Supabase SQL, Railway/Vercel deploy,
feature flag, queue, provider setting, or business-data mutation occurred.

## 2026-08-02 - M3.4 SCM issuance and supplier delivery authority

Implemented and pushed `21a152d`, then corrected and pushed `52b6288`, under
`kurtgav`:

- Added the Nest `scm_issue` command, `po.issue` capability, pending-SCM to
  issued state transition, transactional idempotency, internal notification,
  and audit.
- Added forward-only migration
  `20260802110000_purchase_order_supplier_issuance.sql` plus the matching
  Drizzle table. Supplier email is now a tenant-scoped outbox child with
  immutable recipient/name/PO/project/cents snapshot, no browser privileges,
  and separate BullMQ job IDs.
- Added Resend idempotency, retry/dead-letter handling, success evidence in
  `supplier_email_sent_at`, and an append-only delivery audit update. Invalid
  or missing vendor mail does not block the ERP status transition and is
  explicitly audited as not queued.
- Preserved the Next action and SCM button appearance; only a stable hidden
  retry key was added. Feature flags and tenant allowlists remain closed.
- Added API, database, shared-contract, queue/processor, email, and
  disposable-Postgres integration assertions, including idempotent replay and
  supplier delivery evidence.

Local validation: API 27 files / 129 tests, Web 54 / 326, database 20 / 121
with 137 explicit local integration skips, shared contracts 9 / 119;
workspace lint, typecheck, and production build 78/78 routes passed. The
default parallel workspace test had one unrelated stock-receipt 5-second
timeout; isolated API validation passed with a 15-second timeout.

CI run `30735062767` failed as intended on a PostgreSQL nullable-side
`FOR UPDATE` error. Fix `52b6288` split the locked PO/project read from the
tenant-scoped vendor share lock. CI run `30735228348` then passed Actionlint,
secret scan, lint, typecheck, unit tests, fresh Postgres replay/schema diff,
no-skip DB tests, Nest integration/container smoke, and production build. E2E
remains credential-gated.

Hosted planner is now `review_required` at 55/65 migrations (ten pending), one
12-record duplicate Purchase Order group, and missing
`AUDIT_RECOVERY_TENANT_ID`. No hosted SQL, provider deployment, flag, queue,
provider setting, or business-data mutation occurred.

## 2026-08-02 - M3.5 Finance journal posting authority

Implemented and pushed `97106ba` under `kurtgav`:

- Added Nest `POST /v1/finance/journals/:journalEntryId/post` with
  `finance.post`, tenant membership/role recheck, journal lock, strict
  idempotency hash/replay, database posting-function call, and semantic audit.
- Added `journal_post_requests` migration/schema with tenant composite FKs,
  processing/succeeded checks, forced RLS, and service-role-only access.
- Added the closed-by-default web compatibility route and stable browser retry
  key. Existing `Post journal` copy and visible UI remain unchanged.
- Added shared contracts, API/web/database tests, and a disposable Postgres
  Nest integration test. Python/AI remains non-authoritative.

Local serial validation: API 29 files / 135 tests, shared 10 / 121, database
21 / 123 plus 137 explicit environment-gated skips, Web 54 / 328; workspace
lint, typecheck, production build 78/78 routes, actionlint, gitleaks, and
diff checks passed. One unbounded parallel API invocation had three unrelated
HTTP-test startup timeouts; the serial full API suite passed with a 15-second
timeout. CI run `30736271967` passed all executable jobs, including Postgres 17
replay/schema diff, no-skip database tests, Nest integration/container smoke,
and build. E2E remained credential-gated.

Read-only planner at `2026-08-02T06:45:15Z`: `review_required`; Supabase
55/66 with 11 pending migrations, one 12-record duplicate Purchase Order
group, zero audit rows, and missing `AUDIT_RECOVERY_TENANT_ID`. Railway and
Vercel readiness returned HTTP 200; no hosted Supabase SQL, Railway/Vercel
deployment, finance flag, queue, provider, or business-data mutation occurred.

## 2026-08-02 - M3.6 Cortex external-model privacy boundary

Implemented and pushed `08f1315` under `kurtgav`:

- Added `apps/web/src/lib/cortex/redaction.ts` with deterministic redaction for
  emails, TIN formats, and Philippine mobile numbers plus stable SHA-256 text
  hashes.
- Applied the redaction to graph prompt records, focused context, embedding
  input, and every model message. Conversation titles are redacted when first
  created; authorized chat history and in-product fallback behavior remain.
- Replaced raw Cortex audit prompt text with started/completed phases, model or
  fallback outcome, prompt/response hashes, redacted previews, and counts.
- Added direct unit and route assertions proving identifiers do not reach the
  embedding or chat-model call and are absent from audit previews. Landing UI
  was intentionally untouched.

Validation: focused 10 tests, full Web 55 files / 332 tests, Web typecheck,
workspace lint, and production build (78/78 routes) passed. No Supabase
migration or provider mutation occurred. Read-only planner at
`2026-08-02T06:55:43.181Z` remains `review_required` at 55/66 hosted
migrations, with one 12-record duplicate-PO group, zero audit rows, and
missing `AUDIT_RECOVERY_TENANT_ID`; Railway/Vercel readiness are HTTP 200 and
Vercel revision remains `31c04942a93d`.

CI evidence: run `30736912185` passed Actionlint, typecheck, unit tests, lint,
secret scan, clean Postgres 17/Redis replay and schema checks, no-skip
database tests, Nest transaction/container smoke, and production build for
the M3.6 candidate. E2E remained skipped by the explicit hosted-credential
gate. No hosted SQL, deployment, feature flag, queue, provider, or
business-data mutation occurred.

## 2026-08-02 - M3.7 CAD processing authority handoff

Implemented and pushed `0cfb72a` under `kurtgav`:

- Added a closed-by-default frontend canary for binary DWG uploads using
  `ERP_DOCUMENT_PROCESSING_VIA_API` plus a strict UUID tenant allowlist.
- Added the Next-to-Nest job handoff, authenticated status proxy, bounded
  polling, accepted/status contracts, and fail-closed behavior with no legacy
  writer fallback after core selection. Existing visible upload UI/copy is
  preserved.
- Added route/client/formatter tests and environment documentation. No
  migration was needed; Python remains signed/read-only evidence input.

Local validation: focused 4 files / 36 tests, full Web 57 files / 342 tests,
workspace lint, Web typecheck, and production build 78/78 routes passed.
GitHub Actions run `30738075103` is the source candidate; E2E remains
credential-gated. No hosted Supabase SQL, Railway/Vercel deployment, queue,
flag, provider, or business-data mutation occurred.

The read-only hosted planner remains `review_required` at 55/66 migrations,
with eleven pending, one 12-record duplicate Purchase Order group, zero audit
rows, and missing `AUDIT_RECOVERY_TENANT_ID`. Live readiness/revision is
unchanged.

## 2026-08-02 - M3.8 Stock Receipt creation authority

Implemented the closed-by-default Stock Receipt handoff under `kurtgav`:

- Added the shared Next-to-Nest client for
  `POST /v1/inventory/stock-receipts`, strict tenant canary flags, and
  fail-closed result validation.
- Updated the inventory Server Action to normalize nullable fields, require a
  retry key only for the selected core path, and avoid direct-write fallback.
- Added a stable browser retry key to the existing receipt form without
  changing visible UI/copy. Added 31 focused contract/action tests and env docs.

Local validation: focused 31/31 tests, full Web 58 files / 348 tests, workspace
lint, Web typecheck, `git diff --check`, and production build 78/78 routes
passed. No Supabase migration, hosted SQL, Railway/Vercel deployment, flag,
queue, provider, or business-data mutation occurred. GitHub Actions run
`30739156350` passed all executable jobs on exact SHA
`3f4bca7d6a1416f751599ba268f4c0fad565a73f`; E2E remains credential-gated.

Read-only hosted planner remains `review_required`: Supabase 55/66 with eleven
pending migrations, one 12-record duplicate Purchase Order group, zero audit
rows, and missing `AUDIT_RECOVERY_TENANT_ID`. Live readiness/revision is
unchanged. Exact next action: push this source/docs candidate, inspect CI, then
re-run the planner before any provider action.

## 2026-08-02 - M3.9 Stock Receipt post/reversal authority

Implemented the smallest safe Stock Receipt workflow slice:

- Nest now exposes tenant-scoped post/reverse commands with membership and
  `inventory.post_receipt` rechecks, receipt locks, durable idempotency, the
  existing PostgreSQL posting/reversal functions, and semantic audit evidence
  in one transaction.
- Added shared contracts, Drizzle schema, and forward migration
  `20260802130000_stock_receipt_workflow_idempotency.sql`. The request table is
  forced-RLS and service-only; browser roles cannot mutate it.
- Added independent Next selectors and fail-closed clients/actions. Existing
  receipt UI/copy/layout/design remain unchanged; browser retry refs persist
  across a transient failure and reset on input change or success.

Validation:

- API: 30 files / 140 tests; Web: 58 files / 353 tests; shared: 10 files /
  123 tests. Database contract suites passed; normal DB runtime suites retain
  their explicit 137 environment-gated skips.
- Workspace lint, typecheck, production build (78/78 routes), Actionlint,
  Gitleaks, migration/release planner tests, and `git diff --check` passed.
- Disposable WSL1 lane: PostgreSQL 17, Redis 7.4.9, 67/67 migrations,
  260/260 database assertions without skips, 18/18 Nest/Redis integration
  assertions, schema SHA
  `4E8E190B0D3447F8A1819DB40427D4266F920AA47982DBDA86C6BEBCA6E22CE7`.
  One existing Redis data-loss test flaked once (`Missing key for job`) and
  passed on the immediate rerun; no source change was made for that flake.

Hosted read-only checks:

- Supabase project `aqqrtkmtcsfkbyyqxowv` is PostgreSQL 17.6.1. Connector
  ledger shows 55 applied migrations; source has 67. No migration SQL was
  executed. Aggregate duplicate-PO report is 1 group / 12 records; the owner
  still must provide `AUDIT_RECOVERY_TENANT_ID`.
- Railway `/health` and `/ready` returned HTTP 200; readiness reported
  `database=ok` and `redis=ok`. Vercel `/api/ready` returned HTTP 200 at
  revision `31c04942a93d`; the production root returned HTTP 200.
- Vercel Git remains disconnected. No hosted flag, queue, provider setting,
  business row, Supabase SQL, Railway deploy, or Vercel deploy changed.

Exact next action: add the source/docs candidate to GitHub under `kurtgav`,
inspect the single CI run, then update this log with the exact SHA/run result
before considering any hosted provider action.

## 2026-08-02 - M3.9 source push and CI evidence

Pushed commit `6121740ea2a3db189e7cc1c5e83f970db73f6b74` to
`origin/agent-02/third-code-erp-landing` under GitHub account `kurtgav`.
CI run `30740581304` passed Actionlint, secret scan, typecheck, lint, unit
tests, the PostgreSQL 17/Redis reproducibility lane, database assertions,
Nest integration, and the production build. E2E remained skipped by the
explicit hosted-credential gate.

The source migration is committed and pushed, but no Supabase SQL, Railway
deployment, Vercel deployment, feature flag, queue, provider setting, or
business data changed. Read-only hosted evidence remains Supabase 55/67
migrations, one duplicate Purchase Order group with 12 records, and missing
owner-approved `AUDIT_RECOVERY_TENANT_ID`; Railway and Vercel readiness remain
HTTP 200. Vercel Git remains disconnected to control spend.

Exact next action: re-run the read-only release planners and keep all
Stock Receipt post/reverse canaries closed. Do not apply hosted SQL or trigger
a provider build until the owner supplies the duplicate mapping, audit
recovery tenant, and explicit spend-bounded promotion approval.

## 2026-08-02 - M3.10 BOM-to-Purchase Order authority

Implemented and pushed commit
`82d9d5092d8aeebf2e803b2937914b7356ff2f21` on
`origin/agent-02/third-code-erp-landing` under GitHub account `kurtgav`.
The single-PO-from-BOM path now has a strict Nest command, tenant/RBAC and row
locks, exact cent calculations, existing-table idempotency, BOM lock, copied
line provenance, semantic audit, and a closed-by-default Next canary with a
stable browser retry key. Grouped-by-supplier creation remains legacy.

Validation:

- Focused shared/API/Web contracts: 20/20, 24/24, and 40/40 tests passed.
- Full local workspace: lint, typecheck, API 30 files / 145 tests, Web 58 /
  357 tests, shared 10 / 124 tests, Actionlint, Gitleaks, release-plan tests,
  Web 78-route production build, Nest production build, and diff checks passed.
- GitHub Actions run `30741816314` passed every executable job: Actionlint,
  unit tests, secret scan, typecheck, lint, PostgreSQL 17/Redis reproducibility
  (67/67 migrations and 260/260 DB assertions), Nest integration, and build.
  E2E was skipped by its explicit hosted-credential gate.

Hosted read-only evidence after the push:

- Supabase `aqqrtkmtcsfkbyyqxowv` is ACTIVE_HEALTHY PostgreSQL 17.6; connector
  ledger shows 55 applied migrations while source has 67. No hosted SQL ran.
- Railway `/health` and `/ready` returned HTTP 200; readiness reports
  `database=ok` and `redis=ok`.
- Vercel root, `/api/health`, and `/api/ready` returned HTTP 200 at revision
  `31c04942a93d`. Vercel Git remains disconnected for spend control; no new
  production deployment was created.
- Existing hosted blockers remain: twelve pending migrations, the recorded
  12-record duplicate Purchase Order group, and missing owner-approved
  `AUDIT_RECOVERY_TENANT_ID`. All BOM-to-PO flags and tenant lists remain
  false/empty.

Exact next action: migrate grouped-by-supplier BOM-to-PO creation only after a
separate command/idempotency design, then re-run the hosted read-only planner.
Do not apply Supabase SQL or trigger Railway/Vercel while the blockers remain.

## 2026-08-02 - M3.11 grouped BOM-to-Purchase Order authority

Implemented and pushed source commit `16b52aa9ff3bc0fe3609e1656a26e5bbe9121840`
on `origin/agent-02/third-code-erp-landing` under `kurtgav`.

Delivered: strict grouped command/result, Nest route and pipe, one
tenant-authorized multi-PO transaction, active rate-card/vendor selection,
approved budget mapping, exact cents, advisory-locked numbering, full group
idempotency replay, BOM lock/audit, fail-closed Next adapter, and stable
browser retry key. No visible wizard design or copy changed.

Validation: shared focused 21/21; API full 30 files / 150 tests; Web full 58
files / 361 tests; workspace lint/typecheck, Next 78-route build, Nest build,
Actionlint, Gitleaks, and diff checks passed. GitHub CI run `30742910106` passed
Actionlint, secret scan, lint, typecheck, unit tests, Postgres 17/Redis
reproducibility (67/67 migrations, 260/260 database assertions, Nest
integration, container smoke), and build. E2E remains credential-gated.

Release boundary: no migration, Supabase SQL, business-data change, Railway
deployment, Vercel deployment, provider setting, or canary flag changed. The
local DB integration was skipped because no local `DATABASE_URL`/integration
gate was present; CI executed it without skips. Hosted blockers and prior
readiness snapshots remain unchanged.

Exact next action: push the docs-only evidence commit, re-run read-only
Supabase/Railway/Vercel checks, and keep all grouped flags false/empty until
owner-approved duplicate mapping, audit-recovery tenant, and spend-bounded
promotion gates are clear.

## 2026-08-02 - M3.12 delivery receipt authority

Implemented the smallest next procurement authority slice. The former
`recordReceipt` Server Action can now route to Nest through
`POST /v1/procurement/deliveries/:deliveryScheduleId/receipt`; all other
delivery transitions remain unchanged.

Changed source:

- Added shared strict delivery receipt command/result contracts.
- Added Drizzle `delivery_workflow_requests` schema and migration
  `20260802140000_delivery_receipt_workflow_idempotency.sql` with tenant
  composite foreign keys, forced RLS, and service-only privileges.
- Added Nest delivery receipt pipe/controller/service, `delivery.receive`
  capability, and fail-closed API flags.
- Added the Next core selector/client and compatibility adapter. Core rejection
  or outage never falls back to a second writer. The existing panel keeps its
  visible design/copy/layout and holds one stable opaque retry key.
- Added shared, API, web client, database contract, and disposable integration
  tests plus environment coverage and examples.

Validation:

- Shared full suite: 11 files / 127 tests passed.
- Database full suite: 23 files / 129 executable assertions passed; 3 suites
  remain environment-skipped without `DATABASE_URL`.
- API full suite: 32 files / 157 tests passed. Web full suite: 59 files / 366
  tests passed.
- Workspace lint/typecheck, Nest/Web production builds (78 Next routes),
  Actionlint, Gitleaks, release-plan tests, and `git diff --check` passed.
- Delivery database integration is present but locally skipped by the explicit
  `DATABASE_URL` + `ERP_API_INTEGRATION_EXPECTED=1` gate; CI must run it in the
  disposable PostgreSQL 17/Redis lane.

Release boundary and unresolved risk:

- No Supabase SQL, hosted row, feature flag, queue, provider setting, Railway
  deployment, or Vercel deployment was performed. Vercel Git stays disconnected
  to control spend.
- Source is now 68 migrations while hosted Supabase remains 55; the recorded
  12-record duplicate Purchase Order group and missing owner-approved
  `AUDIT_RECOVERY_TENANT_ID` still block hosted release.
- Keep `ERP_DELIVERY_RECEIPT_WRITES_ENABLED`,
  `ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS`,
  `ERP_DELIVERY_RECEIPT_WRITES_VIA_API`, and
  `ERP_DELIVERY_RECEIPT_WRITES_VIA_API_TENANT_IDS` false/empty.

Exact next action: commit and push this source/docs slice under `kurtgav`, wait
for CI including the new delivery integration, re-run the read-only hosted
planner, and do not apply migration 68 or trigger Railway/Vercel until the
owner-approved data/audit blockers and spend-bounded promotion gates clear.

## 2026-08-02 - M3.12 integration correction

GitHub CI run `30744214638` exercised the new Postgres 17/Redis integration and
found a cross-tenant not-found contract defect: the workflow ledger composite
foreign key fired before the service could return `Delivery not found`. The
service now preflights the schedule inside the same transaction before claiming
the idempotency ledger, and the disposable fixture now uses a valid
other-tenant purchase order. No hosted data or provider state changed.

Validation after the correction: API full suite 32 files / 157 tests passed,
API typecheck and diff checks passed. The exact disposable integration must be
re-run by the next GitHub CI run; local Docker/Supabase is unavailable in this
workstation. Exact next action: push the correction, wait for the full CI run,
then repeat read-only hosted checks; keep migration 68 and all delivery write
flags closed.

## 2026-08-02 - M3.12 corrected CI and hosted recheck

Correction commit `29c59b5cf08db3a5004856c60c295f528a936509` is pushed under
`kurtgav`. CI `30744414270` passed the corrected delivery database integration,
all Postgres 17/Redis reproducibility checks, container smoke, Actionlint,
secret scan, lint, typecheck, and unit tests. The run is overall red only
because GitHub did not start its Build job due an account payment/spending-limit
gate; E2E was skipped after that dependency. No source failure was observed.

Read-only provider recheck: Supabase is ACTIVE_HEALTHY PostgreSQL 17.6 with
55/68 migrations; the delivery workflow ledger/types are not applied; counts
remain one duplicate PO-number group / 12 records and 662 audit rows. Railway
health/readiness are 200 with database and Redis ready. Vercel production
health/readiness are 200 at revision `31c04942a93d`, with no production runtime
errors in the last 24 hours. No Supabase, Railway, or Vercel mutation occurred.

Exact next action: obtain owner-approved duplicate mapping, an explicit
`AUDIT_RECOVERY_TENANT_ID`, and spend-bounded provider/CI authorization; then
re-run the hosted planner before applying migration 68 or deploying. Keep all
 delivery flags false/empty and Vercel Git disconnected.

## 2026-08-02 - M3.13 finance journal reversal authority

Implemented and pushed the next smallest finance authority slice. The former
`reverseJournalEntry` Server Action can now route to Nest through
`POST /v1/finance/journals/:journalEntryId/reverse`; the legacy database path
remains the default compatibility path.

Changed source:

- Added strict journal reversal body/command/result contracts, a real-calendar
  posting-date check, and Drizzle schema/migration
  `20260802150000_finance_journal_reverse_idempotency.sql` with composite
  tenant foreign keys, forced RLS, and service-only privileges.
- Added Nest reversal pipe/controller/service. It rechecks membership and
  `finance.post`, preflights same-tenant visibility before the ledger claim,
  locks the journal, calls the existing PostgreSQL reversal function, commits
  idempotency and semantic audit together, and maps known domain failures.
- Added a fail-closed Next selector/client and an opaque retry key in the
  existing journal action component. No visible UI design, copy, layout, or
  route behavior changed for default tenants.
- Added API/database/shared/web contracts and integration coverage plus env
  examples and observability labels. Captured current production landing
  desktop/mobile evidence under `docs/design-references/` and refreshed the
  clean-room behavior/topology records.

Validation:

- Shared: 11 files / 129 tests passed.
- Database: 24 files / 131 executable assertions passed; 3 environment-gated
  suites remain skipped without `DATABASE_URL`.
- API: 34 files / 165 tests passed. Web: 59 files / 368 tests passed.
- Workspace typecheck/lint, Nest build, Next production build (78 routes),
  release-plan tests, Actionlint, Gitleaks, and `git diff --check` passed.
- The new journal-reversal database integration is present but locally skipped
  by the explicit `DATABASE_URL` + `ERP_API_INTEGRATION_EXPECTED=1` gate.

Release boundary and unresolved risk:

- Commit `441ec74c0c776022c2a41485ff45ae2907dbb3ef` is pushed to
  `origin/agent-02/third-code-erp-landing` as `kurtgav`.
- GitHub CI run `30745515593` failed before any job step because account
  payments/spending-limit state blocked Actionlint; all other jobs skipped.
  It is not executable source evidence. Local gates above are the current
  verified source evidence.
- No Supabase SQL, hosted rows, feature flag, queue, provider setting,
  Railway deployment, Vercel deployment, or Vercel Git connection changed.
  Source now has 69 migrations; hosted Supabase remains at 55, with the
  duplicate-PO and audit-recovery blockers unresolved.
- Keep the four journal-reversal flags false/empty and keep Vercel Git
  disconnected. Do not apply migration 69 or trigger Railway/Vercel while the
  hosted planner, exact SHA, rollback, and spend gates are not clear.

Exact next action: obtain the owner-approved duplicate Purchase Order mapping
and canonical `AUDIT_RECOVERY_TENANT_ID`, restore GitHub Actions billing
authorization, then rerun the exact-SHA CI/database lane and the read-only
Supabase/Railway/Vercel planner. Only a clear planner plus explicit
spend-bounded provider approval can authorize one hosted migration and one
production action.

## 2026-08-02 - M3.16 delivery cancellation authority

Implemented the next smallest procurement slice: delivery cancellation now has
a strict shared command/result contract, a NestJS route, and an atomic
PostgreSQL authority path behind closed-by-default tenant gates. The existing
delivery action remains the compatibility adapter for unselected tenants;
selected core failures fail closed. One opaque idempotency key is reused for
exact replay, and the transaction locks membership, schedule, and workflow
ledger before committing cancellation evidence, semantic audit, and replay.

Changed source:

- Added `cancel_delivery` to the delivery workflow enum and migration
  `20260802180000_delivery_cancel_workflow.sql`, including nullable
  `cancelled_at`, `cancelled_by`, `cancellation_reason`, and the tenant
  composite foreign key.
- Added the Nest cancellation pipe/controller/service/module wiring, strict
  config gates, request observability label, and unit/integration coverage.
- Added the Next core client/selector and fail-closed Server Action seam. The
  existing panel now supplies one stable opaque cancel retry key; visible UI,
  copy, layout, and design remain unchanged.
- Added shared/database migration contracts and environment documentation.

Validation:

- Shared: 11 files / 135 tests passed.
- Database: 27 files / 136 passed; 137 assertions skipped by three explicit
  environment-gated suites.
- API: 34 files / 191 serial tests passed. Web: 59 files / 383 tests passed.
- Workspace typecheck/lint, Nest and Next production builds (78 routes),
  release-plan tests, Actionlint, Gitleaks, and `git diff --check` passed.
- The guarded delivery database integration was explicitly invoked and
  skipped because `DATABASE_URL` and `ERP_API_INTEGRATION_EXPECTED=1` were not
  supplied.

Release boundary and unresolved risk:

- Commit `e8d4a6c181358756879435a76e8bd5a9317cc751` is pushed to
  `origin/agent-02/third-code-erp-landing` as `kurtgav`.
- GitHub CI run `30749461755` failed before any executable step because recent
  account payments failed or the spending limit must be increased; every other
  job was skipped. It is not source-test evidence.
- No Supabase SQL, hosted rows, feature flag, queue, provider setting,
  Railway deployment, Vercel deployment, or Vercel Git connection changed.
  Source now has 72 migrations; hosted Supabase remains at 55. The duplicate
  Purchase Order and audit-recovery blockers remain unresolved.
- Keep all delivery cancellation, inspection, receipt, and finance-reversal
  flags false/empty. Do not apply migration 72 or trigger Railway/Vercel while
  the hosted planner, exact SHA, rollback, integration, and spend gates are not
  clear.

Exact next action: obtain the owner-approved duplicate Purchase Order mapping
and canonical `AUDIT_RECOVERY_TENANT_ID`, restore GitHub Actions billing
authorization, provide the disposable Postgres/Redis environment, then rerun
the exact-SHA CI/database lane and read-only Supabase/Railway/Vercel planner.
Only a clear planner plus explicit spend-bounded provider approval can
authorize one timestamp-ordered hosted migration and one production action.

## 2026-08-02 — M3.15 delivery inspection completion authority

Implemented the smallest follow-on procurement slice: inspection completion
now has a strict shared command/result contract, a dedicated NestJS route, and
an atomic PostgreSQL authority path behind closed-by-default tenant gates.
The compatibility action keeps the existing browser behavior for unselected
tenants; selected tenants fail closed if the core route fails. The opaque
idempotency key is reused for exact replay, and the transaction locks the
tenant membership, delivery schedule, latest pending inspection, and workflow
ledger before committing the inspection result, parent delivery state,
semantic audit, and replay result together.

Changed source:

- shared delivery contracts and tests;
- `delivery_workflow_action` enum plus migration
  `20260802170000_delivery_inspection_complete_workflow.sql`;
- Nest pipe, controller, service, module wiring, config, observability, and
  unit/integration tests;
- Next compatibility client/action and the existing panel's opaque retry key;
- environment documentation and release-plan contract coverage.

Validation:

- Shared 133 tests, database 135 executable assertions (3 guarded suites
  skipped), Web 378 tests, and API 182 serial tests passed.
- Typecheck, lint, Nest/Web production builds, release-plan tests, Actionlint,
  Gitleaks, and `git diff --check` passed.
- The guarded delivery database integration was explicitly invoked and
  skipped: no `DATABASE_URL` plus `ERP_API_INTEGRATION_EXPECTED=1` was
  present.

Release boundary and unresolved risk:

- Commit `67beedab53680238f785e0947d90588eedd71e3e` is pushed to
  `origin/agent-02/third-code-erp-landing` as `kurtgav`.
- GitHub run `30748096044` failed before any executable step; every other job
  was skipped. The external account payment/spending-limit gate remains
  unresolved, so hosted CI is not source-test evidence.
- No Supabase SQL, hosted rows, feature flag, queue, provider setting,
  Railway deployment, Vercel deployment, or Vercel Git connection changed.
  Source now has 71 migrations; hosted Supabase remains at 55. The duplicate
  Purchase Order and audit-recovery blockers remain unresolved.
- Keep all inspection-start and inspection-completion flags false/empty. Do
  not apply migration 71 or trigger Railway/Vercel while the hosted planner,
  exact SHA, rollback, integration, and spend gates are not clear.

Exact next action: obtain the owner-approved duplicate Purchase Order mapping
and canonical `AUDIT_RECOVERY_TENANT_ID`, restore GitHub Actions billing
authorization, provide the disposable Postgres/Redis integration environment,
then rerun the exact-SHA CI/database lane and read-only Supabase/Railway/Vercel
planner. Only a clear planner plus explicit spend-bounded provider approval
can authorize one hosted migration and one production action.

## 2026-08-02 - M3.14 delivery inspection-start authority

Implemented and pushed the next smallest delivery authority slice. The
existing `startInspection` Server Action can now route to Nest through
`POST /v1/procurement/deliveries/:deliveryScheduleId/inspection/start`; the
legacy direct path remains the default compatibility path.

Changed source:

- Added strict empty-body/result contracts, the `start_inspection` enum value,
  and migration `20260802160000_delivery_inspection_start_workflow.sql`.
- Added Nest pipe/controller/service. It rechecks tenant membership and
  `delivery.receive`, preflights visibility, locks a received schedule,
  inserts the pending inspection, transitions the schedule, stores one exact
  replay result, and writes semantic audit in one PostgreSQL transaction.
- Added fail-closed API/Next selectors and env examples. The existing panel
  keeps one opaque retry key; visible copy, layout, route topology, and design
  remain unchanged.
- Added shared/database/API/Web unit and integration coverage plus an
  observability label for the new route.

Validation:

- Shared 131 tests, database 133 executable assertions (3 guarded suites
  skipped), API 173 serial tests, and Web 373 tests passed.
- Typecheck, lint, Nest/Web production builds, release-plan tests, Actionlint,
  Gitleaks, and `git diff --check` passed.
- The guarded delivery database integration was explicitly invoked and
  skipped: no `DATABASE_URL` plus `ERP_API_INTEGRATION_EXPECTED=1` was present.

Release boundary and unresolved risk:

- Commit `08567b8b4b529f43126925ff67df132e15f71818` is pushed to
  `origin/agent-02/third-code-erp-landing` as `kurtgav`.
- GitHub run `30746647147` failed before any executable step; every other job
  was skipped. This is not source-test evidence; the external account
  payment/spending-limit gate remains unresolved.
- No Supabase SQL, hosted rows, feature flag, queue, provider setting,
  Railway deployment, Vercel deployment, or Vercel Git connection changed.
  Source now has 70 migrations; hosted Supabase remains at 55, with the
  duplicate-PO and audit-recovery blockers unresolved.
- Keep all four inspection-start flags false/empty. Do not apply migration 70
  or trigger Railway/Vercel while the hosted planner, exact SHA, rollback,
  and spend gates are not clear.

Exact next action: obtain the owner-approved duplicate Purchase Order mapping
and canonical `AUDIT_RECOVERY_TENANT_ID`, restore GitHub Actions billing
authorization, then rerun the exact-SHA CI/database lane and the read-only
Supabase/Railway/Vercel planner. Only a clear planner plus explicit
spend-bounded provider approval can authorize one hosted migration and one
production action.

## 2026-08-02 - M3.16 final provider recheck

Read-only provider checks after the source/docs push are green for the current
hosted baseline, but not a promotion approval:

- Supabase project `aqqrtkmtcsfkbyyqxowv` is `ACTIVE_HEALTHY`, PostgreSQL
  17.6.1.121 in `ap-northeast-2`. The migration ledger is still 55 applied,
  latest `20260729233017` / `notification_outbox_foundation`; the source has
  72 migrations. `cancel_delivery` and all three cancellation columns are
  absent, the workflow ledger is absent, and the known duplicate/audit counts
  remain one group / 12 rows and 662 audit rows.
- Railway health and readiness are HTTP 200: database and Redis both report
  `ok` at `third-code-erp-api-production.up.railway.app`.
- Vercel project `thirdcode-erp` remains on the prior production deployment
  `dpl_Htv5nb1A8oHbtowQpmrToYQgxDDL`; `/` and `/api/ready` are HTTP 200 and
  the readiness revision remains `31c04942a93d`. Runtime errors in the last
  24 hours: none. The newest listed preview is older source, not the M3.16
  SHA; no deployment was triggered by this turn.
- Branch `agent-02/third-code-erp-landing` is clean and remote at docs commit
  `05ffb00025fa42b9384257d9ebeead388c7a3b49`; the reviewed source commit is
  `e8d4a6c181358756879435a76e8bd5a9317cc751`.
# M3.39 - Durable project-create idempotency (2026-08-04)

- Scope: make the guarded Nest project-create seam safe under retries without
  changing the default Next Server Action path.
- Changed: `supabase/migrations/20260804090000_project_create_idempotency.sql`;
  Drizzle enum/table/index/FK schema; Nest controller/service request-hash,
  claim, lock, replay, conflict, completion, and audit path; API/database
  tests; Next form hidden key and core-client header; changeset/docs.
- Source commit: `b77227df402082d494538b92d706f7f092fa1fe5`.
- Validation: focused API 13/13; database contract 3/3; web core adapter
  72/72; disposable PostgreSQL 17 + Redis 87/87 migrations, database 306/306
  with zero skips, API integration 15 files / 22 tests; serial workspace
  shared 162/162, web 438/438, API 294/294 (ordinary database environment
  skips); lint, typecheck, `git diff --check`, and build 78/78 pages.
- Runtime notes: only the disposable Redis overcommit warning appeared.
  Hosted Supabase stayed at its read-only 55-row prefix. The connector
  rejected the first real source migration with `INVALID_ARGUMENT`; two
  temporary no-op probe migration rows/table were created only to validate
  connector behavior, then removed and rechecked (55 rows, zero probe rows,
  no probe table). No net hosted SQL/data/schema, Storage, Railway variable,
  Vercel build, or promotion changed.
- Unresolved: source is 87 migrations vs hosted 55; provider catalog/data/RLS/
  Storage diff, backup/restore, supported ordered-apply path, duplicate/audit
  recovery, and spend-bounded canary approval remain open. Supabase also
  reports a pre-existing `MIGRATIONS_FAILED` branch state. Both project-create
  flags are false/empty.
- Exact next action: reconcile the hosted target against an approved clone and
  backup, then prepare one reviewed canary only after owner/provider/spend
  gates clear.
