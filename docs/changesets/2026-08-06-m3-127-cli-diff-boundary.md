# M3.127 - Pinned CLI schema-diff boundary

## Scope

- attempt the pinned Supabase CLI `2.109.1` schema diff against the disposable
  PostgreSQL replay
- record the Docker-engine prerequisite failure without waiving the gate

## Evidence

Both read-only CLI attempts failed before database inspection while creating a
shadow database because the Docker Desktop Linux engine pipe was unavailable.
The direct PostgreSQL verifier and zero-skip database tests remain valid source
evidence; the CLI/CI diff artifact is still open.

## Rollback

No application, schema, hosted, provider, or deployment state changed. No
rollback is required.
