# Handoff: master schedule import hardening

## Completed

- Hardened `apps/web/src/app/(dashboard)/projects/[id]/progress/actions.ts`.
- Added preview-first UX in `apps/web/src/components/progress/master-schedule-import.tsx`.
- Added focused parser/action/UI tests.

## Invariants

- Existing `master_schedules` JSON contract remains unchanged for Gantt, S-curve, reports, and portals.
- No schema or dependency changes.
- Project tenant scope and logical-retirement exclusion remain enforced.
- Replacement delete/insert/audit runs within a locked transaction.

## Deferred

2026-09-14 amendment: ADR-034 and the reviewed XML task-import handoff permit the
generic planning subset with explicit mapping. This does not resolve O-09 or
enable native `.mpp`, template-specific automation or synchronization.

- Full `.mpp`/MS Project normalized import remains deferred. Existing normalized schedule source enum is preserved, but external task identity and L2/L3 ownership semantics need a separate bounded design and ABI input O-09.
