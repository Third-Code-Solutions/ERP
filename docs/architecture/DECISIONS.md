# Architecture Decisions

## D-001 — Incremental modular monolith

Decision: keep Next.js and introduce one NestJS deployment as the core ERP
transaction authority. Do not perform a big-bang rewrite or split business
modules into microservices.

Reason: preserves working behavior and supports cross-module transactions while
making authority boundaries explicit.

## D-002 — PostgreSQL is the source of truth

Decision: official records, workflow state, audit evidence, and integrity
constraints live in PostgreSQL. Caches, queues, search indexes, and AI outputs
are rebuildable projections or evidence.

## D-003 — NestJS owns official sensitive writes

Decision: migrated commands are authorized and committed by NestJS. Next.js
adapts existing UI contracts; the browser never writes sensitive tables
directly.

## D-004 — Python is analysis-only

Decision: Python may parse, extract, forecast, analyze, or render documents. It
may not approve or finalize an ERP transaction.

## D-005 — Tenant and actor derive server-side

Decision: never accept tenant or actor identity in a business command. Verify
the Supabase bearer token, then load active tenant membership and role from
PostgreSQL.

## D-006 — Transactional audit attribution

Decision: stamp verified actor claims inside the same PostgreSQL transaction as
the mutation so database triggers produce attributable audit evidence. Do not
rely on a second best-effort audit write.

## D-007 — Feature-flagged compatibility adapters

Decision: each migrated Server Action keeps its external behavior and selects
the Nest path only when a server-side flag is enabled. An ambiguous Nest
failure never falls through to a duplicate legacy write.

## D-008 — Strict shared contracts

Decision: use shared strict Zod command/result schemas across the Next adapter
and Nest boundary. Reject unknown fields rather than silently stripping
attacker-controlled input.

## D-009 — Optimistic concurrency for editable records

Decision: editable commands include the last observed version/timestamp and
reject stale writes. Higher-risk workflows will use explicit state versions and
idempotency keys.

## D-010 — Clean-room product implementation

Decision: external ERP products may inform general capability research only.
Do not copy code, schema, UI, text, branding, tests, documentation, or internal
structure.

## D-011 — Disposable integration evidence

Decision: database integration tests run inside a transaction that always
rolls back and are enabled only in the clean PostgreSQL 17 CI job. Container
readiness uses the disposable database and real Redis. Do not probe official
transaction writes against a configured remote database.

## D-012 — Database drift is a release gate

Decision: a target database must exactly match the reviewed migration ledger
before a migrated Nest command can be enabled. Database drift is reported; it
is never repaired automatically during an application release.

## D-013 — Non-linear history uses reconciliation

Decision: when later migrations are applied after a missing version, do not
replay historical files directly. Restore the target into an isolated clone,
diff it against the clean PostgreSQL 17 target, and create one reviewed
forward-only reconciliation migration. Repair ledger history only after
catalog and data equivalence are independently proved.

## D-014 — Database and Storage recovery are separate

Decision: platform database backup/PITR is the database recovery authority;
encrypted logical dumps are supplemental. Storage objects require a separate
inventory and recovery artifact because database restore covers Storage
metadata, not deleted objects.

## D-015 — pnpm workspace configuration is authoritative

Decision: with pnpm 10, root dependency overrides and peer-dependency policy
live in `pnpm-workspace.yaml`, not the ignored `package.json#pnpm` field.
Frozen install plus an unchanged lockfile hash is required evidence for
configuration-only moves.

Reason: a stale lockfile can hide ignored policy until a future dependency
resolution silently changes the graph.

## D-016 — Authorized hosted-database reconciliation

Decision: the explicit production database authorization was executed only
after a dry run, version inventory, SQL review, and business baseline capture.
The 23 missing versions were applied in order, followed by one forward-only
security hardening migration. Catalog verification and unchanged row/monetary
baselines are required evidence.

Deviation: this release did not have the previously preferred restored-clone
rehearsal. The absence of that rehearsal remains a process gap; successful
production application and catalog checks do not erase it.

## D-017 — Database tests require explicit disposable configuration

Decision: database tests never discover `DATABASE_URL` from repository-local
application environment files. A caller or CI job must explicitly inject the
disposable database URL and expected-schema flags. Rollback-only tests are
still writes and must not target a hosted application database by accident.

## D-018 — Migration tooling uses PostgreSQL session mode

Decision: Supabase migration commands use the direct/session-mode port 5432.
Transaction-mode port 6543 is not used for migrations because prepared
statements are unsupported there and produced a pre-execution collision.

## D-019 — Release identity is explicit

Decision: GitHub pushes, commit attribution, Railway deployment, and Vercel
deployment use `kurtgav` / `kurtgavin.design@gmail.com`. Provider identity and
release SHA are verification evidence, not incidental metadata.

Reason: Vercel correctly blocked a current-main deployment before build when
the historical commit mapped to `thirdcodekurt`, who is not a member of the
authorized Vercel team.

## D-020 — Deploy infrastructure before enabling transaction migration

Decision: the Railway NestJS API and Redis may be deployed and health-checked
while `ERP_PROJECT_WRITES_VIA_API` remains false. The flag can change only
after live Auth, permission, tenant-isolation, stale-write, audit, and rollback
evidence passes.

Reason: infrastructure availability is not proof that official ERP
transactions are ready to move.

## D-021 — Analytics must fail cleanly

Decision: production telemetry is enabled at the Vercel project boundary and
must load without generating browser errors. Analytics remains observational;
it cannot authorize or mutate ERP records.

Reason: shipping a client integration that predictably returns 404 creates
noise that can conceal real frontend failures.

## D-022 — Do not assume one UUID version for existing records

Decision: API path validation accepts any syntactically valid UUID already
allowed by PostgreSQL. Tenant-scoped lookup, authorization, and record
existence determine access. Malformed values still fail at the boundary.

Reason: production contains a valid legacy Project identifier whose version
nibble is not v4. Enforcing v4 rejected an existing record before tenant
isolation could execute.

## D-023 — Hosted authorization proof must be non-mutating

Decision: production Auth/capability/tenant tests use short-lived one-time
sessions and guaranteed failure paths. Capture target rows and audit state
before and after; equality is required.

Reason: production authorization evidence is necessary, but production
business records are not test fixtures.

## D-024 — Correlate commands without logging business context

Decision: Next generates a UUID for each migrated command. Nest validates or
replaces it, echoes it as `x-request-id`, and records one structured outcome.
Allowed fields are event, request ID, operation, method, status, outcome, and
duration. Authorization headers, payloads, raw URLs, tenant/user IDs, and
record IDs are forbidden.

Reason: operators need a stable cross-service handle, but runtime logs must not
become a second store of credentials or sensitive ERP data.

## D-025 — Rollback selection is exact and independently tested

Decision: only the literal value `ERP_PROJECT_WRITES_VIA_API=true` selects
Nest. Unset, empty, `false`, and differently cased values keep the legacy
Server Action. Tests exercise both branches without a hosted write.

Reason: fail-closed parsing makes a misconfigured rollback return to the
known legacy path instead of silently enabling a migrated transaction.

## D-026 — Hosted transaction proof uses reversible demo data

Decision: after no-write authorization boundaries pass, a migrated command
requires one controlled hosted transaction against explicitly designated demo
data. Capture the complete mutable record and tenant audit tail immediately
before the command, change one non-critical field through Nest, verify the
committed result and audit chain, then restore the exact business values
through a second authorized Nest transaction. Append-only audit history and
the expected `updated_at` advance are retained.

Reason: compilation and denial paths do not prove that the deployed
transaction authority can commit, attribute, correlate, and recover a real
ERP command. Reversible demo data provides that evidence without enabling the
Web migration flag or directly editing the database.

## D-027 — Project-write cutover requires two server-side gates

Decision: `ERP_PROJECT_WRITES_VIA_API=true` is necessary but insufficient.
The authenticated user's database-derived tenant must also match
`ERP_PROJECT_WRITES_VIA_API_TENANT_IDS`. Missing, empty, malformed, or
non-matching allowlists fail closed. `*` is accepted only as the sole entry
for a separately approved all-tenant rollout.

Reason: one global Boolean cannot perform a controlled tenant canary. Enabling
it would move every tenant at once and defeat the required blast-radius and
rollback controls.

## D-028 — Native disposable evidence supplements exact container parity

Decision: when host virtualization is unavailable, an isolated imported WSL1
distribution may run disposable PostgreSQL 17 and Redis for clean migration
replay, fail-closed database tests, and Nest integration. The lane must use a
dedicated database, contain no hosted credentials, and be destroyed or rebuilt
between replay proofs. It does not satisfy the final pinned Supabase
PostgreSQL/Redis CI gate.

Reason: production data must never become a test fixture. Native disposable
evidence shortens the feedback loop and exposed real migration/function
defects, while the pinned CI lane remains authoritative for platform parity.

Outcome: the lane found four production-relevant function defects before
release. Clean-local and hosted function fingerprints match after the
forward-only migration release; the production feature flag remains disabled.

## D-029 — Release tooling must be immutable

Decision: CI downloads Actionlint from a versioned release and verifies the
exact Linux archive SHA-256 before extraction. A mutable upstream branch
bootstrap script is not permitted for a release gate.

Reason: pinned workflow actions do not make CI reproducible when a shell step
still executes mutable remote code. Version and digest pinning makes the
reviewed tool artifact explicit and fail closed.

## D-030 — Watched-path skips retain the last runtime artifact

Decision: a commit outside a deployable service's reviewed watch set does not
force a redundant runtime rebuild. Release evidence records the provider's
skip event, the skipped repository SHA, the retained runtime artifact SHA, and
live readiness. Commits that affect the service must still deploy and match
the reviewed source SHA exactly.

Reason: a monorepo documentation or CI-only commit can legitimately produce
different repository-head and backend-runtime SHAs. Hiding that difference or
claiming a skipped event as a deployment would weaken release traceability.

## D-031 -- Database enum catalogs are application contracts

Decision: every persisted enum consumed by application queries or workflow
code is a versioned contract. Clean replay and hosted release verification
must assert the exact canonical labels and ordering. Additions use
forward-only migrations; production labels are never removed as an emergency
rollback.

Reason: TypeScript/schema agreement did not prove the hosted PostgreSQL
catalog was current. The missing `partial_delivered` label passed compilation
and caused a production Server Component failure. Catalog assertions catch
that drift before deployment without mutating business data.

## D-032 -- Database incident closure requires affected-route proof

Decision: a hosted database repair is not closed by catalog inspection alone.
Re-execute the affected authenticated route with a hard reload, verify its
critical rendered regions and browser console, then reconcile provider
runtime requests and error clusters for the same release window.

Reason: a successful SQL probe proves the repaired contract but not the full
Server Component, authentication, rendering, and production-observability
path that users exercise.

## D-033 -- Short-lived self-hosted CI is the no-cost M1 runner

Decision: while GitHub-hosted jobs are blocked by organization billing, the
authoritative M1 application-schema gate may run on a repository-scoped,
short-lived Windows runner supplied by the developer. The workflow is manual,
private-repository only, restricted to `kurtgav`, read-only to repository
contents, and receives no production secrets. It runs PostgreSQL 17 and exact
Redis 7.4.9 inside the isolated `ThirdCodeERP-Test` WSL1 distribution, uses a
dedicated disposable database, uploads no artifacts, and removes the runner
registration and work directory after the job.

The lane is valid only when it replays the complete migration history, executes
all database tests with zero skips, proves deterministic schema state, runs the
Nest transaction integration and production smoke, passes the remaining static
and build gates, and is reconciled with the hosted Supabase ledger/catalog.
The Docker/Supabase-container lane remains an equivalent future gate.

Reason: GitHub documents self-hosted runners as free to use, while current paid
hosted jobs are rejected before any step executes. Requiring payment or working
hardware virtualization adds no application correctness evidence. The
short-lived, reviewed-code-only boundary limits local-machine exposure without
weakening the actual release checks.

## D-034 -- Vercel releases are explicit and single-artifact

Decision: disable Vercel Git auto-deploy for this project. Git pushes are source
publication, not deployment authorization. A frontend release occurs only after
the exact SHA passes CI and a production deployment is explicitly approved.
Do not create a duplicate feature-branch preview for a SHA already validated
locally. Prefer promoting an already validated deployment over rebuilding it.

Reason: synchronized pushes to `main` and the feature ref generated two Vercel
builds per commit, including CI-only and documentation-only changes. The project
has exhausted included credit and entered on-demand billing. Explicit releases
reduce compute use and make the deployment decision auditable.

## D-035 -- Self-hosted verification does not upload dependency caches

Decision: omit `cache: pnpm` from `actions/setup-node` in the transient
self-hosted workflow. The developer-owned machine already retains its pnpm
store; the workflow uploads no dependency cache and no artifacts.

Reason: run `30421480977` passed every substantive verification step, then
stalled in setup-node's post-job cache upload. Remote caching adds storage and
network use without improving correctness or the persistent local runner's
dependency availability. Follow-up run `30422175962` completed all gates and
post-job actions successfully in 5m33s with remote caching disabled.

## D-036 -- M1 uses a clean dedicated canary tenant

Decision: do not enable Project routing for an existing tenant whose complete
audit chain fails predecessor or hash verification. Do not delete, update,
re-hash, checkpoint around, or otherwise conceal historical append-only
evidence. Provision one dedicated canary tenant through a reviewed supported
onboarding path. It must have an active Supabase Auth identity, an authorized
same-tenant application user, a reversible E2E Project, and a genesis-rooted
chain that passes the read-only planner before provider configuration changes.

Reason: the primary demo tenant has suitable users and Projects but two
historical predecessor mismatches and 151 historical hash mismatches. The only
currently clean QA tenant has no user or Auth identity. Weakening the gate would
turn an audit-integrity defect into accepted rollout policy; rewriting history
would destroy evidence. A dedicated canary creates the smallest trustworthy
boundary without changing production transaction rules.

## D-037 -- Canary provisioning uses normal product onboarding

Decision: create the dedicated M1 identity through `/auth/signup`, complete
email confirmation, and create its non-critical Project through the
authenticated product UI. Do not provision the canary by direct SQL, by
writing `auth.users`, or through a one-off service-role script.

Reason: the deployed Auth trigger already atomically creates an isolated tenant
and same-ID Admin profile for a new Auth identity, and the existing Project
flow creates the audit root. Exercising normal product paths proves the
customer onboarding boundary and avoids privileged data repair disguised as
test setup. The only external prerequisite is an unused user-controlled email
whose confirmation is explicitly authorized.

## D-038 -- Harden privileged signup provisioning before canary use

Decision: retain the Auth trigger as the atomic tenant/Admin bootstrap, but run
its `SECURITY DEFINER` function with an empty `search_path`, fully qualify every
relation and built-in, bound display metadata to column limits, generate a
deterministic bounded tenant slug, and revoke direct execution from `PUBLIC`,
`anon`, and `authenticated`. Treat `raw_user_meta_data` only as display input;
never use it for role or capability decisions.

Reason: `supabase_auth_admin` needs a definer function to create application
rows, while an ambient path would broaden privileged name resolution. The
normal signup trigger can block account creation if it fails, so its complete
behavior must replay against PostgreSQL and be exercised in database tests
before creating the dedicated canary.

## D-039 -- Organization type is profile data, never authority

Decision: persist signup `organization_type` on the tenant only after
normalizing it to the shared product catalog. Enforce the catalog with a
validated database check constraint and use `other` for missing or unknown
values. Never derive role, capability, membership, approval authority, or
tenant access from this user-editable field.

Reason: the signup UI already required business classification, but the
provisioning trigger discarded it. Persisting constrained profile context
improves onboarding continuity without creating a metadata-to-authorization
escalation path. One shared catalog plus database enforcement prevents UI,
application, and hosted-schema drift.

Validation: migration `20260729054456` is hosted and current at 50/50;
PostgreSQL 17 clean replay passes; 220/220 database tests run without skips;
existing identity and tenant counts are unchanged; hosted function privileges
and trigger state remain hardened.

Rollback: do not edit applied history or delete tenant data. Disable public
signup if provisioning regresses, then apply a reviewed forward compensation
that restores the prior trigger body while retaining or safely deprecating the
additive profile column.

## D-040 -- Owner-approved architecture supersedes stale bootstrap guidance

Decision: when repository bootstrap guidance conflicts with the explicit
owner-approved course correction and maintained architecture documents, use the
current architecture documents. Do not implement obsolete tRPC, PostgreSQL 16,
pnpm 9, or Inngest-as-target rules. Do not rewrite `AGENTS.md` without the
owner sign-off that file requires.

Reason: `AGENTS.md` references a missing
`docs/Third Code ERP_PRD_v1.md` and predates the approved Next.js, NestJS,
PostgreSQL 17, Redis/BullMQ, and Python-analysis-only architecture. Allowing it
to redirect new work would reintroduce explicitly rejected architecture.

Validation: repository dependency manifests, deployed topology, hosted database,
and maintained architecture documents all match the newer architecture.

Rollback: revert this documentation decision only together with an approved,
internally consistent replacement governance set. Runtime state is unaffected.

## D-041 -- Correct the landing incrementally and scope Vercel telemetry

Decision: preserve the accepted public landing architecture and apply a
targeted responsive/accessibility correction. At 390px, render the hero as
three non-wrapping text lines, hide its decorative inline micro-image, remove
decorative ordinals, and enforce 44px visible interaction targets. Render
`@vercel/analytics` only when `VERCEL=1`; use responsive-image fetch priority
instead of duplicate preload hints.

Reason: live browser measurement proved six hero lines and undersized mobile
targets, contradicting the landing specification and GPT Taste constraints.
A full redesign would add risk without improving the accepted desktop system.
Unconditional Vercel telemetry also creates false console failures in local or
alternative-host production artifacts.

Validation: require optimized production build success; exact H1 line-box
measurement at 1440, 768, and 390; zero horizontal overflow; zero decorative
ordinal labels; no visible mobile target below 44px; working accordion and FAQ;
valid JSON-LD; and zero browser console errors or warnings.

Rollback: revert the landing component, CSS module, and conditional analytics
render together. No data or provider rollback is required. Existing Vercel
production remains unchanged until a separately approved deployment.

## D-042 -- Document processors produce evidence, not transactions

Decision: document-processing authority moves incrementally to NestJS. BullMQ
jobs contain only an opaque job ID. NestJS reloads authoritative tenant,
Project, document, actor, and Storage context from PostgreSQL. Python receives a
short-lived exact-object read grant and returns bounded, versioned, hash-linked
evidence without database or Storage service-role credentials. NestJS alone
validates and commits pending-review scope rows inside an actor-stamped,
idempotent transaction.

Reason: current Python path accepts caller-supplied authority and writes
`scope_items` directly. Current Next.js paths also duplicate writes, retries,
and draft-BOM creation without durable processing state. Hosted catalog
inspection confirms missing composite tenant/Project constraints and audit
triggers on `documents` and `scope_items`.

Validation: require same-tenant composite constraints, evidence immutability,
explicit capability tests, duplicate/retry proof with real Redis, atomic
database integration with zero skips, Python credential-removal tests,
compatibility response and browser proof, and an authorized reversible canary.

Rollback: keep new route flag false and tenant allowlist empty, stop queue
consumption, preserve job/evidence/audit records, and retain legacy path.
Applied schema rollback is a reviewed forward compensation; immutable evidence
and audit rows are never deleted.

## D-043 -- Uploads prove same-tenant Project access before side effects

Decision: upload sign and complete routes must load Project with both
authenticated tenant and requested Project ID before quota, Storage,
document-recording, parsing, AI, or queue work. Missing and cross-tenant
Projects return the same 404 response.

Reason: storage-path prefix validation proves string shape, not Project
ownership. Independent tenant and Project foreign keys also do not prove both
records belong together. Shared `getProject` compounded the gap by querying
only tenant and comparing requested ID against one returned row.

Validation: require exact generated SQL predicates for tenant and Project ID,
cross-tenant denial tests for both routes, valid same-tenant compatibility
tests, full type/lint/test/build gates, and final live authenticated proof after
an explicitly approved deployment.

Rollback: revert shared query, two route guards, and their tests together.
No database or provider rollback is needed for source-only work. If deployed,
promote last known-good Vercel artifact; never disable tenant checks to recover
an unrelated upload failure.

## D-044 -- Document mutations require capability and atomic audit

Decision: define `document.manage` as the server-enforced authority for signed
upload, document creation, and document deletion. Grant it to operational
roles and keep `viewer` read-only. Audit signed credential issuance before
returning it. Commit official document creation or deletion and the
corresponding hash-chain audit entry in the same PostgreSQL transaction.
Delete derived document scope rows in the deletion transaction. Start
non-transactional object cleanup only after the database commit succeeds.

Reason: authentication and tenant derivation do not prove mutation authority.
Unaudited document changes violate the product authority boundary. Removing a
Storage object before independent database deletes can also create a broken
live record when a later write fails.

Validation: require actual capability-matrix tests, missing-capability denials
before side effects, tenant-and-Project-bound document lookup, audit-failure
rollback tests, proof that Storage cleanup follows the audit transaction, full
lint/typecheck/test/build gates, and authenticated live proof only after an
explicitly approved consolidated deployment.

Rollback: revert the capability, route/action guards, transactional audit
helper, and tests together. No schema or provider rollback is required for the
source candidate. If deployed, promote the prior Vercel artifact; do not grant
mutation authority to `viewer` as an outage workaround.

## D-045 -- Cortex entity behavior comes from one exhaustive registry

Decision: define every versioned Cortex node type once with its display label,
color, role access path, permitted source table, and canonical record route.
Derive graph RBAC, citation labels, navigation, and entity-source validation
from that registry. Resolve the node by authenticated tenant before checking
source ownership and role access. Return the same 404 for missing, mismatched,
and forbidden records.

Reason: independent partial maps silently drifted as finance and inventory
types were added. That produced inconsistent visibility, generic labels,
missing record links, and an entity endpoint that could not describe newer
records. A source/type ownership check also prevents one registered source
name from being paired with a node of another type.

Validation: require exact registry equality with the 48-value Drizzle enum,
metadata and route checks for every type, registered/unregistered source tests,
finance-source compatibility, forbidden-role and source/type mismatch tests,
full lint/typecheck/test/build gates, and local production health/readiness and
unauthenticated-boundary smoke.

Rollback: revert the registry, compatibility re-export, derived RBAC, entity
route guard, shared citation labels, and tests together. No schema, data,
Storage, Auth, queue, or provider rollback is required. If deployed, promote
the prior Vercel artifact; never reconnect Git or purchase a separate rollback
build when an existing artifact can be promoted.

## D-046 -- Persist citation identity, reauthorize citation presentation

Decision: keep the Cortex answer body as `text/plain`. Return a bounded,
base64url-encoded citation header for the current response. When loading saved
messages, treat persisted citation metadata as untrusted and use only valid
node IDs to reload current citation fields under authenticated tenant and
current-role scope. Derive record links from the canonical entity registry.

Reason: changing the streamed body would break existing clients. Rendering
persisted titles and references directly would let stale metadata survive a
role downgrade, record supersession, or graph correction. Reauthorization at
read time preserves conversation continuity without weakening tenant or RBAC
boundaries.

Validation: require plain-text response compatibility, bounded UTF-8 header
round-trip and malformed-header fail-closed tests, current-role history
rehydration tests, cross-tenant/forbidden omission, full
lint/typecheck/test/build gates, production-mode health/readiness and
unauthenticated-boundary smoke, plus desktop and 390px focus/overflow checks.

Rollback: revert the citation header, history rehydration, citation component,
styles, and tests together. Existing stored messages remain readable as plain
text. No schema, row, Auth, Storage, queue, provider, or deployment rollback is
needed. If later deployed, promote the retained last-known-good Vercel
artifact; do not reconnect Git or buy a separate rollback build.

## D-047 -- Operational Cortex context is route-derived and read-only

Decision: render Cortex context from the authenticated dashboard layout using
one exact UUID-route resolver. Map supported detail routes to canonical source
tables, then delegate retrieval to the existing tenant- and role-authorized
entity API. Do not add Cortex queries or route maps to each record page.
Project detail remains excluded because it already owns an inline panel.

Reason: duplicating context wiring across record pages would drift from the
canonical registry and mix AI presentation with ERP business logic. A layout
resolver gives finance, procurement, inventory, CRM, claims, variation,
punchlist, and warranty records consistent Obsidian-like backlinks while
preserving existing transaction authority.

Validation: require exact route/ref-table/record-ID tests, unsupported and
malformed fail-closed tests, canonical-source assertions, one-panel render
tests, exact cash-transaction navigation, full lint/typecheck/test/build gates,
local production authentication boundary checks, and 1440/768/390 focus,
target-size, and overflow proof.

Rollback: revert the route resolver, layout injection, wrapper, cash route
correction, tests, and spec together. Existing record pages and Project Cortex
panel remain functional. No schema, row, Auth, Storage, queue, provider, or
backend rollback is required. If later deployed, promote the retained
last-known-good Vercel artifact without reconnecting Git.

## D-048 -- Cortex relationship meaning is derived after authorization

Decision: keep the existing tenant/source/type/role authorization gate before
context-pack retrieval. Build a bounded relationship response only from the
pack's role-filtered neighbors and citations. Translate canonical edge type
plus direction through an original presentation map; use `Connected` for
unknown types. Route destinations through the canonical entity registry.

Reason: source chips show evidence but not relationship meaning. Returning raw
graph neighbors to the browser would duplicate authorization and navigation
logic in React. Server-side assembly preserves one trust boundary while making
record backlinks useful to non-technical operators.

Validation: require outgoing/incoming/unknown label tests, citation-join and
bound tests, authorization-order route tests, canonical-link and static-fallback
render tests, full lint/typecheck/test/build gates, local production 401 proof,
and 1440/768/390 focus, target-size, truncation, console, and overflow checks.

Rollback: revert the response builder, entity-route extension, relationship
component/style, tests, and spec together. Existing summary and citation chips
remain functional. No schema, row, Auth, Storage, queue, backend, provider, or
data rollback is required. If later deployed, promote the retained
last-known-good Vercel artifact without reconnecting Git.

## D-049 -- Cortex provenance is normalized before browser presentation

Decision: reuse node provenance already loaded by the tenant- and role-scoped
context pack, but return only a bounded safe presentation projection. Map
origin to user-facing kind, label, and explanation; serialize a validated ISO
timestamp; discard every raw identity, reference, hash, and sequence field.
Render the result through a native collapsed disclosure.

Reason: provenance makes an Obsidian-like operational graph trustworthy, but
raw rows contain actor IDs, internal references, hash-chain material, and
global sequence values that users do not need. A server projection explains
evidence without expanding browser authority or leaking internals.

Validation: require all-origin and unknown-origin mapping tests, malformed-time
omission, six-event bound, explicit raw-field absence, route retrieval limit,
native disclosure render tests, full lint/typecheck/test/build gates,
hosted aggregate coverage, local 401 proof, and 1440/768/390 interaction,
focus, target-size, console, and overflow checks.

Rollback: revert the evidence projection, route retrieval bound, disclosure
component/style, tests, spec, and documentation together. Existing summary,
relationship, and citation UI remains functional. No schema, row, Auth,
Storage, queue, backend, provider, or data rollback is required. If later
deployed, promote the retained last-known-good Vercel artifact without
reconnecting Git.

## D-050 -- Focused Cortex graphs are server-authorized bounded neighborhoods

Decision: treat `refTable` and `refId` as an untrusted navigation hint. Validate
the pair, resolve the node under the authenticated tenant, verify canonical
source/type ownership and current-role access, and then retrieve one bounded
hop using the server-derived node ID. Recheck tenant on the focus node, edge,
and joined neighbor. Preserve the original whole-graph response when no focus
is supplied.

Reason: a browser-only highlight can silently focus a forbidden or missing
record, and a fixed 1,500-node whole-graph cap can omit an older requested
record. A small authorized neighborhood makes the exact record dependable,
reduces payload and visual noise, and keeps React out of the authorization
boundary.

Validation: require unauthenticated, malformed, partial, source/type mismatch,
role denial, authorized focus, and whole-graph compatibility tests; root
lint/typecheck/test/build; a connected-database authenticated E2E that follows
the real record backlink; API bounds; clear-focus behavior; zero console/page
errors; and 1440/768/390 no-overflow screenshots.

Rollback: revert the focused database helper, graph route extension, page
query wiring, record backlink, canvas focus state, responsive shell changes,
tests, and documentation together. The existing whole graph and entity panels
remain functional. No schema, business row, Storage, queue, backend-provider,
or deployment rollback is required. If later deployed, promote the retained
last-known-good Vercel artifact without reconnecting Git.

## D-051 -- Saved Cortex record context is immutable and server-authorized

Decision: store an optional complete canonical source-table and UUID pair on
the conversation, not a client-selected tenant or internal graph-node ID.
Authorize the pair before creation, keep it immutable, and reauthorize its
current node, canonical entity mapping, tenant, and role on every reply and
history read. Preserve unscoped conversations. Remove authenticated browser
write policies and grants from Cortex conversation and message tables.

Reason: record-scoped AI cannot remain honest across reloads if focus exists
only in a URL or React state. Storing a node ID would bind history to an
internal graph lifecycle, while trusting a browser-supplied tenant or direct
database write would weaken tenant isolation and audit authority.

Validation: require bounded input tests, create/restore/mismatch/revocation
route tests, canonical registry and role checks, pair-constraint runtime
proof, authenticated direct-write denial, 51-migration clean replay, 224/224
zero-skip database tests, Nest integration, full lint/typecheck/test/build,
secret and workflow scans, hosted catalog verification, and advisor review.

Rollback: revert application code first if necessary; nullable columns and
removed browser write grants are backward compatible with the retained live
frontend. Database rollback is a reviewed compensating forward migration only:
restore the exact prior grants/policies if direct browser mutation is
deliberately reauthorized, then remove the constraint/columns only after
proving no scoped conversation remains. Never edit hosted migration history.

## D-052 -- Cortex chat scope is explicit and cannot switch silently

Decision: resolve URL focus on the server and pass only authorized canonical
context into the chat client. Show the current scope persistently. Permit
in-place history restore only when both contexts are null or their canonical
source-table and UUID pairs match exactly. Render other scopes as explicit
Cortex navigation. Disable chat when a requested record is unavailable.

Reason: letting React infer scope from raw URL values or silently loading a
different saved record makes answers appear grounded when the graph and chat
refer to different business records. Exact-pair comparison preserves immutable
conversation meaning while keeping navigation understandable.

Validation: require pure equality/route/label tests, focused/company/unavailable
render tests, existing API context suites, full repository
lint/typecheck/test/build, authenticated local production QA, exact title and
scope assertions, visible mobile controls, 1440/768/390 screenshots, zero
overflow/errors, and test-session revocation.

Rollback: revert the page authorization wiring, context helper, agent
presentation/history behavior, CSS, tests, and documentation together. The
durable database/API context contract remains safe and backward compatible.
No schema or provider rollback is required; Vercel remains on the retained
last-known-good deployment.

## D-053 -- Saved Cortex conversations use authorized deep links

Decision: accept a validated UUID `conversationId` query and restore it through
the existing authorized conversation-detail API. Keep record focus in the URL,
append conversation identity to cross-context history links, synchronize
create/load state with `history.replaceState`, and remove only conversation
identity when starting a new chat. Use a monotonically increasing local request
token so only the latest restore may commit UI or URL state.

Reason: requiring users to change record context, reopen history, and select
the same thread adds avoidable friction. An opaque conversation UUID is safe
as a locator only because server authorization remains decisive and the URL
contains no tenant, user, prompt, answer, or graph-node data.

Validation: require UUID/encoding/query-preservation tests, full
lint/typecheck/test/build, existing conversation authorization suites,
authenticated production-browser restore, message-count and URL assertions,
new-chat cleanup, responsive screenshots, zero overflow/errors, no hosted
write or AI call, and global test-session revocation.

Rollback: revert page query parsing, URL helper, agent restore/synchronization,
E2E assertions, and documentation. Existing history buttons and durable
conversation context remain functional. No schema, row, Auth, Storage, queue,
backend, or provider rollback is required.

## D-054 -- Cortex history search stays local to authorized recent chats

Decision: filter only the existing bounded response of 30 authorized recent
conversations. Match every normalized query term against conversation title
plus human record-scope label, preserve server order, and label the result set
as recent. Never index or expose tenant IDs, user IDs, record UUIDs, or
internal graph-node IDs.

Reason: users need fast retrieval without another database/API surface or a
misleading promise of global history search. Reusing the authorized response
preserves the current ownership, tenant, role, record-context, and citation
boundary while avoiding provider and query cost.

Validation: require title, record-title, record-type, company-wide, blank, and
no-result helper tests; focused component tests; full lint/typecheck/test/build;
authenticated production-browser search, clear, deep-link restore, mobile
screenshot, no overflow/errors, and global test-session revocation.

Rollback: revert the filter helper, agent history controls, CSS, tests, and
documentation together. The conversation API, database, durable context,
deep links, and provider state remain unchanged.

## D-055 -- Authenticated rate limits use verified user identity

Decision: key anonymous request buckets by IP and authenticated request buckets
by the verified Supabase user ID. Do not reuse one IP bucket across auth-state
boundaries or across authenticated users sharing a NAT.

Reason: the authenticated threshold is higher than the anonymous threshold.
Reusing one IP counter allowed authenticated traffic to make a later anonymous
request fail immediately and made unrelated users behind one shared address
consume the same bucket.

Validation: require pure bucket-identity tests, the existing middleware suite,
full lint/typecheck/test/build, and one sequential browser run that exercises
authenticated Cortex followed by the public landing page.

Rollback: revert the helper, middleware wiring, tests, and documentation
together. No schema, API contract, hosted row, provider, or deployment rollback
is required.

## D-056 -- Frontend releases use one queued Standard build

Decision: keep Vercel Git disconnected, disable on-demand concurrent builds,
use the Standard 4 vCPU/8 GB machine, and require explicit approval for exactly
one manual production build. Do not create a duplicate preview.

Reason: the accumulated frontend candidates can be validated in one release
while keeping provider spend predictable. Queuing prevents accidental
concurrent builds; Standard build compute has no added charge in the current
no-on-demand configuration.

Validation: require provider-setting evidence, zero deployments after source
pushes, one exact candidate SHA, complete local gates, a written production
test matrix, and a retained rollback deployment before requesting approval.

Rollback: use Vercel Instant Rollback to retained deployment
`dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`, verify the production alias and core
routes, and preserve environment configuration. Do not rebuild the old source.

## D-057 -- Dashboard chooses authorization mode before querying

Decision: use the canonical `/pipeline/board` role permission to choose between
the executive dashboard and an assignee-scoped Today dashboard. Invoke only the
selected loader. Restricted roles receive pending task counts constrained by
both authenticated tenant and authenticated user.

Reason: `/dashboard` is intentionally available to every role, but this did
not authorize every role to read pipeline value, GP, forecast, rep performance,
or executive alerts. Querying restricted data and hiding it later in React
would still violate least privilege.

Validation: require role-matrix tests, explicit loader non-invocation tests,
component content/link tests, full lint/typecheck/test/build, and authenticated
viewer production-browser proof at 1440/768/390 with zero forbidden content,
overflow, console errors, or page errors.

Rollback: revert the mode helper, Today query/component, dashboard wiring,
tests, specification, and documentation together. Existing executive
dashboard behavior returns for all roles, so rollback is functional but
reopens the identified authorization exposure. No schema or provider rollback
is required.

## D-058 -- Search input is literal and every join repeats tenant scope

Decision: normalize search input once, cap it at 100 characters, and escape
PostgreSQL `ILIKE` escape, percent, and underscore characters. Build only
role-authorized record queries. Apply authenticated tenant predicates to both
base and joined tables, preserve assignee scoping for tasks, and mark every
response private/no-store with Cookie variation.

Reason: search fans one browser-controlled string across many record types.
An unescaped backslash can change wildcard semantics, an unscoped display join
can expose a foreign tenant label when application credentials bypass RLS, and
a cached response can retain user-specific result metadata.

Validation: require helper and role-matrix tests, 401/short-query cache-header
tests, full lint/typecheck/test/build, secret/workflow/prohibited-source scans,
and an authenticated restricted-role browser proof using both a real authorized
record and a literal wildcard probe. Require zero forbidden result types,
overflow, console errors, page errors, and a globally revoked one-time session.

Rollback: revert source commit `8dc051e`. No schema or provider rollback is
required because the candidate is not deployed. Rollback restores prior search
behavior and therefore reopens the identified input, join, and cache risks.

## D-059 -- AI draft handoff uses explicit mode and opaque one-time state

Decision: keep record search and AI drafting as explicit command-palette modes.
Ask mode makes no search request. Transfer a bounded question through
same-tab, five-minute, one-time browser state keyed by an opaque UUID; place
only that UUID in the temporary route. Accept it only for company-wide Cortex,
consume and remove it once, clear the marker URL, prefill the composer, and
never auto-send.

Reason: silently treating every unmatched record query as an AI question would
send user intent into a different system boundary. Putting prompt text in a URL
would expose it to history, logs, copied links, and analytics. Explicit mode
and local one-time state preserve user control and minimize disclosure.

Validation: require normalization/expiry/one-time unit tests, keyboard
selection tests, authenticated real-search preservation, zero Ask-mode search
requests, zero chat requests before Send, exact composer prefill, prompt-free
URL, removed storage, 1440/768/390 visual proof, full repository gates, and
provider no-deployment evidence.

Rollback: revert source commit `8058c8a`. No schema or provider rollback is
required because the candidate is not deployed. Record search returns to its
previous behavior and Cortex remains available through its direct route.

## D-060 -- Public signatures require one locked database transaction

Decision: treat external canvas signing as one official transaction. Validate
the bounded PNG, derive scope from the hashed session, upload under a random
key, lock and recheck the exact session, and commit document, tenant-scoped
source stamp, session stamp, and nullable-actor entity audit together. Remove
the uploaded object when the database transaction fails.

Reason: the old flow allowed concurrent submissions to pass one unsigned check
and intentionally let the signature survive a failed audit caused by a
fabricated zero-UUID actor. Independent writes could leave partial official
state or orphaned Storage. External actors are legitimately nullable; audit is
not optional.

Validation: require focused malformed/oversized payload tests, shared
transaction and tenant-predicate evidence, nullable-actor audit proof,
audit-failure cleanup, concurrent replay denial, missing-source denial,
unauthenticated invalid-token browser proof, full repository gates, and
provider no-deployment evidence.

Rollback: revert source commit `e99b88f`. No schema or provider rollback is
required because the candidate is not deployed. Rollback restores the
unaudited partial-write and replay risks and therefore is emergency-only.

## D-061 -- RFQ dispatch is tenant-locked and retry-idempotent

Decision: derive manual RFQ authority from the authenticated server profile and
route background approval events through a server-only service. Lock the
tenant-scoped BOM, detect a prior result, create the RFQ, and write its audit
inside one transaction. Enforce one RFQ per tenant/BOM with database
uniqueness and a tenant-composite BOM foreign key. Deliver notification only
after commit and never on an idempotent replay. Deny direct browser mutations
to RFQs and quotes.

Reason: the former browser-callable Server Action accepted a caller-provided
system tenant, used a fabricated zero-UUID actor, and separated RFQ creation
from audit. The producer emitted a different event from the consumer trigger,
and retries had no durable uniqueness boundary. Browser Data API writes could
also bypass official workflow authority.

Validation: require action, service, queue-handler, and Drizzle contract tests;
53/53 hosted migration parity; 228/228 disposable PostgreSQL 17 database tests;
full lint, typecheck, test, and production build; direct privilege proof;
secret/workflow/prohibited-source scans; successful Railway readiness; and zero
new Vercel deployments.

Rollback: application rollback is source commit `f173957`. The database
migrations are forward-only because they close cross-tenant, duplicate, and
browser-write risks. A later corrective migration may change the contract only
after an explicit compatibility and security review.

## D-062 -- RFQ quote commands use one locked state machine

Decision: give each quote attempt a tenant-scoped UUID idempotency key and a
canonical BOM-line ID. Lock the tenant RFQ, derive material identity from its
stored line, validate all parents, and commit quote, status, and audit in one
transaction. Lock completion/cancellation, recheck allowed source state and
coverage, and commit transition plus audit together. Enforce the same state
graph and tenant relationships in PostgreSQL. Keep notification after commit.

Reason: the former flow committed quote, status, and audit independently;
trusted browser material identity; could complete a pending or incompletely
quoted RFQ by calling the action directly; and had no durable retry key.
Creation also discarded material IDs for uncontracted lines, so code/material
fallback could never prove full coverage. These defects permitted partial
official state, duplicate quotes, false completion, and weak tenant evidence.

Validation: require 26 focused Web tests, 12 RFQ database contract/runtime
tests in the zero-skip lane, cross-tenant vendor rejection, duplicate-key
rejection, invalid-transition rejection, audit-failure rollback, 54/54 clean
replay and hosted ledger parity, full lint/typecheck/test/build, 453
application tests, 236/236 database tests, 77/77 static generation, secret and
workflow scans, and zero Vercel deployments.

Rollback: revert application source commit `20d276c` only if necessary.
Migration `20260729162944` is forward-only because removing it would reopen
cross-tenant, duplicate-submission, evidence-deletion, and invalid-transition
paths. Correct database defects with a reviewed forward migration. Keep
Vercel Git disconnected and the retained production deployment active until
one consolidated frontend release is explicitly approved.

## ADR-028: RFQ quote command moves behind a disabled NestJS adapter

Decision: introduce only quote logging in the NestJS modular monolith. Route
Next.js to it only when an exact feature flag and explicit tenant UUID
allowlist both match. Never fall back after an enabled API attempt.

Reason: this creates one authoritative, permission-checked transaction
boundary without a big-bang rewrite or dual-write ambiguity. Existing
complete/cancel behavior remains unchanged.

Rollback: unset the flag/allowlist or revert this application milestone. No
schema rollback exists because this milestone adds no migration.

## ADR-029: Public discovery URLs come from one validated origin

Decision: resolve canonical metadata, structured-data identities, robots
sitemap location, and sitemap entries from `NEXT_PUBLIC_SITE_URL`, then
server-only `SITE_URL`, then Vercel's production hostname, with the retained
Third Code Vercel origin as compatibility fallback. Accept only absolute
HTTP(S) origins without credentials, paths, queries, or fragments. Omit
sitemap `lastModified` when no verified content-change date exists.

Reason: hardcoded Vercel URLs made a no-cost alternative host publish the
wrong canonical identity. A synthetic current timestamp also claimed content
freshness without evidence. One strict resolver keeps discovery output
consistent and makes hosting replaceable without changing visible UI.

Validation: require resolver precedence and rejection tests, rendered
canonical and structured-data checks, robots/sitemap/manifest endpoint checks,
1440/768/390 browser coverage, no console/page errors or horizontal overflow,
full lint/typecheck/test/build, and secret/workflow scans.

Rollback: revert this isolated application commit. The current Vercel origin
remains the resolver fallback, so rollback requires no database or provider
change. Do not reconnect Vercel Git or deploy during rollback.

## ADR-030: Alternative frontend hosting uses Next standalone

Decision: preserve Next.js and make standalone Node output opt-in through
`NEXT_OUTPUT_MODE=standalone`. Package it as a non-root Node 22 image and keep
normal output as the default. Use `APP_REVISION` as the provider-neutral
release identity, with Railway and Vercel SHA variables as migration
fallbacks.

Reason: the application depends on dynamic SSR, Middleware, Server Actions,
route handlers, and request-specific CSP nonces. Static hosting changes
security and behavior. Opt-in standalone output enables owned-compute hosting
without a big-bang rewrite or coupling the default build to one provider.

Validation: require normal production build, isolated standalone build,
77/77 generated pages, real standalone process health, SSR landing, nonce CSP,
robots, sitemap, manifest, unit tests for revision resolution, full repository
gates, and zero provider deployments. A Docker image build remains mandatory
before traffic cutover when a Docker-capable Linux host is available.

Rollback: revert this application commit. No schema, data, provider, DNS, or
Supabase rollback is required because this milestone does not deploy or cut
traffic. Keep the retained Vercel artifact and Git disconnection unchanged.

## ADR-031: RFQ terminal commands use an independent disabled NestJS adapter

Decision: expose completion and cancellation through one strict NestJS
transition route, while keeping their cutover flag and tenant allowlist
independent from quote logging. Derive authority from the authenticated
principal, require `rfq.dispatch`, lock the tenant RFQ, enforce coverage and
state rules, update with the locked source status, and write audit evidence in
the same transaction. Never retry through the compatibility writer after an
API attempt.

Reason: terminal commands must move into the modular-monolith authority
boundary incrementally without coupling their rollout to quote logging,
changing visible behavior, or introducing ambiguous dual writes.

Validation: require strict shared contract tests, Nest HTTP and service tests,
Next branch-selection and failure tests, full repository gates, and a
zero-skip PostgreSQL 17/Redis lane proving tenant denial, covered completion,
repeated-transition conflict, cancellation reason audit, and rollback.

Rollback: leave `ERP_RFQ_TERMINAL_WRITES_VIA_API` absent/false and its
allowlist empty, or revert this source milestone. No schema, data, queue,
Storage, Python, Vercel, or Supabase rollback is required.
## D-063 -- Manual RFQ creation uses an independent disabled Nest adapter

Date: 2026-07-30

Decision: Manual BOM-to-RFQ creation is exposed as
`POST /v1/procurement/rfqs` in NestJS. The caller may supply only the BOM UUID.
Authenticated principal supplies tenant and actor authority; `rfq.dispatch`
supplies permission authority; server code supplies `source: manual`.

The transaction locks the tenant-scoped BOM, returns an existing tenant/BOM
RFQ as an exact replay, filters lines already covered by a contracted rate,
inserts one pending RFQ, and writes one semantic audit before commit. Existing
database uniqueness on `(tenant_id, bom_id)` remains the final duplicate
barrier.

Next.js selects this command only when exact
`ERP_RFQ_CREATE_WRITES_VIA_API=true` and a valid independent tenant allowlist
both match. Empty, malformed, mixed wildcard, or unmatched configuration uses
the compatibility path. Once Nest is selected, errors never fall back to a
second write path.

Reason: manual creation can migrate independently from quote, terminal, and
background-worker authority. Separate gates reduce blast radius and prevent a
partial backend outage from causing duplicate writes.

Rollback: leave the gate unset or set it to exact `false`; revert the source
commit if needed. No schema or data rollback is required.

## D-064 -- Approved-BOM RFQ dispatch uses a disabled BullMQ authority path

Date: 2026-07-30

Decision: NestJS exposes a protected enqueue command accepting only the BOM
UUID. It derives tenant and actor from the authenticated principal and derives
source, queue, versioned deterministic job ID, retry count, and backoff from
server code. The worker validates the payload, reloads the actor membership,
rechecks current `rfq.dispatch`, requires an approved tenant BOM, and invokes
the same atomic RFQ transaction used by manual creation.

The source job has five exponential attempts. Its final failure creates one
bounded deterministic record in a dedicated dead-letter queue. Next.js selects
the new producer only through independent exact flag and strict tenant
allowlist variables. A selected Nest failure never falls back to Inngest.

Reason: enqueue-time authorization can become stale, duplicate delivery is
normal, and ambiguous dual producers can create conflicting side effects.
Execution-time reauthorization, one transaction authority, deterministic
identity, and explicit terminal failure preserve tenant isolation and
operational evidence.

Cutover constraint: keep the new flags unset until the existing RFQ
notification side effect has an idempotent NestJS outbox/delivery replacement
and a controlled hosted canary is approved.

Rollback: leave the flag absent/false and the allowlist empty, or revert this
source milestone. The existing Inngest path remains authoritative. No schema,
data, Supabase, Storage, Python, UI, or Vercel rollback is required.

## D-065 -- Automatic RFQ notifications use a PostgreSQL outbox

Date: 2026-07-30

Decision: the automatic NestJS RFQ transaction commits one tenant-scoped
notification intent and immutable procurement-recipient delivery snapshots
with the RFQ and semantic audit. BullMQ jobs carry only version and UUID
identity. PostgreSQL owns delivery state, attempt count, stale recovery,
terminal evidence, and in-app uniqueness.

Email content is rebuilt server-side from authorized PostgreSQL rows and sent
with one stable provider idempotency key. Missing email configuration fails
closed. An active processing claim is not reclaimed; a stale claim may be
recovered, but the database ceiling prevents more than five provider attempts.

Recovery scheduling requires exact
`ERP_NOTIFICATION_SWEEP_ENABLED=true` and defaults false. Automatic dispatch,
its tenant allowlist, and recovery scheduling remain disabled until an
approved tenant canary.

Reason: notification intent must survive a process or Redis failure without
repeating the official RFQ transaction, leaking business data into Redis, or
creating unbounded provider cost. Database authority plus provider
idempotency makes retries observable and bounded.

Rollback: keep all three flags absent/false and revert application source if
needed. Leave the forward migration and durable evidence in place. Do not
delete outbox or dead-letter records. Existing Inngest behavior remains
authoritative while the Nest path is disabled.
