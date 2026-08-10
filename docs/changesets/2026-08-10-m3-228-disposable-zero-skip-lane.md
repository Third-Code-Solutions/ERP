# M3.228 - Disposable zero-skip PostgreSQL/Redis and API lane

## Outcome

The current source tree replays cleanly on the disposable
`ThirdCodeERP-Test` runtime without hosted credentials or provider traffic.

## Evidence

- PostgreSQL 17.10 at `127.0.0.1:54322`; Redis 7.4.9 at `127.0.0.1:6379`.
- Database `erp_self_hosted_ci` was dropped/recreated locally only.
- 116 repository migrations applied.
- Database Vitest: 149/149 files, 370/370 tests, zero skips and failures.
- Nest API integration: 30/30 files, 45/45 tests, one worker.
- Schema-only dump before/after SHA-256:
  `4FCC37BD3D4BE7B40F108812C7E57D30BC25806E4D7F71D10E8FDE8665C3FDD2` for
  both files.

Expected RFQ, notification, and document failure-path log lines appeared
during passing assertions; they are intentional test evidence.

## Boundary

This proves disposable migration, schema, queue, and API integration behavior.
It does not prove hosted Supabase state, production data, Vercel/Railway
health, rollout capacity, or billing. No hosted or paid action occurred.

## Next action

Choose a bounded source-only ERP domain seam, document its contracts, implement
the smallest safe change, and rerun the focused gates plus this lane.
