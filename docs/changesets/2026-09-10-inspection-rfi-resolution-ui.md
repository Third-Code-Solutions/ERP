# Inspection RFI register and transition UI

Agent 03; bounded by PRD WO-12 and the inspection RFI resolution handoff.

## Changes

- Added strict server-only Core client wrappers for the opportunity-wide inspection RFI register and resolve/reopen commands.
- Extended the existing site-inspection proposal route with URL-persisted status/priority filters, bounded pagination, source inspection context, creation/resolution metadata, and truthful unavailable/permission/empty states.
- Added accessible resolve/reopen controls requiring a bounded reason and the current expected resolution timestamp. Controls are hidden from roles without `site_inspection.submit`; Core remains authoritative for tenant, capability, locking, conflict and audit behavior.
- Preserved existing inspection logging, latest-inspection/photos display and open-RFI creation flow. The latest-inspection RFI summary keeps a read-only legacy fallback when Core is unavailable; no direct client database writes were added.
- Added route-level loading and retryable error states so a failed Core read never looks like a committed transition.
- Added an opt-in Playwright role-matrix journey for all seeded demo roles. It is read-only and requires `E2E_INSPECTION_RFI_AUTH=1` plus `E2E_INSPECTION_OPPORTUNITY_ID`.

## Verification

- PASSED: `pnpm --config.engine-strict=false --filter @third-code-erp/web exec vitest run src/lib/erp-core-client.test.ts src/lib/inspection-rfi-core-client.test.ts 'src/app/(dashboard)/crm/opportunities/[id]/proposal/inspection/actions.test.ts'` (190 tests: 181 existing Core-client, 5 RFI Core-client, 4 transition-action).
- PASSED: `pnpm --config.engine-strict=false --filter @third-code-erp/web lint`.
- PASSED: focused TypeScript check for changed source reached only the repository's pre-existing `.next/types` missing-route imports; no new inspection-RFI source error remains.
- PASSED: `git diff --check`.
- NOT RUN: browser keyboard/dialog journeys, live Core API, PostgreSQL RLS/transaction replay, and all-demo-role E2E.
- Environment: Node 24.16.0 / pnpm 10.33.0; repository declares Node 22 and the existing engine override was used.

## Boundaries

- Full project RFI correspondence, response history, attachments, submittals, transmittals and CDE remain separate future slices.
- The database authority migration is separate in `docs/changesets/2026-09-10-inspection-rfi-resolution-authority.md`; production release still requires disposable PostgreSQL privilege/RLS verification.
