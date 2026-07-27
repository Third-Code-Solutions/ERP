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
