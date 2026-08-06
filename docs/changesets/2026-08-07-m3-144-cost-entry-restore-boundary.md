# M3.144 - Core Cost Entry restore boundary

## Scope

- Add a separate tenant-scoped restore idempotency ledger and migration.
- Expose a closed-by-default NestJS restore command for voided manual Cost
  Entries.
- Lock membership and the target entry, validate the prior void snapshot,
  clear void metadata transactionally, audit the restore, and replay exact
  results by idempotency key.
- Keep restore flags false/empty and preserve the current Web UI without a
  restore surface in this slice.

## Validation

- Shared cost contracts: 4/4.
- Database restore static coverage: 2/2.
- API deletion/restore service and controller plus environment suite: 64/64.
- Serial workspace tests: shared 27/231, database 49/53 files with 188
  passed/141 skipped, API 114/496, Web 92/600.
- Production build: 81/81 routes.
- Typecheck/lint, migration verifier (100 files), Actionlint, Gitleaks,
  controlled-release 5/5, and provider-spend 4/4: passed.

Database skips require `DATABASE_URL`. The new restore migration still needs
disposable PostgreSQL/Redis replay before any canary. No hosted provider or
tenant data changed.

## Rollback

Rollback is the reviewed prior source release. Keep both delete and restore
flags closed; never restore by direct browser/database writes or edit applied
migration history.
