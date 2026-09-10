# Normalized schedule and Last-Planner register

## Added

- Tenant-safe normalized `project_schedule_tasks` table for L1–L4 levels.
- Parent/predecessor dependency checks, planned/actual labour minutes, status
  workflow, and commitment/constraint fields.
- Core APIs, shared contracts, Web route `/projects/[id]/schedule`, filters,
  summary cards, and role-aware mutation forms.

## Preserved

- Existing `master_schedules` JSON/CSV importer, weekly progress, S-curve, and
  Gantt screens are untouched.

## Verification

- Shared, DB, API, Web focused tests: PASS.
- API typecheck and Web lint: PASS.
- Full Web typecheck: BLOCKED by unrelated pre-existing `.next/types` imports.
- Live database and browser E2E: NOT RUN.
