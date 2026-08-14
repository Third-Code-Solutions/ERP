# WO-03 process and SLA revalidation

## Status

PARTIALLY VERIFIED. The local M-06 process/SLA foundation remains source-safe
and passes its static SQL gate. Full WO-03 acceptance is BLOCKED because the
reviewed ABI SD Framework deck or an approved structured export is not present
in the repository or the supplied authoritative inputs.

## Work completed

- Restored the root `test:process-sla-sql` command so the M-06 migration gate is
  directly runnable.
- Revalidated the additive M-06 migration, including tenant composite foreign
  keys, RLS, audit trigger attachment, owner-resolution checks, clock
  thresholds, external-clock no-escalation, and observe-mode defaults.
- Preserved the deliberate absence of `process_steps` seed rows. The missing
  source data must not be replaced with invented workflow steps or unresolved
  owners.

## Verification

- PASS — `pnpm test:process-sla-sql` (1/1).
- PASS — `node scripts/verify-process-sla-migration.mjs`.
- PASS — Node syntax checks for the static gate and its test.
- PASS — `git diff --check`.
- BLOCKED — populated process-step seed, authenticated process E2E, hosted
  migration replay, and recovery evidence; the source deck and local
  PostgreSQL/Supabase runtime are unavailable.

## Safety

No hosted schema changes, production data writes, destructive operations, or
fabricated process-step records were performed.

## Required unblock

Provide the reviewed ABI SD Framework deck or approved structured export,
resolve every owner question, and then create a separate source-backed seed
migration followed by disposable/restored PostgreSQL 17 replay and authenticated
task/clock/BU-reporting E2E checks.
