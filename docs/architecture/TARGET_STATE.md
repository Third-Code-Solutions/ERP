# Target State

Third Code ERP remains an incremental TypeScript system. The target is a
modular monolith, not a rewrite and not a microservice fleet.

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
