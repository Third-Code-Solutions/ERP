# M2.6 tenant-scoped recovery scheduler

Added a closed-by-default BullMQ scheduler for document-processing recovery.
The scheduler is created only when recovery, intake, worker-bridge, and Nest
commit gates are all enabled and the recovery tenant allowlist intersects both
processing and commit allowlists. Its payload is `{ schemaVersion: 1 }`; the
processor asks PostgreSQL for at most 100 tenant-scoped opaque job IDs and
rebuilds missing Redis transport jobs. Recovery never writes ERP completion
state.

Local validation passed shared contract tests, API 120/120 tests, focused queue
and processor tests, workspace typecheck, serial lint, production build, and
diff checks. Disposable database/Redis integration files were collected but
skipped locally because the integration credential gate is absent. Hosted
database, flags, providers, deployments, and business data were unchanged.

CI run `30711326355` for commit `0ff4ece8449c882436f90c0dcb45edfc67765da4`
passed the executable Postgres 17/Redis lane, including cross-tenant recovery
exclusion, plus workspace checks, production build, and container smoke. E2E
remains skipped by explicit hosted-credential gating.
