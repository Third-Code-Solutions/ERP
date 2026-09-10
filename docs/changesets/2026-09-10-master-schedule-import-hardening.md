# Master schedule import hardening

- Added preview-first L1 CSV import with row-level rejection diagnostics.
- Validated calendar dates, date ordering, predecessor references/cycles, CSV shape, and cumulative percentage curves.
- Made replacement, project-row locking, and audit insertion one transaction so failed imports preserve the prior schedule.
- Excluded retired projects from preview/import authority.
- Kept the pure parser outside the `'use server'` action module so Next.js can
  compile the server-action boundary while preview validation remains synchronous and testable.
- Added parser, transactional action, failure, and UI contract tests.

Verification:

- `pnpm --config.engine-strict=false --filter @third-code-erp/web exec vitest run "src/app/(dashboard)/projects/[id]/progress/actions.test.ts" "src/components/progress/master-schedule-import.test.tsx" "src/app/(dashboard)/projects/[id]/schedule/actions.test.ts"` — passed (10 tests).
- Web lint — passed.
- Web production build — passed.
- Full Web typecheck — passed after regenerating `.next` route types.
