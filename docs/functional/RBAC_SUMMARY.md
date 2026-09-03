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
- 175 explicit HTTP operations: the prior source inventory plus the mounted
  daily-task completion command (134 NestJS and 41 Next.js operations).
- 158 HTTP operations are session/capability/recovery protected; 16 are public,
  token/signature controlled, callback/health, webhook, or deprecated.
- 81 central capabilities after adding the dedicated opportunity-export
  boundary; 42 are referenced by Nest controller guards.
- 1,456 role/protected-resource matrix records: 0 `FAILED`, 32
  `NEEDS DECISION`, 1,071 `NOT TESTED`, 331 `PARTIAL`, and 22 `BLOCKED`.
- 197 matrix records have an automated-test result other than `NOT TESTED`;
  279 have browser result `BLOCKED`; 145 have live result `NOT RUN`.

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

### Daily task completion

All thirteen roles retain `/tasks` read access scoped to their current tenant
and authenticated assignee. Completion is a separate exact policy: Owner,
Admin, Service Delivery PM/PE, PM, and Safety are allowed; Estimator, Sales,
Commercial, Design, Finance, Procurement, CX, and Viewer are denied before
effects and receive no completion control. Service Delivery PM/PE, PM, and
Safety remain assignee-only, while Owner/Admin have a same-tenant command
override; their list/read surface remains assignee-scoped.

The mounted Web action sends only strict normalized notes through the
fail-closed daily-task tenant selector to one authenticated
`POST /v1/daily-tasks/[id]/completion` Core command. It has no local task
writer, audit, SLA helper, or fallback. Core locks current membership and the
tenant task, rechecks capability/assignee/pending state, and transactionally
commits completion metadata, every matching open legacy daily-task SLA closure,
and one semantic audit. That redacted semantic record doubles as a durable
tenant/key-hash receipt for replay, key conflict, rollback, and concurrency;
raw notes and keys are not part of the receipt.

Status: PARTIAL. Independent source QA at clean `cab3af16` found no introduced
P0-P2 and passed contract 22/22, shared 35/35, Core 33/33, and Web 42/42—132/132
tests total—plus root lint, cached 5/5 typecheck, and diff checks. Safe local
HTTP/SSR on Next.js 15.5.23 redirected `127.0.0.1:3317` by 307 to
`http://localhost:3317/auth/login`, then returned 200 in 9.155-second cold and
0.584-second warm probes. Fake Core `127.0.0.1:3318` received zero calls; no
hosted write occurred; both servers stopped and ports were free.

Authenticated browser, console, interaction, and accessibility evidence is
`BLOCKED` for all thirteen roles because the HTTP/SSR probe was not a real
browser assertion, only the daily Opera session was exposed and correctly left
untouched, isolated providers were unavailable, and no secure reusable
authenticated session existed. The eleven supplied identities are `PARTIAL`;
Estimator and PM are `BLOCKED` because their identities are also missing. Live
is `NOT RUN`; the protected PostgreSQL canary was 1/1 skipped and no database
was contacted.

Pre-existing, non-blocking follow-up remains separate from this source result:
the generic audit trigger can include `completion_notes` in a generic diff
beyond the redacted semantic receipt, and the daily-task Project/assignee
foreign keys are not tenant-composite. PostgreSQL runtime proof is likewise
still unavailable. These items do not reclassify the slice as an introduced
P0-P2 defect.

### Atomic PPRF submission

New intake at `/crm/opportunities/new/pprf` is restricted to Owner, Admin, and
Sales. The existing-Opportunity detail route remains readable to all thirteen
roles, but only Owner/Admin/Sales receive its submit/resubmit form; the other
ten receive an accessible read-only prior-version state. Both Web actions
enforce that capability independently and delegate once to the atomic PPRF
service, which remains authoritative for current membership, tenant scope, and
all Account, Opportunity, versioned PPRF, dual KYC, semantic audit, SLA,
notification, and durable replay effects.

Independent contract QA first found a P1 mounted-field defect: the strict
intake action required `area_sqm`, but the actual form did not emit it, so every
native intake stopped before the service. Source commit `421bfacf` added the
optional whole-positive-integer Opportunity-area control without conflating it
with required decimal PPRF `floor_area_sqm`; Agent 12 then made the mounted
twenty-field inventory fail closed against missing, duplicate, unknown,
spread-hidden, or parser-swapped fields. Final evidence is WO-11 59/59 twice,
mounted PPRF 74/74, atomic service 42/42, Web typecheck/lint, the 89-page
production build, diff checks, and gitleaks. The P1 is closed in source and the
independent contract result is `GO`.

Status: PARTIAL. Authenticated browser serialization, interaction, and role
coverage is `BLOCKED` for all thirteen roles because no secure reusable
isolated browser session was available; Estimator and PM are additionally
blocked because no identities were supplied or seeded. Live status is
`NOT RUN`, and real PostgreSQL rollback/concurrency/trigger proof remains
blocked without an explicitly isolated database binding. The current exact
in-app recipient sets are preserved, but the recipient-role taxonomy remains
`NEEDS DECISION`. A bounded P2 also remains: historical receipt reads accept
unknown keys through `receiptSchema.passthrough()` even though current writes
and returned known fields are bounded and privacy-verified.

### Atomic site inspection and RFI creation

The inspection detail route remains a tenant-scoped history surface for all
thirteen roles. Owner, Admin, and Commercial alone receive inspection-submit
and RFI-create controls. Both Web actions independently enforce
`site_inspection.submit`, bind tenant/Opportunity/inspection identity on the
server, and delegate once to the atomic service. Inspection submission commits
the inspection, safe photo links, semantic audit/receipt, Design-handoff SLA,
and durable Design notifications together; RFI creation commits its RFI and
mandatory semantic audit/receipt together. Exact full-key replay, conflict, and
concurrency behavior is covered without a schema change.

Independent QA closed both original P1s: the former inspection path could
report failure after partial durable success, and the former RFI path could
persist without its audit and had no durable idempotency. It then closed three
P2 proof/integrity defects: the first literal verifier targeted removed local
writers and was replaced by an AST/mutation contract; replay no longer
recomputes recipients from the mutable current Design roster; and the
notification reader preserves nullable-row cardinality so corrupt null or
invalid recipients fail before count/hash validation. Final evidence is WO-12
77/77 twice (four authoritative/benign positives and 73 hostile mutations) and
146/146 focused service/mounted tests, plus Web typecheck/lint, root typecheck,
the 89-page production build, diff checks, and gitleaks. No P0-P2 remains in
the verified source contract.

Status: PARTIAL. Authenticated browser, offline IndexedDB, and Storage evidence
is `BLOCKED` for all thirteen roles because no safe reusable isolated session
or storage lane was available; Estimator and PM are additionally identity-
blocked. Live PostgreSQL and hosted execution are `NOT RUN`. HTML report
archival intentionally remains best-effort after the atomic commit and reports
an honest warning on failure; a durable repair path remains a bounded follow-up
decision rather than part of the committed transaction.

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
