# Provider-linked migration replay

## Scope

Replay provider-linked `origin/main` migration source on disposable local
PostgreSQL 17. No hosted SQL or application data was changed.

## Evidence

- Source: `origin/main` commit `7cd3306681e68528897de792dbef46b3aefee3a3`.
- 124 migration files replayed in order.
- Ledger reached 124/124.
- Replay used fresh local database `erp_provider_source_replay_20260813`.
- Database dropped during cleanup.

## Result

PASS structural provider migration replay.

This does not prove hosted promotion. Hosted target still has 55/124 applied,
69 pending, and 12 duplicate tenant-scoped `PO-0002` rows blocking its first
pending migration. Target data mapping, restore rehearsal, source authority,
and production approval remain open.
