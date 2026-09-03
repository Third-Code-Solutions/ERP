# ABI OPS RBAC source summary

## Current authority

The repository has exactly thirteen persisted roles:

| Role | Current route alias | Notes |
| --- | --- | --- |
| `owner` | `admin` | Legacy super-admin; capability rank is above admin. |
| `estimator` | `estimator` | Distinct route identity aligned to its retained capability/read projections. |
| `pm` | `pm` | Distinct route identity; project audit and mobilization grants remain independently checked. |
| `admin` | `admin` | Workspace administrator. |
| `sales` | `sales` | Sales/BD workflows. |
| `commercial` | `commercial` | Estimation and commercial workflows. |
| `design` | `design` | Design lifecycle. |
| `sd_pm_pe` | `sd_pm_pe` | Service Delivery / PM / PE. |
| `finance` | `finance` | Finance and KYC control. |
| `procurement` | `procurement` | Procurement and PO issuance. |
| `safety` | `safety` | Safety/DOLE lane. |
| `cx` | `cx` | Punchlist, warranty, and CNPS. |
| `viewer` | `viewer` | Requested as read-only across the product; current policy is narrower. |

Evidence:

- `packages/database/src/schema/enums.ts`
- `supabase/migrations/20260509164536_initial_schema.sql`
- `supabase/migrations/20260512100000_third_code_erp_ops_phase_0.sql`
- `packages/shared-types/src/authorization.ts`
- `packages/auth/src/server.ts`
- `apps/api/src/auth/supabase-jwt.guard.ts`

`public.users.role` is the active runtime identity authority. Authorization
capabilities are centralized in `packages/shared-types/src/authorization.ts`
and consumed by the Web helpers and Nest capability guard.
Navigation/direct-route policy preserves all roles; only `owner` inherits the
explicit `admin` super-admin projection.

## Source inventory counts

- 118 Next.js page routes after the password slice.
- 104 session/recovery-protected page routes: the prior 102 plus
  `/settings/profile` and recovery-bound `/auth/update-password`.
- 174 explicit HTTP operations: 133 NestJS and 41 Next.js operations.
- 158 HTTP operations are session/capability/recovery protected; 16 are public,
  token/signature controlled, callback/health, webhook, or deprecated.
- 81 central capabilities after adding the dedicated opportunity-export
  boundary; 42 are referenced by Nest controller guards.
- 1,417 role/protected-resource matrix records: 0 `FAILED`, 32
  `NEEDS DECISION`, 1,071 `NOT TESTED`, 298 `PARTIAL`, and 16 `BLOCKED`.
- 119 matrix records have an automated-test result other than `NOT TESTED`;
  229 have browser result `BLOCKED`; 93 have live result `NOT RUN`.

## Confirmed policy conflicts

### Legacy route-policy alignment

`estimator` and `pm` are now evaluated as distinct roles. Estimator retains its
evidenced estimating/procurement reads but no longer sees or directly enters
`/inventory/**` or `/admin/**`; PM retains the prior operational route list.
Only `owner → admin` inheritance remains. All thirteen roles have automated
route-table coverage and all eleven supplied identities passed the read-only
Admin/Inventory production-build browser matrix.

Status: PARTIAL. The access mismatch is repaired, but estimator/PM browser
checks remain blocked because no identities were supplied.

The separate universal-search policy is now aligned to the Material result
destination. Owner, Admin, and Commercial retain Material search; Estimator,
PM, Service Delivery, and Procurement keep all non-Material legacy aliases but
no longer query or receive Material results.

### Material universal search

The shared Web/Core contract now evaluates Material against the exact persisted
role instead of the legacy role aliases. Web skips the Material table before
query construction for denied roles; Core removes Material from the graph scope
before database retrieval. Independent QA verified 234/234 role/type outcomes
with no remaining search destination dead end.

Status: PARTIAL. Automated Commercial-positive and tenant-isolation checks pass,
and live Procurement/Service Delivery negative checks pass. The configured
tenant's Material catalog is empty, so a live Commercial Material hit could not
be verified without mutating fixture data; Estimator and PM identities remain
unavailable.

### Route catch-all

The dashboard layout now fails closed for any path absent from an explicit
99-template route registry. Dynamic parameters match one segment, ancestors do
not authorize descendants, and every registered page has a thirteen-role
outcome derived from its page gate or established read projection. Filesystem,
registry, and independent expected-policy keys must remain exactly equal.
Focused tests passed 63/63; full type, lint, build, secret-scan, and independent
authorization review passed. Viewer, Commercial, Finance, and Sales also passed
an isolated production-build browser matrix covering allowed pages, registered
forbidden redirects, and unknown-path 404 states without protected UI. Status:
PARTIAL until the stacked branch reaches an authorized reviewed environment.

### Project tabs and audit

Stacked PR #17 filters project tabs and guards direct Audit and Access routes
from the existing central policies. Audit BOM and invoice entity discovery is
also skipped when those domains are denied. Status: PARTIAL; automated and all
supplied-role browser checks pass, while two browser identities and the
database-backed budget trigger check remain blocked.

### Legacy project chat

The stacked `agent-05/ai-chat-data-boundaries` branch repairs `/api/ai/chat` by
gating project, BOM, invoice, and PO reads independently with the checked-in
central policy. Denied-domain branches issue no query, context is bounded and
tenant/project scoped, responses are private/no-store, and all thirteen roles
have automated policy coverage. Status: PARTIAL because the provider was
deliberately disabled during browser verification and no data-bearing live
model response was requested.

### Project-detail summaries

Stacked PR #17 gates project overview, Cost/Budget, Billing, Audit, Access,
BOM/Togal, tabs, and quick links by the existing domain policies. Denied BOM,
PO, invoice, delivery, and audit-discovery branches issue no sensitive query;
denied derived metrics and placeholders are omitted. Sensitive deep links fail
closed before database access. Status: PARTIAL under the strict definition of
done; automated tests cover all thirteen roles and all eleven supplied
identities passed browser verification, but `estimator` and `pm` identities and
database-backed budget-trigger execution remain blocked.

### CSV opportunity export

The export endpoint now uses a dedicated capability matching the ten roles
whose executive dashboard renders the control. Safety, CX, and Viewer receive
403 before query work. Filters are strict and Manila-day aware; Account,
Project, and User joins are tenant-qualified; results are deterministically
bounded; spreadsheet-formula prefixes are neutralized in untrusted text; all
statuses use hardened private headers.

Status: PARTIAL pending an authorized deployed-environment check. Automated
policy and export coverage passed, independent QA returned `GO`, Sales and
Commercial received valid five-row CSVs in the isolated production build, and
Viewer/Safety control visibility plus direct 403 behavior passed.

### Won-to-Project atomic handoff

The browser Pipeline now routes Won/Closed Won exclusively through the gated
Core authority. Stage, SLA, audit, Project/backlink, pre-con checklist/items,
notifications, and idempotency completion share one database transaction;
failures return visibly without a local write or legacy conversion fallback.
The Web action validates the committed result and returns its Project ID.

Both Core mutations now grant exactly Owner, Admin, and Sales. The other ten
roles are denied by the central map, controller guard, and locked-membership
service check before effects. Every linked Account must resolve under the
authenticated tenant before ledger, KYC, or Project work. Dual-track PPRF KYC
requires both canonical approvals; trackless legacy records retain Account KYC
compatibility. Same-key authorized replay, revoked/denied membership, and
tenant-isolated ledgers are covered.

`/pipeline/conversion` remains readable to all roles but renders mutation
controls only for Owner/Admin/Sales. All eleven supplied identities passed the
final built-browser visibility/navigation matrix; the other eight saw the same
opportunity data with an accessible read-only notice and no controls. Direct
Core calls reached business validation for the three allowed roles and returned
403 for the other eight.

Status: PARTIAL. Automated, PostgreSQL rollback, independent QA, and browser
authorization checks pass, but the demo tenant has no safe Contract-stage
fixture for a real positive Won conversion and Estimator/PM identities remain
unavailable. No demo data was changed.

### Atomic opportunity stage transitions

Every allowed Pipeline stage move now uses the same tenant-selected Core
transaction. The former non-Won Web writer, separate semantic-audit call, and
best-effort SLA rollover are removed. Core locks current membership and the
Opportunity, validates tenant-linked Account/KYC and shared edge/reason rules,
then commits stage, semantic audit, SLA, and idempotency state atomically.
Missing Lost reasons now fail closed. Replay, key reuse, concurrency, strict
result parsing, and rollback at audit/SLA/completion boundaries are covered.

Both Pipeline callers distinguish Lost from a real regression before network
work. Required reasons are labelled and capped at 1,000 characters; blank,
oversized, or duplicate pending submissions issue zero requests. Returned and
transport failures show accessible alerts without optimistic movement or
refresh. Retry clears stale alerts urgently before React's transition boundary,
while success refreshes only after a validated Core result. Mutation-sensitive
validators protect both the cross-surface WO-11 authority and actual component
wiring.

Status: PARTIAL. Five independent QA rounds ended `GO`, the final focused lanes
passed up to Core 128/128, Pipeline 70/70, Web/Core-client 230/230, shared
56/56, and WO-11 5/5, and all eleven supplied identities passed the browser
role matrix. Safe local-Core browser probes proved distinct reason dialogs,
single-submit behavior, typed/transport failures, 32–34 ms stale-alert clears,
zero failure refresh, and one simulated-success refresh. Live persistence and
rollback remain blocked without an isolated database fixture; legacy
`resubmission` lacks browser data, and Estimator/PM identities are unavailable.
No hosted Core request, demo mutation, or deployment occurred.

### Project-detail Opportunity create and stage transition

PR #25 routes both Project-detail Opportunity mutations exclusively through
Core. Independent browser QA began from clean HEAD
`b7a72d82bb317d22dddc380222e3ca0ff84d4943`. Creation uses
`POST /v1/crm/opportunities`; transitions use
`POST /v1/crm/opportunities/[id]/stage-transition`. The Web actions have no
local Opportunity writer, separate audit, SLA/conversion effect, or fallback.
Core rechecks current tenant membership and the exact capability, validates the
Project and its Project-derived Account, applies Account/KYC rules, and owns
atomic Opportunity state, semantic audit, SLA where applicable, and
idempotency completion.

Creation is restricted to `opportunity_creation`. TCV, signed GP, and weighted
TCV cross the API as canonical decimal-centavo strings, with exact integer
weighting and explicit-offset Philippine dates. Owner, Admin, and Sales alone
receive create/transition controls and Core mutation authority; the other ten
roles retain readable Project Opportunity data but are denied before effects.

Status: PARTIAL. The authoritative mutation contract passed twice at 29/29;
shared contracts passed 20/20, Project Web passed 312/312, Core creation/stage
passed 93/93, and root type/lint plus API/Web builds passed with 89/89 Web
pages. Chromium 147.0.7727.15 rendered the accessible unauthenticated login on
loopback Web `127.0.0.1:3317` with fake Core `127.0.0.1:3318`: 1440×900 loaded
in 1,586 ms and 390×844 in 1,321 ms, with zero console/page/request failures,
non-GET calls, or fake-Core mutations. Both servers were stopped and their
ports confirmed free. Authenticated browser coverage is `BLOCKED` for
all thirteen roles because no secure reusable isolated session was available;
QA correctly refused the daily browser. The eleven supplied roles remain
`PARTIAL`, while Estimator and PM remain `BLOCKED` because their identities are
also missing. Live result is `NOT RUN`; the PostgreSQL canary remains blocked
without its database binding and explicit opt-in.

### Viewer semantics

The request defines `viewer` as read-only with visibility across the product.
Current navigation/tests intentionally deny Finance, KYC, invoices, claims,
reports, and Admin. Status: NEEDS DECISION for sensitive Admin/user-management
reads; all mutations remain denied.

## Password-flow result

All thirteen roles now share a role-neutral own-account password flow. Sign-in
links to a real Supabase recovery request, recovery callbacks are redirect-
allowlisted and cryptographically bound to a recent recovery session, and
Settings/Profile requires same-user password reauthentication before updating.
Password material is not written to the application database or evidence files.

Eleven supplied accounts passed real browser sign-in, dashboard rendering,
Settings/Profile rendering, ordinary-session recovery-route denial, and sign-
out. `estimator` and `pm` remain browser-blocked because neither identity is in
the request, seed, or production-role E2E helper.

Strict status remains `PARTIAL`: one real recovery request returned SDK success,
but mailbox delivery/recovery-link completion was unavailable; the guarded
Linux password-rotation lane could not complete its initial browser login. Its
external cleanup process independently verified the original credential after
each attempt, so no demo account remained modified.

## Project-chat result

The legacy project-chat route now validates bounded input before quota, database,
audit, or provider work and applies the existing project/BOM/finance/PO policy
to each database branch. Focused tests passed 21/21, including all thirteen
roles; Web type-check, source lint, production build, and an independent secret
scan passed. Viewer, Finance, and Commercial passed isolated browser/API smoke
checks with the provider disabled. Strict status remains `PARTIAL` until a
reviewed environment can verify a data-bearing live provider response.

## Project-detail result

Project-detail access now projects directly from the central capability and
universal-search registries without changing their grants. Focused tests passed
108/108 across sixteen files, including every role and direct-route query
short-circuiting. Complete Web/E2E TypeScript, full source lint, independent QA,
and the 89/89-page production build passed.

All eleven supplied identities passed login, project list/detail, refresh,
browser history, sign-out, and 66/66 sensitive direct-route assertions. The
final denial-only rerun passed 32/32: the not-found boundary rendered without
protected UI, the prior recovery boundary, or any console/page/request error.
No form, ERP data, AI provider, or production environment was mutated.
