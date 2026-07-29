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
