# WO-03 SD Framework source boundary

## Status

BLOCKED for process-step seeding and populated workflow E2E. The M-06 schema
and pure clock contract can be verified locally, but the required ABI SD
Framework deck is not present in the repository or the inspected workspace
inputs.

## Evidence

- `docs/PRD.md` and `docs/PROMPTS.md` require approximately 70
  `process_steps` rows loaded from ABI's SD Framework deck.
- The required source must provide code, stage, name, responsible BU, input,
  input-from, output, output-by, and SLA for each step.
- The specification explicitly forbids seeding a step whose owner is unresolved
  and names `Commercial or SD – PM?` as an example that must remain excluded.
- No deck-backed process-step data was found in the current repository or the
  three authoritative PDF inputs.

## Implemented boundary

- M-06 tables, tenant composite foreign keys, RLS, audit trigger attachment,
  owner-resolution checks, and observe-mode defaults are implemented in the
  local-only migration `20260812160000_process_sla_engine_foundation.sql`.
- The shared clock contract implements business-day and calendar-hour clocks,
  80% at-risk, 100% breach, 150% internal escalation, external no-escalation,
  and observe-mode suppression.
- The migration contains no process-step inserts and the static SQL gate rejects
  fabricated seeds.

## Required unblock

1. Provide the reviewed ABI SD Framework deck or an approved structured export.
2. Resolve every owner question before converting it to seed data.
3. Review the mapping and expected row count with the process owner.
4. Load the approved seed only on a disposable/restored PostgreSQL 17 database,
   then run authenticated task creation, clock, breach, BU reporting, and
   external no-escalation E2E checks.

No hosted schema or data mutation was performed.
