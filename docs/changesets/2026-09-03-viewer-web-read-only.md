# Viewer Web read-only mounting

## Scope

- Mounted Viewer tenant-safe reads in the dashboard route registry and navigation for KYC, invoices, claims, reports, Finance, procurement, Admin metadata, project BOM, billing, and access.
- Kept creation and mutation routes denied, including Admin user creation, Finance create/edit routes, delivery creation, and the Togal BOM import wizard.
- Changed KYC, Admin metadata/users, procurement, documents, project access, project billing, and project BOM pages to use their read capabilities while capability-gating rendered mutations.
- Added read-only rendering for BOMs, client-access sessions, Cortex history, notifications, and command-palette search. Viewer does not receive BOM edit/review/CAD/award/PO/invoice controls, client-link mint/revoke controls, Cortex chat controls, notification read-state controls, or Admin forms.
- Added a missing `document.manage` server-action guard to progress-claim document attachment.

## Verification

- `pnpm --filter @third-code-erp/web exec vitest run 'src/lib/operations/dashboard-route-inventory.test.ts' 'src/lib/operations/nav-config.test.ts' 'src/app/(dashboard)/projects/[id]/project-detail-access.test.tsx' 'src/app/(dashboard)/projects/[id]/billing/page.test.tsx' 'src/components/cortex/cortex-agent.test.tsx'` — PASSED (76 tests).
- `pnpm --filter @third-code-erp/web typecheck` with Node 22.23.2 — PASSED.
- `pnpm --filter @third-code-erp/web lint` with Node 22.23.2 — PASSED.
- Full Web unit suite — FAILED (1,649 passed, 2 skipped, 7 failed). The route-inventory failure was updated and passes in the focused rerun. Six remaining failures are stale expectations introduced by the preceding central Viewer capability expansion: similar-item provider access, Cortex node scope, Viewer quick links, and project cost/budget/audit query planning.
- Browser/live/deployment verification — NOT RUN in this Agent 03 slice; hand off the checked-in route/control matrix to release browser QA.

## Required handoff

- Agent 05 must close a P1 at `apps/web/src/app/api/ai/similar-items/route.ts`: its POST guard checks BOM read only, so Viewer can directly invoke provider-backed similarity work despite lacking `cortex.assistant.use`. Existing regression evidence: `apps/web/src/app/api/ai/similar-items/route.test.ts` expects Viewer HTTP 403 but receives 200.
