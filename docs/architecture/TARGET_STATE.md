# Target State

Third Code ERP remains an incremental TypeScript system. The target is a
modular monolith, not a rewrite and not a microservice fleet.

Release evidence policy (rechecked 2026-08-03): provider readiness is only a
necessary signal. A production promotion also requires an exact source SHA,
complete ordered migration ledger, duplicate-record decision, audit-chain
tenant approval, disposable integration evidence, rollback evidence, and a
spend-bounded provider action. Railway identity, project/service/environment,
source deployment, and basic PostgreSQL/Redis readiness are verified as
`kurtgav`; protected-flow, migration, rollback, and spend evidence is still
required. Keep Vercel Git deployment disabled and avoid preview builds while
those gates are incomplete.

## M3.78 Disposable replay evidence (2026-08-05)

Promotion requires a clean, no-skips source replay before any hosted database
action. The repository lane now proves all 90 migrations apply in order on
PostgreSQL 17, Redis 7.4.9 is available for queue integration, all 108
database suites/311 tests pass, and schema-before/schema-after hashes match.
The test contract explicitly separates the normal zero-balance deactivation
guard from the legacy inactive-Warehouse reversal allowlist.

This closes the local replay gate only. Supabase is still an exact 55/90
prefix with 35 pending migrations and the source-only command ledger/indexes
absent; backup/export, clone catalog/data/RLS reconciliation, owner mapping,
rollback proof, protected browser evidence, and a spend cap remain required.
No migration flag or Vercel action may be enabled from this evidence alone.

## M3.77 Stock Movement posting/reversal command seam (2026-08-05)

Posting and reversal now have an original NestJS command seam while the
existing database functions remain the transaction authority. The API must
derive tenant/actor from the verified principal, require
`inventory.post_movement`, serialize the tenant membership and movement rows,
claim a request-hash idempotency key in a forced-RLS service-only ledger, call
the existing database function, complete the result, and append semantic
audit evidence in one transaction. The strict shared result envelope keeps
movement/journal identifiers exact.

Adoption requires both
`ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_VIA_API=true` with a strict tenant UUID
allowlist in Next and
`ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_ENABLED=true` with the matching
API allowlist. Both remain false/empty, so the legacy Server Actions remain
the compatibility path and no browser write is cut over. Source SHA
`7f19315b967f81e120fa64bebc95ed338c4ad2cb` is live on Railway as successful
deployment `5320235d-c242-4b3c-8b24-c8de9e1cd8cd`; `/ready` and `/health` are
200 and unauthenticated post/reverse are 401. Supabase is read-only at 55/90
with 35 migrations pending; no hosted schema/data or Vercel action is
implied. Rollback is the disabled flags or prior API deployment.

## M3.75 Stock Movement draft creation authority (2026-08-05)

Stock Movement draft creation is a transactional Nest command, not a browser
database write. The command derives tenant and actor from the verified
principal, rechecks `inventory.manage`, validates the database-matching
Warehouse/Project/Item/Cost Code rules, uses exact integer conversions, claims
and replays a tenant-scoped idempotency key, creates the draft and lines, and
writes an audit event before commit. Posting and reversal stay in their
existing database workflows until their own seams are verified.

Next adoption requires both
`ERP_INVENTORY_STOCK_MOVEMENT_CREATE_VIA_API=true` with a strict tenant UUID
allowlist and the API-side
`ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_ENABLED=true` with the same
allowlist. Both remain disabled/empty. Source SHA
`3b920185fdc438dfc5dd5972f738ea9e0a1d7e30` is Railway deployment
`e231fe1f-bd37-4e68-bef9-a2d26e0c1061`; readiness/health are 200 and the
unauthenticated command boundary is 401. Supabase is read-only at 55/89 with
34 migrations pending; no Vercel deployment is implied.

## M3.76 Hosted catalog verifier hardening (2026-08-05)

The release verifier treats server-only command ledgers as first-class
catalog evidence. It now checks the Stock Movement idempotency table for
forced RLS, no anon/authenticated privileges, service-role authority, and
valid tenant/key/state indexes. The hosted read-only result remains non-ready
while the ordered ledger is 55/89: baseline catalog/RLS/security checks pass,
while the new table/indexes are absent until the pending suffix is safely
replayed. A clean PostgreSQL 17 disposable replay remains required; provider
and Vercel actions stay closed.

## M3.74 Stock Movement detail read authority (2026-08-05)

Stock Movement detail is a read-only Nest authority. It must return one
tenant-scoped movement header plus bounded line and ledger evidence, require
`inventory.read`, normalize timestamps to an explicit UTC ISO contract, and
keep quantities/money exact across the API boundary. Next adoption is
independent from the register gate:
`ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_VIA_API=true` plus a strict tenant
UUID allowlist. The compatibility query remains the default until protected
browser canary, rollback, and hosted migration parity are approved. Existing
post/reverse/delete actions remain outside this read seam.

Source SHA `a693e15fafc4b4b5d2df4f3fd6bef6f72015d702` is live on Railway as
successful deployment `a62a237e-2a82-4a40-88ca-2354011d3c9d`; `/ready` and
`/health` are 200 and unauthenticated detail access is 401. Supabase is
read-only at 55/88 with 33 source migrations pending; no Vercel deployment is
implied.

## M3.73 Inventory Stock Movement register read (2026-08-05)

Stock Movement discovery is a read-only Nest authority with a strict shared
envelope. It must derive tenant scope and actor from the verified principal,
require `inventory.read`, bound filters/page size, and preserve money as exact
integer strings. The Next page may adopt it only through
`ERP_INVENTORY_STOCK_MOVEMENT_READS_VIA_API=true` plus a strict tenant UUID
allowlist; the compatibility read remains the default until a protected
tenant canary, rollback evidence, and hosted migration parity are approved.
The route does not approve, post, reverse, or otherwise mutate ERP state.

Source SHA `9d3cf5ed179f24c0382ecd7b53b9b94f87812578` is live on Railway as
successful deployment `4cbaefcf-82a4-4549-83f4-2bfa094fcebb`; `/ready` and
`/health` are 200 and the unauthenticated route is 401. Supabase is read-only
at 55/88 with 33 source migrations pending; no hosted schema/data or Vercel
deployment is implied.

## M3.72 Inventory Warehouse deactivation integrity boundary (2026-08-05)

Warehouse state authority must reject deactivation while its tenant-scoped
ledger balance is nonzero. Nest performs the balance check inside the same
transaction after locking the tenant Warehouse and emits no update or audit on
conflict. The forward-only database contract repeats that invariant at the
database boundary and uses a compatible Warehouse share lock on ledger writes;
only explicit receipt/movement reversal events can write to an inactive
Warehouse. This migration remains source-only until the hosted migration ledger
is reconciled and replayed safely. The exact flags stay disabled, and the Next
Server Action remains the compatibility path.

Source SHA `f391f49d0aa002101649afa79dfc75872120df72` is live on Railway as
successful deployment `48cc2b18-1c5d-45eb-b59d-b54571fe673c`; `/ready` and
`/health` are 200 and unauthenticated protected routes return 401. Supabase is
read-only at 55/88 (33 source migrations pending); no Vercel deployment or
hosted schema/data action is implied.

## M3.71 Inventory Warehouse closeout/readiness read (2026-08-05)

Warehouse deactivation decisions now have a narrow Nest read authority. The
strict result reports exact bigint quantity/value strings, tenant identity,
active state, and an explicit disposition. Nest derives tenant and actor from
the verified principal, rechecks `inventory.manage`, locks the tenant rows,
and aggregates only that Warehouse's ledger entries. It is read-only; no
approval or state mutation is delegated to the browser. The Next adapter is
behind an exact flag and tenant allowlist, both disabled. Source SHA
`425c66a757ffa66cd4dfefca2079ebfd61fb3bbf` is live on Railway as successful
deployment `1ee3706a-5ef3-4004-9708-ac3efcad5483`; readiness and health are
200 and the unauthenticated closeout route is 401. No hosted schema/data or
Vercel deployment is implied.

## M3.70 Inventory Warehouse update/deactivation command boundary (2026-08-05)

Inventory setup now has a narrow Warehouse state authority in Nest. The
command accepts only a trimmed name and explicit active boolean; Warehouse
code and project scope remain immutable identity fields once stock evidence
exists. Nest derives tenant and actor from the verified principal, rechecks
`inventory.manage` inside one transaction, locks the tenant row, makes the
state setter idempotent, and audits the before/after state. Next adoption stays
behind an exact flag plus tenant allowlist, with the direct Server Action as
compatibility path. Source SHA
`4737fec37f97360f8c3ffe6bc98f0bdc78a4cdf5` is live on Railway as successful
deployment `382d281a-b022-4296-8b9d-ee84a07c80b1`; readiness and health are
200 and both unauthenticated Warehouse write routes return 401. No hosted
schema/data or Vercel deployment is implied.

## M3.69 Inventory Warehouse creation command boundary (2026-08-05)

Inventory setup now includes a narrow Warehouse creation authority in Nest.
The command accepts only code, name, and nullable project scope; derives tenant
and actor from the verified principal; rechecks `inventory.manage` inside one
transaction; verifies project tenant ownership; enforces tenant-scoped
uniqueness; and audits the create. Next adoption stays behind an exact flag
plus tenant allowlist, with direct Server Action behavior as compatibility
path. Source SHA `7b0ccf1d9dda19a61d8f2c26ead42b562b6f2534` is live on Railway as
successful deployment `fbbda042-9b51-4c21-a518-a6e4c2fb2752`; readiness and
health are 200 and the unauthenticated Warehouse route returns 401. No hosted
schema/data or Vercel deployment is implied.

## M3.68 Inventory UOM creation command boundary (2026-08-05)

Inventory setup now has a narrow UOM creation authority in Nest. The command
accepts only code, name, and decimal precision; derives tenant and actor from
the verified principal; rechecks `inventory.manage` inside one transaction;
enforces tenant-scoped uniqueness; and audits the create. Next adoption stays
behind an exact flag plus tenant allowlist, with direct Server Action behavior
as compatibility path. Source SHA `ae6d7992ebdfcb0439f181ecdcd72b9cb8673c2b`
is live on Railway as successful deployment
`5ffd0087-7951-4111-92b6-72293cadef14`; readiness and health are 200 and the
unauthenticated UOM route returns 401. No hosted schema/data or Vercel
deployment is implied.

## M3.66 Inventory summary authority seam and read-only ledger (2026-08-05)

The safe inventory slice is now implemented as a tenant-scoped Nest summary
read. It returns strict shared types, exact bigint money/quantity strings,
bounded collections, explicit `inventory.read`, repeated tenant predicates,
and no browser write authority. Next adoption remains disabled behind an
exact flag and tenant allowlist; the existing inventory page is the
compatibility path. Source SHA `4da9772516f80255a2cb4adbe376d4ca733513e4`
is live on Railway as successful deployment
`6ba50aba-0f58-4f02-b7b4-655b3e71a70f`; readiness is 200 and the protected
route returns 401 without a principal. The hosted migration ledger remains
read-only at 55/87 until recovery/export, dependency audit, owner mapping,
and disposable PostgreSQL 17 replay gates are complete. Vercel remains
deployment-disabled for this slice.

## M3.67 Inventory item policy command boundary (2026-08-05)

The target authority now includes a narrow, transactional item-policy command:
tenant membership and `inventory.manage` are rechecked in Nest, active UOM and
material item rows are locked within one transaction, stock identity remains
database-guarded, and semantic audit records the change. The command is an
idempotent state setter and remains fail-closed behind an exact flag and tenant
allowlist. The Next direct server action is the compatibility path. Source SHA
`8a0c059826aabf3b0711277c68f1b182db46aa25` is live on Railway as successful
deployment `19b808c7-f07c-40f3-a268-df35aaf86071`; `/ready` and `/health` are
200, unauthenticated inventory summary is 401, and startup logs map the
command route. No hosted schema/data or Vercel deployment is implied.

## M3.65 CRM opportunity detail graph boundary (2026-08-05)

Opportunity detail reads move toward Nest authority through a strict,
tenant-scoped `GET /v1/crm/opportunities/:opportunityId` envelope. The route
requires a verified principal and explicit `opportunity.read`, repeats tenant
predicates on account/project joins and progress subqueries, and returns
bounded current-state aggregates for PPRF, inspections, designs, and change
requests. Next adoption remains exact-flag plus tenant-allowlist gated and
fails closed on identity drift; the hardened direct server-side read remains
the compatibility path. No schema, hosted-data, or frontend-provider action is
implied.

## M3.64 CRM KYC queue authority boundary (2026-08-04)

Pending-KYC account queues move toward Nest authority through a strict,
tenant-scoped `GET /v1/crm/accounts/kyc-queue` envelope. The route requires
`account.kyc_review`, repeats the tenant predicate on account and artifact
joins, caps results at 200, orders deterministically, and returns a separate
scoped total. Next adoption remains exact-flag plus tenant-allowlist gated and
fails closed on tenant identity drift; direct server-side reads remain the
compatibility path. No schema, hosted-data, or frontend-provider action is
implied.

## M3.63 CRM account detail graph boundary (2026-08-04)

Account detail reads move toward Nest authority through a strict, bounded
graph envelope. The contract requires a verified principal, explicit
`account.read`, repeated account and tenant predicates on every child query,
document joins scoped to the same tenant, capped child collections, and a
separate tenant-scoped opportunity count. Next adoption remains exact-flag plus
tenant-allowlist gated; every nested identity is validated and mismatches fail
closed. The existing direct server-side query remains the default. This is a
read-only seam: no schema, data, or hosted provider action is implied.

## M3.62 CRM account collection read boundary (2026-08-04)

CRM account collections move toward Nest authority through a shared, strict
read envelope. The Nest contract requires a verified principal, explicit
`account.read`, repeated `tenant_id` scope, bounded query filters, allowlisted
sort columns, deterministic page/limit pagination, and opportunity counts.
Next adoption remains exact-flag plus tenant-allowlist gated and fails closed
on tenant or pagination identity drift; the compatibility DB query remains the
default. No database schema/data action or frontend deployment is implied.

## M3.61 Project update audit boundary (2026-08-04)

Nest project updates must write their semantic before/after diff through the
existing append-only audit chain inside the same transaction as the
tenant-scoped optimistic-concurrency update. The response must pass the shared
`projectUpdateResultSchema`. Next may adopt the authority only through the
existing exact project-write flag and tenant allowlist; direct compatibility
writes remain the default until protected canary evidence exists.

## M3.60 Project collection read boundary (2026-08-04)

The Projects collection must be readable through a stable Nest contract before
the browser can migrate off direct database queries. The contract requires a
verified principal, `project.read`, repeated tenant predicates, bounded
filters, allowlisted sort columns, deterministic pagination, and a shared
result envelope. The Next canary must validate tenant and pagination identity
and fail closed on mismatch or unavailable authority.

The source slice is complete and its API source SHA is live on Railway with
readiness and authorization-boundary evidence. The flag remains disabled. No
frontend build or hosted data action is implied; canary activation still
requires protected browser, rollback, exact deployment, and spend evidence.

## M3.59 Nest Redis dependency boundary (2026-08-04)

Redis transport must be owned by one global Nest module that exports the shared
`REDIS_CLIENT` token. Health checks, quotas, locks, and future queue workers
import that boundary instead of relying on providers declared in the root
module. The module owns one lifecycle and keeps Redis accounting separate from
PostgreSQL ERP authority.

The source fix is not a release claim until the exact Railway deployment passes
build, startup, `/ready`, and `/health` checks. Keep frontend deployment and
paid Vercel builds closed.

## M3.58 Project detail read target (2026-08-04)

Project detail reads may move from the Next compatibility query to Nest only
through an exact flag plus tenant UUID allowlist. Nest must derive the caller
from the verified Supabase principal, require the explicit `project.read`
capability, repeat `project_id` and `tenant_id` predicates, and serialize a
stable shared read model. The Next adapter must reject mismatched identity or
tenant data and must not silently fall back to a different authority when the
canary is enabled. Default behavior remains unchanged until protected browser,
deployment identity, rollback, and spend evidence are recorded.

## M3.57 Auth-session recovery target (2026-08-04)

Stale or revoked Supabase refresh tokens must be recoverable at the middleware
boundary without turning public requests into 500s or weakening authorization.
Recognized refresh-token failures clear only Supabase auth-cookie chunks,
continue as anonymous, and let the existing protected-route redirect enforce
access. Unknown auth/provider failures remain visible for diagnosis.

The source slice adds this boundary without database writes or new provider
calls. Future release evidence must repeat the stale-cookie redirect test on
the exact deployed frontend while preserving the spend gate.

## M3.55 Provider spend guard target (2026-08-04)

Provider-backed requests must have explicit, route-aware burst protection. The
edge guard may fail closed for short bursts while preserving existing payload
contracts and read-only deterministic fallbacks. It must report scope and
limit through standard rate-limit headers without exposing secrets.

This source slice is complete in `4d190dfd`. It is intentionally per-instance;
the target architecture moves authoritative quotas and locks to shared Redis
behind NestJS, with tenant/user dimensions, retry-safe accounting, metrics, and
an operator-visible spend budget. Do not claim global enforcement from the
current edge map.

## M3.56 Shared Redis provider quota target (2026-08-04)

Provider-backed Next routes should hand off only a bounded bucket identity to an
authenticated NestJS quota seam. Nest must derive tenant/user scope from its
verified principal, keep provider policy server-owned, and use an atomic Redis
operation with expiry. A blocked decision must carry standard retry/limit/scope
headers; a Redis/API failure must fail closed before external provider work.

Source `M3.56` implements this seam behind an exact per-tenant canary flag. The
flag is false/empty by default, so source publication does not activate it.
Redis remains accounting/lock transport, never ERP transaction authority;
PostgreSQL transactions and audit records remain authoritative for business
state. Later milestones add operator budgets, metrics, and idempotent spend
ledger reconciliation without putting secrets or business content in Redis.

## M3.54 Cortex command-palette source target (2026-08-04)

The global palette should be a low-cost entry point to the permissioned Cortex
brain without turning search into an AI or transaction surface. Search records
remains the default path. Only an explicit Ask Cortex mode may query the
bounded graph, and only registry-approved nodes with canonical links may be
opened. The final Ask Cortex action must remain a user-confirmed draft handoff;
sending and ERP authority stay inside the protected Cortex flow.

The source slice is complete in `6c975261`. Keep the request debounce,
abort/stale-response guards, 20-hit server cap, tenant/role scope, and no-
provider boundary. A future authenticated visual proof may use a disposable
tenant only after credential handling, spend approval, and release gates are
explicitly satisfied.

## M3.53 Clean-room runtime branding target (2026-08-04)

All product-facing runtime text and metadata should be independently branded
as Third Code ERP. The regression boundary covers web, API, and package source
without conflating research/provenance documentation with shipped product
surface. Live release checks must repeat marker, metadata, responsive, and
console validation; no frontend build is implied while Vercel spend remains
closed.

Source `0c911f8` adds the expanded guard and evidence record. It does not
rename migration files or erase research references, because doing so would
damage database history and clean-room traceability.

## M3.52 Cortex operational brief presentation target (2026-08-04)

The Cortex page should give an authorized operator a calm, dense, source-first
knowledge pulse: recent records with freshness and canonical links, a visible
permission scope, and provenance/connection counts. The UI is responsive at
desktop, tablet, and mobile widths, keyboard navigable, and reduced-motion
safe. Registry filtering stays in the server-side presentation model so an
unknown graph source cannot become a browser link.

The source panel is complete in `1e5aa4d`; it remains a read-only capability.
No hosted migration, AI call, Python finalization, or frontend provider action
is implied. Keep Vercel Git deployment disabled and require an explicit,
spend-approved frontend release with exact-SHA/browser evidence before any
public UI claim.

## M3.51 Cortex operational brief target (2026-08-04)

Cortex should give every authorized operator a small, source-backed pulse of
what the knowledge graph knows now: recent records, freshness, provenance
coverage, graph counts, and links back to the canonical ERP surface. The
brief is always tenant- and role-scoped, bounded to a small server-enforced
limit, and read-only. AI may explain the evidence later, but it cannot approve
or finalize ERP transactions.

The source contract is now present without a database migration. Hosted rollout
still requires the same ordered migration, duplicate-record, rollback, and
spend gates; source availability is not a production deployment claim.

Source `cfffa7a` is present on both target branches; the exact GitHub/Railway
check is successful and live Railway readiness is healthy. Vercel created no
deployment after the push, and Supabase remains at the 55-migration boundary.

## M3.50 cost and migration safety target (2026-08-04)

Every release must be spend-bounded as well as technically green. Vercel Git
deployment stays disabled and no preview is created by default; a frontend
promotion requires one explicitly approved build with a known rollback. A
source push alone is not frontend production evidence.

The database target must reach the ordered source head only after a supported
recoverable backup, dependent-row/audit export, and owner-approved decision for
the 12 duplicate Purchase Order records. Read-only planners are mandatory
before any apply. They must report a linear ledger, PostgreSQL 17, no
duplicate blocker, and a reviewed migration risk set. No manual SQL, migration
history edits, or out-of-order suffix apply is an acceptable shortcut.

## M3.49 supplier confirmation review target (2026-08-04)

Suppliers can review an issued Purchase Order through a token-scoped,
least-privilege page that is readable on desktop and mobile and offers three
explicit decisions. The page is a presentation surface only: the Nest
controller owns tenant/session/expiry checks, idempotency, state transitions,
transactions, and audit. Already answered, revoked, expired, invalid, and
unavailable links are read-only or fail closed without leaking internal IDs or
token material.

The read flag and tenant allowlist stay false/empty until the hosted session,
line-item, and replay schema is reconciled and the disposable cross-tenant,
expiry, revocation, replay, rollback, provider, and spend evidence is complete.
The source milestone is therefore not a production capability claim.

Source `386fd2a` is present on both target branches and the Railway API
deployment succeeded with healthy `/ready` and `/health` responses. The public
read probe remains `503` by design. Vercel produced no deployment, and
Supabase remains at the 55-migration boundary with the duplicate-PO preflight
failure; these provider facts do not promote the portal to Live.

## M3.48 landing GEO target (2026-08-04)

The public surface has a single canonical, machine-readable product graph:
organization -> website -> landing page -> Third Code ERP software, with FAQ
answers attached to the page. Keep the graph derived only from public copy and
stable IDs; never expose tenant records, authenticated search URLs, or inferred
capabilities. Preserve the existing visual landing design while validating the
HTML output and legacy-brand absence in production-server checks.

Source validation is green: focused 5/5, Web 67/451, workspace lint/typecheck,
diff check, and 79/79-route build. This does not authorize a hosted DB replay or
a paid Vercel deployment. Supabase duplicate-PO and Vercel spend gates remain
closed.
Post-push source evidence: `ce1ae6e` is on both target branches, the exact
GitHub Railway check is successful, Railway safely skipped the API service,
and its live readiness remains 200. Vercel reports no deployment after the
push and the public URL is still the previous release; do not present the new
GEO graph as production until a spend-approved deployment path exists.

## M3.47 proposal read target (2026-08-04)

Every proposal read must repeat both the opportunity identity and the caller's
tenant identity. Related rows and nullable joins cannot trust a UUID alone.
This is a query-level defense-in-depth rule; server actions, RLS, and Nest
authority remain responsible for official writes and state transitions.

Source validation is green: focused 2/2, Web 66/450, workspace lint/typecheck,
diff check, and 79/79-route build. No hosted migration is needed. Keep Vercel
Git disconnected and spend-protected, and keep Supabase mutation flags closed.
Post-push source/docs `5a5e525` are on both branches. GitHub/Railway status is
successful with a safe Railway skip and live readiness 200; Vercel has no new
deployment. Supabase remains non-ready for ordered replay: 55 migrations,
branch API `MIGRATIONS_FAILED`, and the last successful logs read shows the
duplicate-PO `P0001` preflight failure. A later logs request returned
`INVALID_ARGUMENT`; it is not treated as success.

## M3.46 universal command palette target (2026-08-04)

Search and Ask Cortex share one calm, keyboard-first entry point. The input
owns the combobox state, results expose stable active descendants, and the
palette wraps navigation without opening a dead or stale destination. New
terms clear old results and late network responses are ignored. This remains a
read/navigation surface; existing server-side tenant and permission checks
stay authoritative.

Source validation is green at `e3dc6d6`: focused 7/7, Web 66/450, workspace
lint/typecheck, diff check, and 79/79-route production build. Authenticated
browser proof remains a provider-runtime gate. Keep Vercel Git disconnected
and spend-protected, do not apply hosted SQL, and do not promote a
source-only palette change as production-deployed evidence.
Source/docs `0a085b7` is present on both target branches. GitHub's Railway
check is successful, but Railway correctly skipped the commit because its API
watch set did not change; live readiness remains 200. Vercel reports no
deployment for this SHA, intentionally preserving the spend gate. Supabase
remains the unchanged 55/87 migration prefix with its duplicate-data block.

## M3.45 Cortex search target (2026-08-04)

The Obsidian-like Cortex search must remain a read-only, tenant-authorized
navigation surface that is usable from keyboard and pointer. Results must be
actionable only when an authorized destination exists; loading, empty, and
failure states must be visible and announced, and a changed term must never
leave stale records openable. The source implementation is complete at
`71c5cba`, with pure keyboard-navigation coverage and green source gates.

Authenticated desktop/mobile browser proof remains open because the local
Next Edge runtime could not resolve the configured Supabase host. Keep Vercel
Git disconnected and spend-protected, apply no hosted SQL, and do not treat a
local unauthenticated redirect as Cortex runtime proof. Source/evidence are
pushed at `e6fe073`; GitHub's Railway check and live API readiness are green,
while Supabase and Vercel remain unchanged.

## M3.44 admin data-quality target (2026-08-04)

Administrators get a calm, tenant-scoped read path for release-blocking data
quality findings. The Next.js page must remain presentation-only: Nest/API
authority and the database own all official ERP mutations, while this surface
only links to authorized source records. Report caps, explicit omitted-row
counts, and status buckets prevent a partial review from masquerading as a
repair decision.

The source slice is complete at `63bbf22` and its evidence is pushed at
`eab1719`. GitHub/Railway identity and live API readiness are verified. It is
deliberately schema-neutral;
the hosted uniqueness migration still waits for a supported backup, dependent
row/audit export, owner-approved canonical decision, and ordered suffix replay.
Keep migration flags closed, Vercel Git disconnected, and provider actions
spend-bounded. Vercel remains disconnected with no deployment for this SHA;
the next gate is the supported database backup and owner-approved duplicate
repair.

## M3.43 hosted-data target (2026-08-04)

The hosted database must reach the source migration head through a supported,
recoverable sequence. Before any Nest mutation canary, the release record must
contain the backup/restore point, canonical decision for the 12 duplicate
`PO-0002` rows, audited repair evidence, complete migration ledger, RLS and
policy review, Storage inventory, and exact provider identity. A healthy
service check alone is insufficient. No automation may delete or rename
business records, hand-edit migration history, or bypass the failed ordered
suffix.

## M3.42 Project Command Center target (2026-08-04)

The project overview is the construction team's bounded operating surface:
work queue, evidence, commercial decisions, punchlist, delivery watch, and
progress all remain linked to source records. The read path repeats tenant and
project ownership on every query, exposes no mutation authority, and hands
Cortex an explicit project reference. Responsive containment must hold at
390px and desktop, including the long project tab strip.

The source slice is complete at `a225340`. It is a frontend/read-query change
over the existing schema; no hosted migration is required. Before any hosted
promotion, verify the exact source SHA, Railway readiness, and the existing
Supabase catalog/reconciliation gate. Keep Vercel Git disconnected and all
mutation flags closed. The next vertical slice is one Nest-owned mutation
canary only after the provider, rollback, audit, tenant-isolation, and spend
gates clear.

## M3.41 Today Command Center target (2026-08-04)

Today is the first read-only operating surface after the BuildOps contract:
tenant-scoped task context, policy-gated project context, and explicit Cortex
navigation. It must remain a navigation and decision surface, not a hidden
mutation path. Task reads stay assignee-scoped; project reads reuse the
existing route authorization; Cortex retains its own record authorization.
Responsive proof covers 390px and desktop without horizontal overflow.

The source slice is complete at `ab905091ada2f7db927e6cf4c2de687ee2010194`.
The next target is provider verification of that exact SHA, followed by the
supported Supabase reconciliation and one small Nest-owned mutation canary.
No dashboard flag, Python worker, or browser write may bypass the authority
contract while those gates are open.

## M3.40 governing product target (2026-08-04)

The target product contract is now centralized in
[`docs/BuildOps_PRD_v1.md`](../BuildOps_PRD_v1.md). New work must express a
user outcome, actor, state machine, invariant, evidence source, and rollback
before implementation. The primary experience surfaces are Today,
Project Command Center, and Ask/Create/Find; they are navigation contracts,
not permission bypasses. NestJS remains the official mutation authority,
PostgreSQL the source of truth, Redis/BullMQ coordination-only, Python
advisory-only, and tenant/RLS/audit/idempotency rules apply to every slice.

This milestone changes no runtime state. It prevents a big-bang rewrite and
sets the next bounded sequence: repair supported hosted migration
reconciliation, then add an authorized read-only Today/Command Center slice,
then move one high-value mutation under the already guarded Nest seam.

## M3.39 durable project-create replay target (2026-08-04)

The target authority contract now includes a tenant-scoped
`project_create_requests` ledger. Its composite tenant foreign keys, unique
tenant/key index, request hash, explicit `processing -> succeeded` state, and
typed result checks make retries and conflicts deterministic. Nest claims and
completes the row in the project transaction, locks replay reads, emits audit
evidence, and never delegates approval or finalization to the browser or
Python. The Next adapter remains a compatibility seam and is closed by
default.

The source clone is reproducible at 87 migrations with zero-skip database and
API integration evidence. Production enablement still requires a hosted
55/87 catalog/data/RLS/Storage diff, approved backup/restore, duplicate and
audit recovery decisions, exact provider identity, and spend-bounded canary.
Keep `ERP_PROJECT_CREATE_WRITES_ENABLED` and
`ERP_PROJECT_CREATE_WRITES_VIA_API` false until those gates clear.

## M3.38 project creation authority target (2026-08-04)

Project creation is being strangled from the Next Server Action into the Nest
modular monolith through a typed, tenant-scoped `POST /v1/projects` boundary.
Nest owns capability authorization, transaction scope, actor/audit stamping,
and the official row commit. The legacy path remains available only while the
adapter flag is closed, preserving current behavior during migration.

Before any tenant canary, add a durable `project_create_requests` idempotency
record with request-hash and result replay semantics, then prove duplicate,
retry, conflict, rollback, audit-chain, and two-tenant isolation behavior on
PostgreSQL 17 + Redis. Keep both flags closed until that evidence and the
hosted catalog/data/RLS/backup/provider/spend gates clear. Python remains
advisory and cannot finalize this transaction.

## M3.36 replay evidence (2026-08-04)

The source ledger is now 86 migrations. A disposable PostgreSQL 17 + Redis
replay applied all 86, proved the schema/release planner current, executed
300/300 database tests with no skips, and passed 15 API integration files / 22
tests. The run found and fixed the strict supplier-issued outbox contract for
the optional confirmation-session UUID with a forward-only migration. This is
clone evidence only: the configured Supabase target remains at 55 applied
migrations and has not been mutated.

Database audit recheck 2026-08-04: hosted Supabase is at 55 of 86 source
migrations. The target remains behind source until a PostgreSQL 17 clone/replay,
catalog/data/RLS diff, backup/restore proof, and zero-skipped release evidence
clear the forward-only apply gate.

Authenticated browser evidence (M3.35): local route tests and browser suites
must prove session redirects before render, JSON authorization for API callers,
private response headers, role filtering, tenant-scoped graph/citation data,
and responsive behavior. Demo-tenant proof is useful runtime evidence but never
substitutes for isolated two-tenant database/Redis replay before promotion.

Browser authorization boundary (M3.34): every dashboard module, including
Cortex, finance, and inventory, is session-gated before route rendering. API
routes remain independently authorized and are never converted into HTML login
redirects. Prefix matching is segment-safe to prevent similarly named public
paths from inheriting access policy accidentally.

Authenticated Cortex transport boundary (M3.33): tenant-scoped responses are
private and non-cacheable at the Next.js edge/browser boundary, and vary on the
session cookie. This prevents shared-cache reuse of tenant data while leaving
NestJS authorization and PostgreSQL authority unchanged. Streaming chat keeps
the same body and citation protocol; only response headers are standardized.

## Capability baseline

The product scope is maintained in
[`CAPABILITY_MATRIX.md`](./CAPABILITY_MATRIX.md). It treats construction
workflow depth, multi-business ERP breadth, and hosted release readiness as
separate dimensions. The next bounded capability is supplier confirmation for
an issued Purchase Order; it must not mutate delivery, inventory, or payment
state and remains closed by default until its transaction and replay evidence
is complete.

The local M3.28 authority now implements that boundary with a hashed session,
explicit supplier decision state, tenant-scoped replay, and nullable-actor
audit. M3.29 adds a separate closed SCM-issuance minting seam: deterministic
HMAC-derived token, hash-only persistence, workflow-request association, and a
redacted session UUID in the supplier outbox. It does not emit a public link or
change delivery, inventory, receipt, or payment state. Link delivery remains a
separate proof-gated slice.

## Authority boundaries

```text
Browser
  -> Next.js frontend/BFF
    -> NestJS modular monolith
      -> PostgreSQL transaction + audit
      -> Redis/BullMQ
      -> object storage
      -> Python analysis services
```

- Next.js owns rendering, interaction, browser-safe reads, and compatibility
  adapters during migration.
- NestJS authorizes and commits official ERP transactions.
- PostgreSQL is the source of truth and enforces critical constraints.
- Redis and BullMQ provide queues, retries, caching, idempotency coordination,
  and distributed locks.
- Python returns analysis, extraction, forecasts, and document-processing
  evidence. It never approves or finalizes an ERP transaction.
- Supabase Storage or an equivalent object store holds files; PostgreSQL holds
  tenant-scoped metadata and immutable evidence references.

## Governance source of truth

- Explicit owner-approved architecture decisions and migration documents govern
  current implementation when older repository instructions conflict.
- Repository bootstrap files must not reference missing documents or superseded
  stack choices.
- Reconcile stale governance in a dedicated reviewed change; do not silently
  let obsolete pnpm, PostgreSQL, API, or queue rules redirect implementation.

## Required invariants

1. Every business record has a non-null tenant scope.
2. Every sensitive command has explicit capability authorization.
3. Official mutations and their audit attribution share one database
   transaction.
4. Monetary values use exact decimal/numeric types, never floating point.
5. Approval workflows use explicit persisted state machines and guarded
   transitions.
6. Retryable critical commands have an idempotency key and durable result.
7. Critical integrity is protected by database constraints as well as service
   validation.
8. Browser code cannot write sensitive tables directly.
9. AI output is advisory and traceable to inputs/model/version.
10. Existing public behavior is preserved until a replacement slice passes
    contract, integration, tenant-isolation, security, and rollback checks.
11. Auth-triggered tenant provisioning uses a narrowly scoped
    `SECURITY DEFINER` function with an empty `search_path`, fully qualified
    objects, no client execution privilege, and atomic tenant/Admin creation.
    User-editable signup metadata is display data only, never authorization.

## Finance authority progression

Cash draft create, update, and delete now have the same Core boundary as
posted cash transitions: strict tenant-free commands, locked membership
authorization, tenant-owned target validation, transactional allocation
writes, durable replay, and semantic audit. The draft replay ledger retains
deleted target UUIDs without granting browser or general-role access. The
Next.js compatibility adapter and visible UI remain unchanged for unselected
tenants; the exact API flag and UUID allowlist remain false/empty until the
ordered hosted migration suffix, disposable database proof, rollback,
duplicate-data, audit-chain, provider-identity, and spend gates clear.

Customer invoice issue and reversal are now represented as separate Core
vertical slices. Each selected route owns authorization, tenant-scoped
idempotency, transaction orchestration, and semantic audit while PostgreSQL
continues to own journal balancing, fiscal-period rules, and invoice state.
The Next.js Server Actions remain compatibility adapters during migration; a
selected Core failure is terminal and cannot fall back to a second write. Both
invoice issue and reversal selectors and API flags stay false/empty until the
ordered hosted migration set, disposable integration, rollback, duplicate-data,
audit-chain, provider-identity, and spend gates are cleared.

Customer invoice cancellation follows the same boundary as a third finance
slice: a separate idempotency ledger and route, no browser authority fields,
and a PostgreSQL state transition reused inside the Nest transaction. The
cancellation selector remains disabled until the ordered hosted migration set
and the same disposable, rollback, data-integrity, audit, identity, and spend
gates clear.

Document deletion follows the same boundary: the Nest command owns tenant and
capability authorization, processing-history protection, derived-row cleanup,
durable replay, and semantic audit; Next.js only adapts the existing UI and
performs best-effort Storage cleanup after commit. The deletion selector and
API controls remain disabled until hosted parity and the full release gates
clear.

Public client signing follows the same boundary with a capability-style
hashed token as its only unauthenticated authority. NestJS validates a
bounded PNG, derives tenant and source scope from the locked signature
session, writes the document and source stamp atomically, records a
service-only replay result, and audits the nullable external signer. The
deterministic Storage object is retained whenever a matching request may own
it; cleanup is only attempted when no replay row exists. Next.js keeps the
existing portal contract and selects the route only for an exact flag plus
UUID tenant allowlist. Public-signing migration and selectors remain
false/empty until hosted parity, disposable replay/expiry/revocation/source-
stamp proof, rollback, and spend gates clear.

## Delivery workflow authority slice

The delivery state machine is migrated one transition at a time. M3.17 makes
`scheduled -> site_preparing` a NestJS-owned, tenant-scoped transaction with a
durable idempotency result and transactional audit event. Next.js keeps the
existing Server Action contract and selects the Nest route only for an exact
server-side flag plus tenant allowlist; the selector fails closed and never
falls back to a second write. The API and frontend controls remain
false/empty until hosted migration reconciliation, disposable integration,
canary, rollback, and spend gates are green.

M3.18 extends the same authority boundary for
`site_preparing -> site_ready`: preparation notes, `site_prepared_at`, and
`site_prepared_by` are committed by NestJS in one tenant-scoped transaction
with durable replay and semantic audit. The Next compatibility adapter keeps
the legacy behavior for unselected tenants and fails closed after a selected
core error. Its API and frontend controls remain false/empty until hosted
parity and canary gates clear.

M3.19 applies the same boundary to supplier-bill posting: NestJS owns
`POST /v1/finance/supplier-bills/:supplierBillId/post`, rechecks the finance
capability from tenant membership, locks the bill, calls the existing payable
posting function, persists a strict idempotent result, and audits the status
change in one transaction. The Next action remains a compatibility adapter;
the API and frontend selectors are exact, tenant-allowlisted, and fail closed.

M3.20 applies the same boundary to supplier-bill reversal: NestJS owns
`POST /v1/finance/supplier-bills/:supplierBillId/reverse`, validates the
bounded reason and posting date, rechecks `finance.post`, locks the bill,
reuses the existing reversal function, persists an idempotent result, and
audits the status change atomically. The Next action is a compatibility
adapter with a stable retry key; selected Core failures never fall through to
a second write. Reversal controls stay false/empty until hosted migration,
duplicate-data, audit-chain, integration, rollback, and spend gates clear.
Python/AI has no approval or posting authority.

M3.21 applies the same boundary to cash posting and reversal: NestJS owns
`POST /v1/finance/cash-transactions/:cashTransactionId/post` and `/reverse`,
rechecks `finance.manage_cash`, locks the tenant membership and cash record,
reuses the existing database posting/reversal functions, persists one shared
tenant-scoped idempotency result, and audits the status change atomically. The
Next cash actions remain compatibility adapters with stable retry keys; a
selected Core failure never falls through to a direct second write. Cash
controls stay false/empty until the ordered hosted suffix, disposable
integration, rollback, duplicate-data, audit-chain, and spend gates clear.

M3.22 applies the same boundary to customer invoice issuance: NestJS owns
`POST /v1/finance/customer-invoices/:invoiceId/issue`, rechecks
`finance.issue_invoice`, locks the tenant membership and invoice, claims a
tenant-scoped idempotency ledger, reuses the existing
`issue_customer_invoice` database function, persists a strict issued result,
and audits the status change atomically. Next.js remains a compatibility
adapter with one stable retry key; selected Core failures never fall through
to a direct database function. Invoice issuance controls remain false/empty
until the complete ordered hosted suffix, disposable integration, duplicate
data, audit-chain, rollback, provider-identity, and spend gates clear.

## Nest module shape

Modules align to business capabilities: identity/access, tenants, CRM,
projects, cost control, procurement, inventory, construction, finance,
documents, workflow, audit, and reporting. Modules share one deployment and
one transaction boundary where required; they do not share private tables or
reach through each other's internals.

## Release evidence

- Attribute Git commits and provider actions to the explicitly authorized
  release identity. A provider-level `BLOCKED` deployment is not a build and
  cannot be presented as a release.
- Preserve one exact release SHA across GitHub refs, Vercel metadata, Railway
  metadata, and database migration evidence when that SHA changes each
  deployable artifact. For a watched-path skip, record the skipped event and
  prove the retained artifact's exact runtime SHA and readiness.
- Prove hosted identity and tenant boundaries through no-write failure paths
  before enabling a migrated transaction. Snapshot affected records and audit
  state before/after.
- Before enabling a migrated command, execute one explicitly authorized,
  reversible transaction against designated demo data. Restore through the
  same Nest authority, reconcile both append-only audit records, and prove
  tenant hash-chain continuity.
- Canary tenants must begin with a verifiable genesis-rooted audit chain, an
  active Supabase Auth identity, a same-tenant application user holding the
  required capability, and a non-critical reversible record. Historical chain
  failures are never waived, deleted, or rewritten to make a rollout pass.
- Create the dedicated canary through the normal public signup and authenticated
  Project-create flow. Do not insert Auth, tenant, user, Project, or audit rows
  through an operator SQL session or a one-off service-role script.
- Run the redacted read-only Project cutover planner immediately before and
  after the maintenance window. Store the complete mutable business baseline
  only in the approved restricted release artifact, never in Git or provider
  logs.
- Gate incremental production routing by exact command flag and an explicit
  database-derived tenant allowlist. Missing or malformed canary configuration
  must retain the legacy selector.
- Correlate each official command across Web and Nest with a validated UUID.
  Structured runtime outcomes may contain operation, method, status, outcome,
  and duration only; never log bearer tokens, command payloads, URLs with
  identifiers/query values, tenant IDs, user IDs, or business-record IDs.
- Keep root package-manager policy in the supported workspace configuration;
  frozen installs must not mutate the reviewed lockfile or emit ignored-setting
  warnings.
- Pin release tooling to immutable versions and verify downloaded binary
  digests before execution; never bootstrap a release gate from a mutable
  upstream branch.
- Rebuild PostgreSQL 17 from zero and reject skipped database tests.
- Permit an isolated native PostgreSQL 17/Redis 7.4.9 lane as the authoritative
  application-schema M1 gate when paid hosted runners and local virtualization
  are unavailable. Require a clean full migration replay, zero skipped database
  tests, deterministic schema fingerprint, Nest integration/smoke proof, and a
  separate hosted Supabase ledger/catalog comparison. The pinned container lane
  remains an equivalent future option, not a payment prerequisite.
- Run the no-cost lane only from a private repository through a manual,
  actor-restricted, repository-scoped short-lived runner. Start it for one
  reviewed workflow, then stop, deregister, and erase it. Never install it as a
  service, expose production secrets, upload dependency caches/artifacts, or
  execute unreviewed pull-request code.
- Treat runner deregistration and credential erasure as immediate security
  gates. Retry non-secret work-directory deletion separately when Windows
  retains transient file handles.
- Exercise Nest identity, membership, capability, tenant, concurrency, audit,
  and rollback behavior against that disposable database.
- Use real Redis for readiness and container smoke checks.
- Compare the target database migration ledger before any rollout.
- Treat database enum labels and ordering as versioned application contracts;
  verify canonical catalogs during clean replay and hosted release planning.
- Close production database incident repairs only after the affected
  authenticated route is hard-reloaded, its critical regions render, the
  browser console is clean, and provider runtime errors are reconciled.
- Never use a production database as a write-test fixture.
- Require a read-only, hash-bearing release plan for every hosted target.
- For non-linear history, reconcile an isolated restored clone with a new
  forward-only migration; never blindly replay missing historical files.
- Treat platform backup/PITR and Storage object recovery as separate evidence.
- Require database test commands to receive an explicit disposable
  `DATABASE_URL`; never auto-load an application `.env.local` as a write-test
  target.
- Use a direct or session-mode PostgreSQL connection for migration tooling.
  Reserve transaction-mode poolers for application traffic that does not
  require prepared statements.

## Deployment mapping

- Vercel `thirdcode-erp`: Next.js frontend/BFF only.
- Vercel Git auto-deploy disabled. Source publication does not authorize a
  build; production uses one explicitly approved deployment of a green SHA,
  with promotion preferred over redundant rebuilds.
- Vercel Web Analytics: first-party product telemetry with a clean browser
  console and no transaction authority.
- Railway `Third Code ERP API`: the single NestJS modular monolith.
- Railway `Redis`: BullMQ, caching, retry coordination, and distributed locks.
- Supabase project `aqqrtkmtcsfkbyyqxowv`: PostgreSQL, Auth, and Storage.
- Python analysis workers remain separately deployable but cannot become
  transaction authorities.

## Onboarding classification boundary

- Organization type is constrained tenant profile data, not authorization.
- One shared catalog must drive UI options, TypeScript validation, database
  constraints, provisioning logic, tests, and reproducibility checks.
- Unrecognized signup metadata must fail safely to `other`.
- Roles, capabilities, memberships, and tenant access must never be derived
  from user-editable organization metadata.
- Applied migrations remain immutable. Any rollback is a reviewed forward
  compensation while preserving existing tenant and identity rows.

## Public landing quality boundary

- Keep the landing AIDA structure, original generated construction imagery,
  Satoshi display typography, dense 24-cell bento, and scoped GSAP motion.
- Render the hero in no more than three visual lines at supported desktop,
  tablet, and 390px mobile widths. Hide the decorative inline heading image
  when it would force extra mobile lines.
- Use descriptive content labels instead of decorative section/question
  ordinals. Retain numeric state only where it communicates functional
  position, such as an accessible carousel counter.
- Require zero horizontal overflow, visible focus states, reduced-motion
  behavior, and at least 44px visible mobile interaction targets.
- Load Vercel Analytics only on Vercel. Local or alternative-host production
  artifacts must not emit missing-script console errors.
- Gate any paid frontend build on green local checks, browser evidence at
  1440/768/390, exact charge disclosure, and explicit user approval.

## Document-processing evidence boundary

- A processing request enters NestJS with verified identity, explicit
  capability, same-tenant document lookup, and a required idempotency key.
- PostgreSQL stores processing state machine and immutable evidence.
- BullMQ carries only an opaque processing-job ID. NestJS reloads tenant,
  Project, document, actor, and object context from PostgreSQL.
- Python receives one short-lived exact-object read grant and returns bounded,
  versioned, hash-linked evidence. It receives no database credential,
  service-role credential, tenant authority, capability, or approval state.
- NestJS validates evidence and commits pending-review scope rows inside one
  actor-stamped transaction.
- Duplicate delivery returns one durable result and at most one draft BOM.
- `documents` and `scope_items` use composite tenant/Project constraints and
  transactional audit triggers.
- Legacy upload remains default until a disabled-by-default, tenant-scoped
  canary proves compatibility, reconciliation, and rollback.

## Upload access boundary

- Before issuing a signed object-upload URL or recording document metadata,
  server code loads Project by both authenticated tenant and Project ID.
- Missing and cross-tenant Projects return the same 404 response.
- Rejection occurs before quota, Storage, database mutation, parsing, AI, or
  queue work.
- Database composite tenant/Project constraints remain required defense in
  depth; application checks do not replace them.

## Document mutation authority boundary

- `document.manage` is an explicit server-enforced capability. Operational
  roles may manage documents; `viewer` remains read-only.
- Signed upload credentials are never returned unless identity, tenant,
  capability, same-tenant Project, quota, Storage issuance, and audit append
  all succeed.
- Official document creation and its actor-stamped hash-chain audit entry
  commit in one PostgreSQL transaction.
- Document deletion binds document ID, tenant ID, and Project ID in the
  authoritative query. Derived scope deletion, document deletion, and audit
  append commit atomically.
- Object Storage cleanup occurs only after the database transaction succeeds.
  A cleanup failure may leave an inaccessible orphan object, but cannot leave
  a live database record pointing to an object deleted before commit.
- M2 still adds composite database constraints and audit triggers. Application
  authority checks are immediate defense, not a substitute for database
  integrity.

## Cortex entity consistency boundary

- One typed registry covers every versioned Cortex node type and owns its
  display label, color, access path, permitted source table, and record route.
- Non-admin roles are deny-by-default for unknown types. Application graph,
  entity lookup, citations, and record navigation use the same registry.
- Entity lookup first resolves a tenant-scoped node, then verifies that the
  node type owns the requested source before retrieval. Forbidden and
  mismatched records use the same non-enumerating 404 response.
- Registry completeness is checked against the database enum contract.
- Application filtering supplements PostgreSQL RLS and database authorization;
  it never replaces them. Any new node type requires coordinated database
  policy, mirror, registry, route, and test changes.

## Cortex citation trust boundary

- A grounded answer may expose only citations already authorized for the
  caller's tenant and current role.
- The streamed answer body remains backward-compatible `text/plain`; bounded
  navigation metadata travels in a separate response header.
- Persisted conversation metadata is an index only. History rendering
  rehydrates citation node IDs from current graph state and never trusts stored
  titles, references, Project IDs, or routes.
- Canonical entity-registry navigation owns record URLs. Unknown or non-routed
  node types render non-interactive labels instead of guessed links.
- Citation controls require readable labels, visible focus, 44px mobile
  targets, bounded text, and zero horizontal overflow.

## Cortex record-context boundary

- Supported operational detail pages expose the same grounded record context
  without embedding database or business logic in individual React pages.
- One exact route resolver maps UUID-backed detail paths to canonical Cortex
  source tables. Unsupported, nested, malformed, and collection paths fail
  closed.
- Dashboard route authorization executes first. Cortex entity retrieval then
  enforces authenticated tenant, source/type ownership, and current-role node
  scope.
- Project detail keeps its existing inline panel; layout injection must never
  duplicate it.
- Canonical registry routes open exact records when a detail surface exists.
- Context remains read-only. It cannot approve, post, reverse, allocate, or
  finalize an ERP transaction.

## Cortex relationship-meaning boundary

- A record backlink must communicate both the connected record and why the
  graph connects it to the current record.
- Directional labels derive only from canonical server-returned edge types and
  direction. Unknown edge types receive a neutral bounded label.
- Relationship rows are assembled only from the tenant- and current-role-
  filtered context pack. Missing citations are omitted; destinations are never
  guessed from edge metadata.
- Canonical entity-registry routing owns navigation. Unsupported records remain
  readable static context.
- The response is bounded, read-only, keyboard accessible, responsive, and
  cannot approve or finalize an ERP transaction.

## Cortex evidence-presentation boundary

- Operational record context exposes a concise evidence trail only after
  authenticated tenant, source/type, and current-role authorization.
- Raw provenance remains server-only. Actor IDs, internal origin references,
  hash-chain values, tenant/subject identifiers, and global sequences are not
  presentation data.
- Server maps supported origins to clear user-facing meaning and an ISO
  timestamp. Unknown origins fail safely; invalid timestamps disappear.
- Evidence order remains newest-first and response size remains bounded.
- Presentation uses a native accessible disclosure with no client mutation,
  approval, posting, or workflow authority.

## Cortex focused-navigation boundary

- A record-to-graph link is an untrusted focus request, not authorization.
- Focus input must be a canonical source table plus UUID supplied together.
  Invalid input fails before graph access.
- The server derives tenant and role from the authenticated profile, resolves
  the current node, verifies source/type ownership, and returns the same 404
  for missing, mismatched, or forbidden records.
- Focused retrieval must recheck tenant and current-row status on the focus,
  every edge, and every joined neighbor. Role scope is applied before a
  neighbor can enter the response.
- Response size is bounded to the focus plus at most 80 direct neighbors.
  `focusNodeId` is server-derived and must match a returned node.
- The unfocused whole-graph API remains backward compatible.
- Presentation must identify the bounded count as shown, keep the exact focus
  visually persistent, avoid drawer occlusion, preserve keyboard navigation,
  and produce no horizontal overflow at 1440, 768, or 390.
- Focused graph context remains read-only and cannot approve, post, reverse,
  allocate, or finalize an ERP transaction.

## Cortex conversation-context boundary

- A saved conversation may bind immutably to one canonical ERP record through
  a complete source-table and UUID pair. Unscoped conversations remain valid.
- Browser input is an untrusted navigation hint. The server derives tenant and
  role, resolves the current node, checks canonical source/type ownership, and
  applies current-role scope before reading or writing conversation data.
- Missing, mismatched, revoked, and forbidden records return the same
  non-enumerating response. History must hide context the current user can no
  longer access.
- Browser roles may select authorized conversation rows but cannot insert,
  update, or delete conversations or messages directly. Official writes use
  server transaction authority.
- Record context grounds analysis and citations only. AI may explain,
  summarize, or recommend; it cannot approve, post, reverse, allocate, or
  finalize ERP transactions.
- The next presentation slice must expose the active record clearly, preserve
  saved-conversation semantics, and pass keyboard, responsive, console, and
  overflow QA before any explicitly approved consolidated Vercel release.

## Cortex conversation-context presentation

- The chat surface always names its scope: one authorized canonical record,
  company-wide, or unavailable.
- A requested but unauthorized record cannot silently become a company-wide
  chat. Input and suggestions fail closed until focus is cleared.
- Saved threads show their record scope. In-place restore requires exact
  canonical-pair equality; other contexts use explicit navigation.
- Starting a new chat preserves the page's authorized record context. Changing
  records never mutates or rebinds an existing conversation.
- Record-specific prompts explain, summarize, and identify evidence or linked
  work only. Presentation cannot approve or finalize an ERP transaction.
- Keyboard focus remains visible, mobile targets are at least 44px, long titles
  truncate safely, and 1440/768/390 layouts have no horizontal overflow.

## Cortex conversation deep-link boundary

- Saved conversations have shareable in-application URLs containing only an
  opaque UUID plus optional canonical record focus.
- UUID validation occurs before client restore. URL possession grants no
  access; the detail API reauthorizes owner, tenant, current role, persisted
  record context, and citations.
- Restoring or creating a conversation updates URL state without a page reload.
  Starting a new chat removes conversation identity while retaining authorized
  record focus.
- Restore is latest-request-wins. Stale network responses cannot replace newer
  conversation state or repopulate a cleared chat.
- Cross-record history navigation carries the immutable conversation identity
  and canonical context together. Context mismatch fails closed.
- URLs never contain tenant ID, user ID, prompt text, answer text, or internal
  graph-node ID.

## Cortex recent-history search boundary

- History search operates only on the bounded, already-authorized recent
  conversation response. Presentation must label this scope honestly and must
  not imply full-history or cross-tenant search.
- Matching may use conversation title and human canonical-context labels only.
  Tenant IDs, user IDs, record UUIDs, and internal graph-node IDs remain
  excluded from searchable and visible text.
- Search is local, deterministic, case- and diacritic-insensitive, preserves
  server order, and never weakens owner, tenant, current-role, record-context,
  or citation authorization.
- Keyboard focus is visible, mobile targets are at least 44px, empty results
  are bounded, and the open panel produces no horizontal overflow.

## Shared request-rate-limit identity boundary

- Anonymous requests are bucketed by network address.
- Authenticated requests are bucketed by verified user identity, not by a
  shared IP and not by browser-supplied identity.
- Transitioning from authenticated to anonymous traffic cannot reuse the
  authenticated counter under a lower anonymous limit.
- Two authenticated users behind one NAT cannot consume each other's bucket.
- Rate limiting is defense in depth. Tenant authorization and permission
  checks remain mandatory for every sensitive route.
- A future Redis-backed limiter must preserve these identity semantics while
  adding shared-instance atomicity, bounded retention, and operational metrics.

## Cost-controlled frontend activation boundary

- Git-triggered Vercel deployment stays disabled.
- Candidate preparation is source-only. Production requires explicit approval.
- One approved release means one queued Standard production build, no preview,
  no duplicate deploy, and exact SHA verification.
- Production acceptance requires public and authenticated browser evidence,
  runtime-error review, API readiness, release identity, and responsive proof.
- The retained last-known-good deployment remains the instant-rollback target
  until the new release is verified.

## Permission-aware Today boundary

- Dashboard data follows the same canonical role policy as direct route
  access. A universally reachable shell never implies universally readable
  executive data.
- Loader selection happens before database work. A forbidden dashboard mode
  cannot query and then hide restricted data in React.
- Restricted roles receive tenant- and assignee-scoped work only.
- Executive pipeline, GP, forecast, rep, and alert reads require the same role
  permission as `/pipeline/board`.
- Quick links derive from the canonical navigation registry and cannot expose
  forbidden workspaces.
- Today remains read-only. It cannot approve, post, reverse, allocate, commit,
  delete, or finalize an ERP transaction.

## Permission-safe universal search boundary

- Search input is bounded and interpreted as literal text. User-supplied
  wildcard or escape characters cannot broaden a query.
- Searchable record types are selected from the same canonical role policy as
  direct navigation. A result link never grants permission and every query
  still authorizes independently.
- Base and joined records repeat the authenticated tenant predicate. Foreign
  display labels cannot be joined into an otherwise tenant-scoped result.
- Assignee-scoped types remain assignee-scoped. Search cannot turn a personal
  task surface into a tenant-wide task directory.
- User-specific results are private and non-cacheable.
- Search is read-only. It cannot approve, post, commit, allocate, delete, or
  finalize an ERP transaction.

## Search-to-Cortex draft boundary

- Record search and AI drafting are explicit modes. Search is the default;
  Ask mode does not fan the question into record-search requests.
- Browser-to-Cortex draft transport uses an opaque, expiring, one-time
  identifier. Prompt text never enters the route, server render parameters,
  provider request, or analytics event during handoff.
- The server accepts a draft handoff only for a company-wide Cortex route
  without record focus or saved-conversation identity.
- Draft consumption removes browser state before parsing. Malformed, expired,
  future-dated, empty, undersized, or invalid-ID state fails closed.
- Opening Cortex only prefills and focuses the composer. The user must
  explicitly press Send before any AI request.
- The AI surface remains analysis-only. It cannot approve or finalize an ERP
  transaction.

## Public signing integrity boundary

- A public signing token is the only authority for the external flow. Tenant,
  entity type, entity ID, source Project, document ID, and audit identity are
  never accepted from browser input.
- Signature payloads are bounded and structurally validated before Storage or
  database work.
- Storage upload uses a collision-resistant key. Official database state is
  committed only after the exact signing-session row is locked and its signed,
  revoked, and expired state is rechecked.
- Signature document creation, tenant-scoped source stamping, signing-session
  stamping, and entity audit share one database transaction.
- An unauthenticated external signer is represented by nullable `actor_id`.
  Fabricated system users and zero UUIDs are forbidden.
- Audit failure fails the official signature transaction. Database failure
  triggers compensating Storage cleanup.
- Concurrent and replayed submissions cannot create another signature
  document, source transition, session stamp, or audit.
- This safe Next.js authority is transitional. The public signing command must
  move behind NestJS incrementally without weakening the token, transaction,
  tenant, audit, replay, or cleanup invariants.

## RFQ dispatch integrity boundary

- BOM-to-RFQ creation produces at most one official RFQ per tenant/BOM.
- Browser input never supplies system mode, tenant, actor, or role. Manual
  dispatch derives all authority from the authenticated server profile.
- Background dispatch accepts only a trusted queue event and revalidates any
  initiating actor against the event tenant before audit attribution.
- BOM lock, retry check, tenant-scoped line/rate lookup, RFQ insert, and audit
  share one database transaction.
- Database uniqueness and a tenant-composite BOM foreign key remain the final
  retry and cross-tenant integrity boundary.
- Notification is post-commit and independently retryable. Replaying an
  already committed dispatch emits no duplicate audit or notification.
- Browser database roles may read authorized RFQ state but cannot mutate RFQs
  or quotes directly.
- The transitional Next.js service must move behind NestJS incrementally
  without weakening transaction, idempotency, tenancy, permission, actor, or
  audit invariants.

## RFQ quote workflow integrity boundary

- A quote submission has one stable tenant-scoped idempotency key and one
  canonical BOM-line identity. Browser retries reuse the key; exact replay
  returns the durable result and conflicting reuse fails closed.
- The server derives material identity from the locked RFQ line. Browser input
  cannot select a cross-tenant or unrelated material.
- RFQ, vendor, material, BOM line, actor, and quote references are
  tenant-validated before mutation and protected by database constraints where
  persistence requires the relationship.
- Quote creation, first-quote status change, and their audits share one
  database transaction. Completion/cancellation and audit also share one
  transaction.
- Completion rechecks full line coverage while holding the RFQ lock. Client
  rendering is convenience only and never workflow authority.
- PostgreSQL enforces the explicit state graph. `completed` and `cancelled`
  are terminal; an invalid transition fails independently of application code.
- Notifications occur only after commit. Notification failure cannot roll
  back or misreport an already committed official transaction.
- The current Next.js service is a compatibility implementation. The next
  incremental migration places the same commands behind a disabled NestJS
  procurement adapter before any provider-level cutover.

The disabled quote adapter now exists. Target activation remains a measured
single-tenant canary only after M1 provider gates; completion and cancellation
move later as separate, independently verified milestones.

The disabled terminal adapter now also exists. Quote and terminal routing use
independent exact flags and tenant allowlists so each command family can be
canaried and rolled back without dual writes. Production activation remains a
separate owner-approved milestone; the compatibility implementation stays
authoritative until that proof succeeds.

## Host-portable public discovery boundary

- One validated origin controls canonical metadata, Open Graph URLs,
  structured-data identities, portal links, `robots.txt`, and `sitemap.xml`.
- Vercel is a compatible host, not a permanent identity embedded throughout
  the application.
- Alternative hosting must set `NEXT_PUBLIC_SITE_URL` during the production
  build. Mixed origins, credential-bearing URLs, path-scoped origins, and
  silently malformed values fail closed.
- Sitemap timestamps represent verified content changes only. Unknown dates
  are omitted rather than synthesized.
- Hosting portability cannot weaken CSP, authentication, tenant isolation,
  authorization, audit, or transaction boundaries.

## Portable frontend runtime boundary

- The supported alternative is a full Node.js Next standalone runtime, never a
  static export that drops Middleware, Server Actions, route handlers, SSR, or
  per-request CSP nonces.
- The same reviewed SHA identifies source, image, `/api/health`, and
  `/api/ready`.
- Public browser variables are fixed at build time. Server credentials remain
  runtime-only and cannot enter image layers.
- The runtime is non-root, listens behind a TLS reverse proxy, exposes
  liveness and database readiness separately, and retains the previous image
  for immediate application rollback.
- Vercel remains disconnected and retained as external rollback until the
  alternative hostname passes authenticated, tenant-isolated production
  evidence and traffic cutover receives explicit approval.
# RFQ transaction-authority progress

- Manual BOM-to-RFQ creation now has a strict, tenant-derived NestJS command
  behind an independent disabled cutover gate.
- Quote logging and terminal RFQ transitions already use separate disabled
  NestJS adapters.
- Target remains one NestJS procurement authority for manual and automatic
  RFQ creation, quotes, and state transitions.
- Automatic creation now has a disabled Redis/BullMQ producer-consumer path
  owned by the NestJS modular monolith. The transitional Inngest path remains
  authoritative until equivalent notification delivery is idempotent and
  observable.
- A selected BullMQ job must reauthorize the queued actor at execution time,
  validate the approved BOM state, reuse the official RFQ transaction, and
  end in a bounded completed, retrying, failed, or dead-letter state.
- Python will not approve, create, complete, cancel, or otherwise finalize RFQ
  transactions.
- Cutover remains tenant-by-tenant, fail-closed, observable, reconciled, and
  reversible without a browser fallback after a selected Nest command begins.

## RFQ notification delivery boundary

- Official RFQ state, semantic audit, notification intent, and recipient
  snapshots commit atomically in PostgreSQL.
- Redis jobs contain opaque identities only. Recipient data, business copy,
  credentials, and provider responses remain outside Redis.
- PostgreSQL owns delivery idempotency, attempt ceilings, stale-processing
  recovery, terminal dead-letter evidence, and in-app uniqueness.
- Delivery revalidates tenant membership and the current procurement role.
  Python cannot approve, create, notify, or finalize an RFQ transaction.
- Provider email retries use one stable idempotency key and identical payload.
  Missing server-only email configuration fails closed.
- Recovery polling and automatic RFQ routing are independent exact flags,
  default false, and require a controlled tenant canary before activation.
- Browser roles may read their authorized notification rows but cannot write
  official notification, outbox, or delivery state.

## Controlled production delivery boundary

- Supabase migration parity must be proven before release. A current 55/55
  ledger is a no-op release condition, not permission to replay migrations.
- Railway rebuilds only when watched backend application files changed.
  Documentation-only repository commits must remain skipped.
- Vercel production releases are manually initiated from one reviewed SHA
  after local and disposable-database gates pass. Preview and production build
  counts are recorded because promotion may rebuild with production-only
  environment variables.
- Vercel Git remains disconnected after every approved release. Source pushes
  alone cannot consume Vercel build resources.
- A release is complete only after canonical health/readiness, authenticated
  browser behavior, runtime errors, HTTP 5xx, Railway readiness, Redis,
  Supabase migration parity, and rollback identity are verified.
- The frontend rollback target is the immediately previous ready production
  deployment. The backend rollback target is the previous healthy Railway
  image; database migrations remain forward-only unless an explicit
  compensating migration is reviewed.

## Purchase-order transaction boundary

- Browser forms submit validated commands to NestJS; React and Next.js Server
  Actions do not directly commit `purchase_orders`, `po_line_items`, approval
  stamps, receipts, or supplier-issuance state.
- NestJS derives tenant and actor from the verified Supabase principal, checks
  capability and state-machine transitions, validates same-tenant project,
  vendor, cost-code, and line references, then commits PO plus lines plus
  semantic audit in one PostgreSQL transaction.
- Money remains integer centavos or exact PostgreSQL decimal types; client
  totals are never trusted. Every retry carries a tenant-composite durable
  idempotency key and returns the original result without a duplicate PO.
- Redis/BullMQ carries only opaque notification identities after commit. Python
  may recommend or analyze, never create, approve, issue, receive, or finalize
  a Purchase Order.
- Current implementation is intentionally transitional: the Nest route,
  durable idempotency storage, and transaction parity are proven in disposable
  PostgreSQL/Redis, but the adapter remains disabled and non-mutating until
  provider readiness, hosted schema reconciliation, and a canary are approved.

## Purchase-order approval workflow slice (2026-08-01)

- The target state-machine authority now has a second disabled Nest boundary
  for PM submission, PM approval, Commercial approval, and rejection.
- PostgreSQL owns a tenant-composite idempotency ledger for each workflow
  command. The service locks the request and PO, rechecks membership and the
  action capability, commits status/stamps/audit/result together, and returns
  the saved result on retry.
- Issuance, supplier notification, receiving, BOM/grouped generation, and
  browser cutover remain separate milestones. Python cannot approve or finalize
  any of them.
- The hosted migration and flags remain gated by read-only Supabase
  reconciliation, provider identity, readiness/log checks, and a reviewed
  single-tenant canary.
- Current hosted evidence is intentionally not parity: 55 applied versus the
  repository's 57 migrations. The two candidate migrations are identified by
  version and hash in the operations log; no hosted SQL has run.
- Next.js has a server-only workflow client contract with its own exact flag
  and tenant allowlist. It is a preparation seam only; browser calls remain on
  the current action path until the transaction's notification behavior is
  equivalent and a canary is approved.
## 2026-08-01 evidence added for PO authority

The target modular monolith now has a concrete, disabled first transaction
slice: one Nest command owns standalone PO creation, PostgreSQL owns the
idempotency and number constraints, and Next delegates only when both exact
feature gates and the tenant allowlist match. The transaction is the boundary
for capability authorization, same-tenant reference checks, integer-centavo
calculation, audit, and replay. Python remains advisory and cannot finalize a
PO. The next proof required is disposable PostgreSQL/Redis integration plus a
single-tenant canary; hosted flags stay false.

## Landing surface evidence (2026-08-01)

Treat the public landing page as a stable product boundary while backend
authority migrates. Preserve the measured three-line hero, dense bento grid,
progressive disclosure, keyboard-accessible carousel/FAQ, and Organization /
SoftwareApplication / FAQPage structured data. Any future visual change must
carry source regression coverage plus desktop/mobile browser evidence before a
provider deployment is considered.

## Authority proof evidence (2026-08-01)

The first standalone PO transaction slice has disposable runtime evidence:
PostgreSQL 17 replayed all 56 migrations, all 243 database tests executed, and
all 7 Nest/Redis integration tests passed. Hosted Supabase remains the source
of truth and must be reconciled read-only before any candidate migration is
applied.

## Purchase-order workflow notification parity (2026-08-01)

The target authority boundary now includes transactional notification intent:
Nest commits workflow state, audit evidence, outbox payload, and
tenant/role-scoped delivery rows together. BullMQ carries only opaque delivery
identities; PostgreSQL remains the source of truth for retry, stale processing,
dead-letter, and in-app uniqueness. The notification gate is independent and
defaults off, so no tenant can activate workflow writes without proven
notification parity. The current Next Server Actions and visible UI remain the
rollback path until hosted reconciliation and canary evidence are approved.

## Canary integrity gate (2026-08-01)

The target release process requires a read-only tenant audit-chain check before
any write canary. A blocked result (predecessor-link or hash mismatch, missing
actor capability, or failed audit controls) stops provider deployment and flag
enablement; repair is a separate reviewed milestone. Current demo evidence is
blocked by 2 link mismatches, 151 hash mismatches, and a missing
`project.update` capability for the selected actor.

## Audit hash parity (2026-08-01)

All new API and Next server audit writes use the same PostgreSQL-compatible
hash formula as `public.audit_log_trigger()`, and shared verification uses that
formula as well. Historical mismatches stay immutable and visible to recovery
review; no release may treat parity code as a historical repair.

## Read-only audit recovery boundary (2026-08-01)

Recovery planning must use a repeatable-read/read-only transaction, opaque
tenant references, bounded system event buckets, and explicit blocker output.
The planner cannot emit entity IDs or business values, cannot rewrite audit
history, and cannot clear the canary gate by itself.

Historical profile verification is also bounded to reviewed algorithms. Rows
matching neither the current database formula nor the legacy JSON formula are
unknown evidence and must remain a release blocker until provenance is proven.

## Release invariant (2026-08-01)

The target state requires tenant-scoped Purchase Order number uniqueness before
the new idempotency authority is enabled. The hosted demo dataset currently
contains one duplicate group (12 records); its remediation is an explicit data
decision, not an automatic migration side effect. The three forward migrations
must apply atomically and be ledger-recorded before any PO workflow flag or
production promotion is enabled.

The target release process now includes a bounded duplicate-remediation report
before the uniqueness migration. It is evidence-only: an owner must approve a
reversible record-level remediation before any data mutation is authored.

Runtime clean-room invariant: production web source and public text contain
only Third Code ERP branding. Legacy vendor markers are prohibited by a web
runtime regression test; internal provenance documentation is not shipped as
runtime output.

## Controlled release evidence boundary (2026-08-01)

- One read-only release planner must aggregate database ledger parity,
  duplicate-record safety, audit-chain integrity, and live backend/frontend
  readiness before a provider release is eligible.
- A missing evidence source is `review_required`, not an implicit pass. The
  planner's clear result is a prerequisite for any SQL application, flag
  enablement, or manual deployment.
- The planner remains provider-neutral and cost-safe: it cannot invoke a
  deployment, mutate Supabase, or change Vercel/Railway settings.

## Inventory receiving authority boundary (2026-08-01)

The target receiving flow creates only a tenant-scoped `draft` Stock Receipt
through NestJS. The command accepts no tenant or actor authority from the
browser, derives membership from PostgreSQL, and commits the request, receipt,
lines, idempotency result, and semantic audit in one transaction. Quantities
are parsed as integer micro-units and values as exact centavos; PostgreSQL
constraints and inventory triggers remain the final integrity boundary.

The idempotency record is server-only and replay returns the original result;
conflicting reuse is rejected. A rejected or failed transaction leaves no
receipt, lines, request completion, or semantic audit. Posting, ledger effects,
supplier-bill matching, and reversal stay separate explicit workflows. The
Nest command remains behind a false flag and empty tenant allowlist until the
hosted migration, audit recovery, duplicate remediation, and controlled
provider gate are independently clear.

## CAD document-processing boundary (2026-08-01)

Python is a document-processing adapter, not an ERP transaction authority. It
may download a tenant-scoped source file from object storage, convert or parse
it, and return bounded extraction evidence. The application authority validates
the document's tenant/project relationship and commits derived scope rows,
exact money totals, replacement semantics, and audit evidence in one database
transaction. The future Nest adapter will own this same commit contract before
the transitional Next server path is retired.

## CAD evidence authority target (2026-08-01)

The NestJS modular monolith owns the official CAD evidence commit. Python may
only read object-storage input and return bounded, schema-validated evidence.
The Nest command must derive tenant membership from PostgreSQL, enforce
`document.manage`, lock and validate the document/project relationship, replace
derived scope rows only for that document, calculate exact integer totals, and
write idempotency plus semantic audit evidence atomically. The command remains
behind a false flag and empty tenant allowlist until hosted migration parity,
duplicate Purchase Order remediation, audit recovery, and the controlled
provider gate are clear. The existing Next transaction is the rollback path
until a separate canary proves parity.

## CAD processing intake target (2026-08-01)

The NestJS modular monolith is the only accepted entry point for CAD job
creation. A tenant-authorized user submits a strict command with an
Idempotency-Key; PostgreSQL derives the document project and actor membership,
commits one durable queued job, and stamps audit context. A server-only BullMQ
producer carries only the opaque job UUID.

Status reads return bounded state without storage paths, tenant authority,
worker payloads, or credentials. The future processor will lock the job,
obtain a short-lived object-storage URL, call the Python evidence adapter, and
route every official scope/BOM write back through Nest transactions. The
intake flag and tenant allowlist stay false/empty until worker retry, stalled
job, and canary evidence exist.

## Signed CAD evidence bridge (2026-08-01)

The target private worker boundary is now source-implemented. A PostgreSQL
claim is the only source of tenant, project, actor, document path, and attempt
context. NestJS issues a 120-second exact-object signed URL and signs the raw
request body with an HMAC request ID bound to the processing job. Python can
read and parse that object only; it returns bounded evidence, source hash,
producer identity, and deterministic item keys. It cannot receive database
credentials, service-role authority, tenant/project identifiers, or ERP state.

The processor retries through BullMQ while PostgreSQL remains authoritative for
claim, terminal state, duplicate delivery, stale requeue, and failure. Scope
commit calls the existing Nest transaction service. When requested, scope
replacement and draft BOM creation share that same idempotent Nest transaction;
immutable worker evidence is persisted first. All bridge/commit flags
and tenant allowlists remain closed until disposable Python/API/Redis proof,
draft-BOM parity, hosted schema reconciliation, audit recovery, duplicate PO
remediation, and a controlled canary are approved.

## Durable evidence and draft-BOM completion (2026-08-01)

Each processing attempt persists validated, hash-linked worker evidence in a
tenant-scoped PostgreSQL table before any derived scope or BOM write. Evidence
contains no signed URL, credential, tenant authority, or ERP write command.
NestJS creates at most one draft BOM per processing job in a transaction that
locks the job, revalidates actor/document context, computes integer-centavo
line totals, attaches the BOM ID, and writes semantic audit evidence. A
separate draft-BOM flag and tenant allowlist stay closed until end-to-end
processor/retry/canary proof and hosted release gates are approved.

## CI/release parity (2026-08-01)

The reproducibility pipeline compares the clean migration-built public schema
before applying any CI-only legacy Data API grants needed by historical RLS
tests. It persists an empty diff artifact even when the pinned Supabase CLI
reports no changes. Hosted SQL and provider deploys remain gated by the
read-only ledger, duplicate-data, audit-recovery, and provider checks.

## M2.5 canary boundary (2026-08-02)

The first canary must run the real Nest processor and PostgreSQL state machine
inside an isolated rollback transaction. A worker response is accepted only
through the signed request client and evidence schema; duplicate delivery must
be ignored after terminal success; scope, evidence, audit, and tenant isolation
must be asserted before any production flag can open.

The BullMQ transport must carry only `{ schemaVersion, jobId }`. Queue-level
deduplication is delivery protection, not ERP authority; PostgreSQL claim,
state transition, evidence, commit, and audit remain the source of truth after
Redis retries, restarts, or data loss.

## M2.5 recovery boundary (2026-08-02)

Recovery uses a bounded PostgreSQL query: stale `processing` claims are reset
to `queued`, then at most 100 queued opaque UUIDs are offered to BullMQ. Missing
Redis jobs are recreated through the idempotent queue key; Redis never decides
ERP completion, failure, evidence, scope, or audit. A periodic recovery
scheduler requires explicit feature/tenant gates, metrics, and canary review
before enablement.

## M2.6 recovery scheduler boundary (2026-08-02)

The recovery scheduler is a BullMQ transport trigger, not an ERP authority. It
is installed only when the recovery, processing-intake, worker-bridge, and
commit gates are true and the recovery tenant IDs intersect the processing and
commit tenant allowlists. The scheduler carries no tenant, document, or actor
data. Its Nest processor asks PostgreSQL to reset stale claims and return a
bounded opaque UUID batch, then reuses idempotent transport enqueue. Missing
Redis jobs are recoverable; terminal ERP state remains PostgreSQL-owned.

## Cortex search boundary (2026-08-02)

Cortex search is a read-only, tenant-scoped retrieval surface. The authenticated
profile supplies tenant and role; the request supplies only a bounded query.
Role-derived node-type scope is applied in PostgreSQL because the server
database role bypasses RLS. Every result must pass the Cortex entity registry's
type/ref-table check before a deep link, summary, freshness, or source citation
is returned.

Interactive graph search may debounce keyword requests, but it must not call an
embedding or LLM provider per keystroke. Semantic retrieval remains an explicit
Cortex chat operation with provider availability and spend controls. Search
never writes ERP state, creates approvals, or treats derived graph data as the
canonical record; official transactions remain Nest/PostgreSQL-owned.

## RAG suggestions boundary (2026-08-02)

BOM suggestions are a bounded, tenant-session-authorized read path over
approved-BOM embeddings. The route validates input before any provider call,
requires the same BOM visibility policy as the UI, caps result count and
similarity range, returns provenance, and fails closed when OpenAI or vector
retrieval is unavailable. Embeddings remain derived evidence; pricing,
approval, and official ERP transactions stay in the NestJS/PostgreSQL path.

The source candidate is CI-verified at
`fa283f94376aacd8f7febd9324b162697571efa1` (run `30713863937`): full static,
test, Postgres reproducibility, Nest transaction, container, and production
build gates passed. Promotion still requires the controlled planner to clear
hosted data-integrity blockers.

## Python AI boundary (M2.9, 2026-08-02)

Embedding generation is moving behind a private Python advisory worker. The
worker accepts only bounded text batches, authenticates callers with a server
secret, validates model dimensions and ordering, and returns evidence without
tenant or business-record authority. Next.js and Inngest retain compatibility
contracts while `AI_WORKER_URL` is absent; setting it makes Python the sole
embedding backend for those callers. Chat completion migration remains a
separate slice.

The reviewed source candidate is `56bb76eb2dc7f4f7f00fbe4690e06323696b0618`;
GitHub Actions run `30715179369` passed all executable gates. Hosted worker
enablement remains a separately reviewed deployment after the controlled
planner is clear.

## Change Request command authority (M3.0, 2026-08-02)

Client Change Requests follow the modular-monolith command pattern: Next.js
keeps the current compatibility action, while NestJS exposes a separately
gated, tenant-scoped command with PostgreSQL idempotency, explicit capability
authorization, same-opportunity design-file validation, atomic in-app intent,
and audit evidence. The browser never supplies tenant or actor authority.
Promotion requires a clean migration replay, hosted ledger reconciliation, a
single-tenant canary, and exact runtime evidence; the default flags remain
closed.

The disposable database contract is executable in
`apps/api/integration/change-request.database.integration.spec.ts`: one
transaction proves tenant and capability denial, replay/hash behavior,
design-role notification intent, semantic audit linkage, and rollback. Hosted
promotion still requires the independent release planner to clear.

GitHub Actions run `30718464238` executes this contract in the disposable
Postgres 17 lane with no skips. CI evidence does not authorize hosted SQL or
provider promotion while the release planner is not clear.

## Web command cutover seam (M3.1, 2026-08-02)

The Change Request form now has an incremental authority seam: the current
Next.js action remains the public compatibility contract, but an explicit
tenant allowlist can route the same validated command to Nest. The browser
supplies only form data plus an opaque retry key; Nest remains responsible for
tenant, actor, capability, transaction, idempotency, notification, and audit
authority. The allowlist is closed by default and the legacy direct path is
retained until hosted ledger and data-integrity gates clear.

Commit `d5ee498` proves the web seam with focused action tests and the full web
suite. This is source evidence only; it does not authorize hosted migration or
provider promotion.

## M3.1 CI and hosted-readiness checkpoint (2026-08-02)

Run `30732430851` passed on source SHA
`1b3bff1efac5901e34859263f43b1be94835eced`, including the disposable
Postgres 17 replay, no-skip database lane, Nest integration/container smoke,
and production build. E2E remains credential-gated. Hosted readiness is
healthy but promotion is not authorized while the planner reports eight
pending migrations, 12 duplicate Purchase Order records, and missing
`AUDIT_RECOVERY_TENANT_ID`.

## Purchase Order approval authority seam (M3.2, 2026-08-02)

Purchase Order draft submission, PM approval, and Commercial approval share the
Nest workflow command when an explicit tenant canary flag is enabled. Next.js
still validates the visible record and preserves the compatibility action, but
Nest owns official status transition, PostgreSQL idempotency, role checks,
notification intent, and audit evidence. Browser retries use an opaque stable
key. SCM issuance and rejection remain separate legacy paths until command and
notification parity is implemented.

Commit `fa3c20a` proves the seam with five focused tests and full Web/build
validation. Hosted promotion remains gated by the independent data planner.

## M3.3 Purchase Order rejection parity (2026-08-02)

The same Nest/PostgreSQL command boundary now covers rejection from PM,
Commercial, and SCM-pending states. A rejection is an idempotent, tenant-local
state transition to `draft` with transactional notification intent and audit
evidence. Next.js remains a compatibility surface behind the existing
closed-by-default tenant allowlist, and browser retries use one stable opaque
key per action. Supplier issuance and its external email side effect remain a
separate migration slice until an outbox-owned delivery contract is proven.

Source commit `16904f0` passed the full executable CI pipeline in run
`30733959058`, including fresh Postgres 17 replay and the Purchase Order
transaction integration. This source evidence does not authorize hosted SQL
or provider promotion while the controlled planner is not clear.

## M3.2 CI checkpoint (2026-08-02)

Run `30733168171` passed on final SHA
`1bc232e55fa2f122aea5182b5ca442d536e916d4`, including fresh Postgres 17
replay, database tests without skips, Nest integration/container smoke, and
production build. E2E remains credential-gated. Healthy Railway/Vercel
readiness does not override hosted data-integrity blockers.

## M3.4 SCM issuance and supplier delivery authority (2026-08-02)

The target command boundary now includes SCM issuance. Nest owns the
`pending_scm_issuance -> issued` transition, `po.issue` authorization,
tenant-local idempotency, transaction locking, notification intent, and audit.
The Next.js action remains a closed-by-default compatibility adapter and the
existing UI remains visually unchanged.

Supplier email is a separate server-owned outbox child created in the same
transaction as the status change, never sent from the transaction. Its
tenant-scoped snapshot is immutable for delivery, its BullMQ job contains only
opaque IDs, and provider retries reuse one idempotency key. Delivery success
updates `supplier_email_sent_at` and writes audit evidence; transient failure
retries and final failure is durable dead letter. Python and browser code have
no transaction or delivery authority.

The source/CI proof is complete in commits `21a152d` / `52b6288` and run
`30735228348`. Hosted promotion is still a separate gate: the read-only
planner reports 55/65 migrations, 12 duplicate Purchase Orders, and no
`AUDIT_RECOVERY_TENANT_ID`. No production flag, SQL, queue, provider, or
business-data mutation is authorized until those owner decisions are complete.

## Finance journal posting authority (M3.5, 2026-08-02)

The target boundary for manual journal posting is a Nest command, not a React
component or direct browser write. A compatibility Server Action may validate
the current screen and call core only for an explicit tenant canary; otherwise
it retains the existing legacy RPC path without changing visible behavior.

Nest must authorize the tenant membership and `finance.post` capability under a
row lock, accept an opaque `Idempotency-Key`, and commit the idempotency record,
database posting call, result replay, and semantic audit in one PostgreSQL
transaction. The existing `post_journal_entry` function remains the sole
ledger authority for numbering, fiscal-period checks, balance checks, and the
posted state. Tenant composite keys and forced RLS prevent cross-tenant
replay. The two gates and tenant lists remain closed until hosted migration and
data-review gates clear. Python/AI may analyze or recommend but never post.

Source/CI proof is complete in commit `97106ba` and run `30736271967`; this is
not hosted promotion evidence while the planner reports 55/66 migrations,
duplicate Purchase Orders, and missing audit-recovery authority.

## Cortex external-model privacy boundary (M3.6, 2026-08-02)

Before any embedding or external chat completion, Cortex must transform model
context through a deterministic redaction policy. Direct identifiers in the
user prompt, prior turns, graph titles/summaries, focused-record summaries,
and semantic-query text are replaced with typed placeholders while tenant and
RBAC filtering remain unchanged. The model receives only the redacted prompt
pack; deterministic in-product retrieval remains the source-grounded fallback.

Every query must append hash-bearing started/completed audit evidence without
storing raw prompt text in the audit diff: model/fallback outcome, prompt hash,
response hash, redacted preview, source/citation counts, and context metadata.
Failures in audit persistence remain observable and fail open for read-only
chat; they never authorize a mutation. This slice changes no visible landing
surface and introduces no hosted schema mutation.

## CAD processing authority handoff (M3.7, 2026-08-02)

The target upload boundary is a tenant-scoped Nest command. An explicit,
closed-by-default Next canary may create the document record, then submit a
binary DWG processing job to Nest/BullMQ. Nest owns authorization, signed
Python evidence intake, scope-item/draft-BOM commits, idempotency, and audit;
Python remains advisory/read-only and the browser remains presentation-only.

The Next compatibility adapter must fail closed when the core command is
selected: it may report a queued/processing state and poll a validated status
proxy, but it must never write CAD scope items or fall back to its legacy
writer. The selector `ERP_DOCUMENT_PROCESSING_VIA_API` and UUID allowlist
`ERP_DOCUMENT_PROCESSING_TENANT_IDS` stay disabled until hosted planner,
worker, evidence, RBAC, and rollback gates are proven.

## Stock Receipt creation authority (M3.8, 2026-08-02)

The target boundary for creating a Stock Receipt is a tenant-scoped Nest
command. Nest owns `inventory.manage` authorization, PO/warehouse/delivery
same-tenant validation, exact decimal conversion, remaining-quantity
concurrency checks, tenant-local idempotency, and semantic audit. PostgreSQL
constraints and the existing inventory transaction remain the integrity
authority; Python/AI can advise but never commits inventory evidence.

Next may remain a compatibility adapter while the command is canaried. Its
selector and strict UUID allowlist are independently closed by default. Once
selected, a failed core request is returned to the user and never falls back
to a second writer. The form supplies one stable opaque retry key so a lost
response can be replayed safely without duplicate receipt creation.

## Stock Receipt post/reversal authority (M3.9, 2026-08-02)

Posting and reversal are separate Nest command boundaries. Nest derives the
actor and tenant from authenticated membership, requires `inventory.post_receipt`,
locks the same-tenant receipt, and invokes the existing PostgreSQL functions
for numbering, ledger balance, fiscal-period, and state authority. The
idempotency record, official result, and semantic audit evidence commit in the
same PostgreSQL transaction. A retry with the same tenant/key/command replays
the stored result; a conflicting command is rejected.

Next selectors
`ERP_INVENTORY_RECEIPT_POST_VIA_API`/`ERP_INVENTORY_RECEIPT_POST_TENANT_IDS`
and
`ERP_INVENTORY_RECEIPT_REVERSE_VIA_API`/`ERP_INVENTORY_RECEIPT_REVERSE_TENANT_IDS`
remain exact-`true` plus explicit-allowlist canaries, false/empty by default.
When selected, Next fails closed on core outage or rejection and never invokes
the direct RPC fallback. The visible receipt controls remain unchanged.

The forward-only idempotency migration is source-complete and replayed in the
disposable PostgreSQL 17 lane. Hosted Supabase remains a separate release gate
until its migration ledger, duplicate-PO review, audit-recovery tenant,
readiness, exact SHA, and rollback evidence are clear.

## BOM-to-Purchase Order authority (M3.10, 2026-08-02)

The canonical single-PO-from-BOM command is a tenant-scoped Nest transaction.
The browser may submit only BOM/project/vendor/date intent plus an opaque retry
key. Nest derives actor and tenant membership, requires `po.create`, locks the
approved BOM and related rows, copies the authoritative lines, allocates the
tenant PO number, locks the BOM, and records the idempotency result and semantic
audit in the same PostgreSQL transaction. PostgreSQL constraints and the
existing request table remain the integrity boundary; Python/AI cannot create,
approve, or finalize a PO.

The Next selector
`ERP_PO_BOM_CREATE_WRITES_VIA_API` with
`ERP_PO_BOM_CREATE_WRITES_VIA_API_TENANT_IDS` is exact-true plus explicit UUID
allowlist, false/empty by default. Core-side
`ERP_PO_BOM_CREATE_WRITES_ENABLED` and its UUID allowlist are independently
closed. On core rejection or outage, the selected path fails closed. The
grouped-by-supplier BOM path is intentionally not folded into this command and
requires its own authority/replay design before canarying.

## Grouped BOM-to-Purchase Order authority (M3.11, 2026-08-02)

Grouped supplier generation is a separate tenant-scoped Nest command, not a
client-side loop. The command accepts only a BOM reference and derives the
tenant, actor, capability, source lines, active rate cards, vendor names, and
approved cost-code mappings server-side. One PostgreSQL transaction allocates
all tenant PO numbers under an advisory lock, creates the complete assigned
supplier set, records unassigned lines in the returned preview, locks an
approved BOM only after successful inserts, persists one replayable grouped
result, and writes semantic audit evidence. A failed transaction creates no
partial PO set and leaves the BOM unlocked.

The Next action remains a compatibility adapter selected only by exact-`true`
plus UUID allowlist. A stable opaque browser retry key replays the whole group;
core rejection or outage fails closed with no direct-writer fallback. API and
Next grouped flags remain disabled until hosted migration/data/audit review,
tenant canary, readiness, exact-SHA, and rollback evidence are approved.

## Delivery receipt authority (M3.12, 2026-08-02)

Recording a delivery receipt is an official procurement state change owned by
Nest. The browser submits only optional bounded notes and an opaque retry key;
Nest derives tenant and actor membership, requires `delivery.receive`, locks
the same-tenant schedule, permits only `scheduled` or `in_transit`, stamps
receipt time/actor/notes, and commits the state, idempotency result, and
semantic audit in one PostgreSQL transaction. A conflicting retry key or
concurrent status change is rejected; an exact replay returns the stored
result. The ledger is forced-RLS and service-only.

The existing delivery panel remains the compatibility surface. Its Next action
routes to `POST /v1/procurement/deliveries/:deliveryScheduleId/receipt` only
for the exact-`true` selector
`ERP_DELIVERY_RECEIPT_WRITES_VIA_API` plus
`ERP_DELIVERY_RECEIPT_WRITES_VIA_API_TENANT_IDS`; selected core failures never
fall back to the direct Server Action. API and Next gates remain false/empty
until hosted migration/data/audit review, a disposable/demo tenant canary,
readiness, exact SHA, and rollback evidence are approved. Site preparation,
inspection, acceptance, and cancellation are separate legacy steps for later
milestones.

## M3.12 correction evidence (2026-08-02)

The delivery command now preflights the same-tenant schedule before claiming
the idempotency row. This preserves a stable tenant-safe not-found response
when a caller supplies an unknown or cross-tenant schedule id while retaining
the composite database foreign key as the final integrity guard. The corrected
transaction passed the disposable Postgres 17/Redis integration in CI. Hosted
activation remains gated by migration drift, duplicate data, audit-recovery
approval, readiness, exact SHA, and rollback evidence.

## Finance journal reversal authority (M3.13, 2026-08-02)

Journal reversal is a Nest-owned command at
`POST /v1/finance/journals/:journalEntryId/reverse`. The browser submits only
the bounded reason, posting date, and opaque idempotency key. Nest derives the
tenant and actor from the authenticated principal, rechecks `finance.post`,
preflights same-tenant journal visibility, locks the journal, and invokes the
existing PostgreSQL reversal function inside one transaction. The transaction
stores the strict result in `journal_reverse_requests` and writes semantic
audit evidence; replay returns the exact stored result. Python/AI cannot
approve or finalize this financial state change.

The Next adapter selects the command only for exact-`true` plus UUID-allowlisted
`ERP_FINANCE_JOURNAL_REVERSE_WRITES_VIA_API`; API and Next write gates are
independently closed by default. A selected core failure never falls back to a
second writer. The migration is source-complete and disposable-integration
ready, but hosted Supabase migration drift, duplicate demo data, audit
recovery, readiness, exact SHA, rollback, and provider spend approval remain
independent release gates.

## Delivery inspection-start authority (M3.14, 2026-08-02)

Inspection start is the next Nest-owned delivery state command at
`POST /v1/procurement/deliveries/:deliveryScheduleId/inspection/start`.
The browser submits an empty strict command and an opaque idempotency key.
Nest derives tenant and actor from the authenticated principal, rechecks
`delivery.receive`, locks the same-tenant schedule, permits only `received`,
creates the pending inspection, moves the schedule to `inspecting`, and
commits the exact replay result plus semantic audit in one transaction. The
existing delivery workflow ledger is reused with a new action enum value.

The compatibility action selects Nest only for exact-`true` plus UUID-allowlist
configuration; API and Next gates are false/empty by default and selected core
failures never fall back. Inspection result/acceptance, site preparation, and
cancellation remain separate later commands. Hosted migration drift,
duplicate demo data, audit recovery, readiness, exact SHA, rollback, and
spend approval remain independent promotion gates.

## Delivery inspection-completion authority (M3.15, 2026-08-02)

Inspection completion is a Nest-owned terminal delivery command at
`POST /v1/procurement/deliveries/:deliveryScheduleId/inspection/complete`.
The browser submits only the inspection result and bounded defect/acceptance
notes plus an opaque idempotency key. Nest derives tenant and actor, rechecks
`delivery.receive`, locks the `inspecting` schedule and pending inspection,
requires defect notes for `fail`, records the inspection outcome, transitions
the schedule to `accepted` or `rejected`, and commits exact replay data plus
semantic audit in one transaction. Python/AI cannot finalize this state.

The compatibility action selects Nest only for exact-`true` plus UUID-allowlist
configuration; API and Next gates are false/empty by default and selected core
failures never fall back. Delivery cancellation and later stock/three-way
matching effects remain separate commands. Hosted migration drift, duplicate
demo data, audit recovery, readiness, exact SHA, rollback, and spend approval
remain independent promotion gates.

## Delivery cancellation authority (M3.16, 2026-08-02)

Cancellation is a Nest-owned terminal delivery command at
`POST /v1/procurement/deliveries/:deliveryScheduleId/cancel`. The browser
sends only a bounded reason and opaque idempotency key. Nest derives tenant and
actor, rechecks `delivery.receive`, locks the same-tenant schedule, permits
only cancellable non-terminal statuses, stamps cancellation evidence,
persists the exact replay result, and writes semantic audit in one PostgreSQL
transaction. Python/AI cannot finalize this state.

The existing delivery action selects Nest only for exact-`true` plus UUID
allowlist configuration; selected core failures fail closed. The four
cancellation flags are false/empty by default, and the visible delivery UI is
unchanged. Hosted migration drift, duplicate demo data, audit recovery,
readiness, exact SHA, rollback, integration, and spend approval remain
independent promotion gates.
