# WO-03 process and SLA handoff

## Scope

BUILD OPS WO-03 requires M-06 process steps, task instances, SLA clocks, and
approval rules. The work is split between schema, API, and feature surfaces;
this handoff records the ownership boundary before those layers are connected.

## Current local foundation

- Agent 04: `packages/database/src/schema/process-sla.ts`, the ordered WO-02
  migration `supabase/migrations/20260812155000_wo_02_audit_business_calendar.sql`,
  and M-06 migration
  `supabase/migrations/20260812160000_process_sla_engine_foundation.sql` define
  tenant-scoped tables, composite tenant foreign keys, checks, RLS, and audit
  triggers. A clean local PostgreSQL 17 replay now passes with both migrations
  and seed data.
- Shared contract: `packages/shared-types/src/process-sla/index.ts` computes
  business-day and calendar-hour schedules and evaluates 80/100/150 thresholds.
- Tests cover year boundary, Philippine holiday/Holy Week behavior, calendar
  hours, external-clock no-escalation, and observe-mode suppression.
- No process-step rows are seeded because the ABI SD Framework deck is absent;
  see `docs/blockers/2026-08-12-wo-03-sd-framework-source.md`.

## Required sequence

1. Agent 04 — replay the migration on disposable/restored PostgreSQL 17,
   validate constraints, RLS, audit exactly-once behavior, and rollback/recovery
   evidence.
2. Agent 05 — completed locally: typed tenant-bound process/task/clock/approval
   API operations, capability checks, and structured request observability.
3. Agent 09/11 — completed locally for process health: BU-level read surface
   with unavailable, observe, breach, and external-clock states; no fabricated
   catalog or metrics. Approval UI remains pending.
4. Agent 13 — add scheduler/worker observability and deploy gates only after
   provider-source parity and database recovery gates pass.
5. Agent 01 — review the deck mapping and approve the separate seed migration.

## Non-negotiable semantics

- Internal clocks may escalate only after observe mode is disabled.
- External LGU, Building Admin, and client clocks are tracked but never
  escalated against a BU.
- Observe mode reports by BU, not by individual, for the initial 4–6 weeks.
- Do not automate a step with an unresolved owner.

## Handoff

→ Handoff to Agent 04 / Agent 13. Reason: local replay and runtime invariants
are now proven, but release remains gated by provider-source parity, recovery
evidence on the hosted project, the missing SD Framework source, and populated
process E2E. Inputs: the WO-02 and M-06 migrations, shared clock contract, API
routes, capability map, and process-health page. Expected output: approved
provider migration plan, recovery evidence, separate source-backed process seed
migration, scheduler observability, and hosted authenticated E2E.
