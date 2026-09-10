# Normalized schedule and Last-Planner register — 2026-09-10

## Scope

Add a non-destructive normalized L1–L4 schedule/task spine with planned versus
actual labour and weekly commitment status. The existing JSON L1 master schedule,
CSV importer, progress updates, Gantt, and S-curve remain available.

## Outputs

- `project_schedule_tasks` schema/migration with level, dependency, dates,
  labour minutes, status, commitment, tenant-scoped foreign keys, trigger checks,
  RLS denial, and audit trigger.
- Core list/create/update/status routes with idempotent creation, optimistic
  versioning, transition guards, dependency/owner scope checks, and labour summary.
- Shared Zod contracts, Web Core client wrappers, server actions, schedule route,
  filters, summary cards, plan/status forms, loading/error states.
- Opt-in all-role Playwright matrix for `/projects/[id]/schedule`.

## Explicit limits / dependencies

- No replacement of legacy `master_schedules` JSON data.
- MS Project binary/XML import is deferred until the real template and L2/L3
  ownership/shape are resolved (PRD O-04/O-09).
- Labour reconciliation uses task-level planned/actual minutes; payroll or SAP
  actuals are not fabricated.
- Critical-path calculation, resource levelling, calendars, and schedule baselines
  remain later slices.

## Verification

- Shared contract tests: PASS (3).
- Database migration static tests: PASS (3).
- API service/controller/protected tests: PASS (6).
- Web Core/action tests: PASS (4).
- API typecheck: PASS.
- Web lint: PASS.
- Full Web typecheck: BLOCKED by pre-existing generated `.next/types` imports.
- Live PostgreSQL/RLS/ACL and browser E2E: NOT RUN; requires configured demo
  tenant and E2E environment variables.

→ Handoff to the next roadmap slice. Reason: normalized schedule and labour
commitment foundation is available without breaking the legacy progress route.
