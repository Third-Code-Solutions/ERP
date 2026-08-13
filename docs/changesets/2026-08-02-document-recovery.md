# Document-processing recovery source slice

Added PostgreSQL-owned recovery IDs for document-processing jobs. Stale
`processing` claims are reset to `queued` in a transaction, recovery is bounded
to 100 opaque job UUIDs, and `enqueuePending()` rebuilds missing BullMQ jobs
through the existing idempotent queue key. Redis remains delivery-only; it
cannot finalize an ERP transaction.

Validation: CI run `30709595007` passed the PostgreSQL 17/Redis 7.4.9 lane,
processor canary, stale-claim recovery, BullMQ retry/final-failure, Redis-loss
re-enqueue, database assertions, Nest smoke, workspace checks, build,
Actionlint, and secret scan. E2E remains skipped by explicit credential
gating. No hosted database, provider setting, deployment, or business data was
changed.
