# WO-18 — Management dashboard v1

## Scope

- Added an executive Monday-meeting health panel to the dashboard.
- Kept the existing pipeline TCV, weighted pipeline, active GP, blended margin,
  and Closed Won FYTD KPI selection.
- Added project-level forecast margin and margin delta from the approved BOM and
  WO-17 cost-control baseline/forecast.
- Added cost variance against the approved budget, with an explicit no-baseline
  state when a project has no approved budget.
- Added active and overdue permit exposure.
- Added unsigned variation-order exposure for draft, commercial-pricing, and
  client-signature states. Signed or rejected VOs are excluded.
- Added internal SLA breach counts by responsible business unit for marked
  breaches, escalations, and overdue running/paused clocks. External clocks are
  excluded from BU escalation counts.
- Kept all reads tenant-scoped and linked each project row to its cost-control
  workspace.

## Verification

- PASS — `pnpm --filter @third-code-erp/web typecheck`
- PASS — focused component render tests: 2/2
- PASS — live WSL Postgres management query: 1/1
- PASS — full web suite: 361 passed, 3 environment-gated skips
- PASS — Next production build: 80 routes generated
- PASS — local production Chromium smoke: 4/4
- PASS — disposable database lane: 68 migrations, 264/264 database tests,
  3/3 API integration tests, schema sha256
  `1D25FAA9E09B14B530B726490107F7D255DA99E80462172CCE88C2E6BBC508CC`
- PASS — build-ops invariants, workflow action references, audit coverage
  (116/116), and gitleaks
- NOT RUN — authenticated browser dashboard flow; local Supabase Auth is not
  provisioned in the disposable lane.
- NOT RUN — hosted Supabase migration/deployment; release remains blocked by the
  existing hosted duplicate PO and migration-head divergence gates.

## Operational note

No schema migration is required for this slice. The dashboard reads the existing
permit, variation-order, SLA, BOM, budget, purchase-order, and posted supplier
bill records through the established tenant-scoped query paths.
