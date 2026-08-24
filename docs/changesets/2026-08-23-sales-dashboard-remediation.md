# Sales dashboard remediation

## Delivered

- Sales now receives a dedicated pipeline dashboard rather than the executive
  project-cost, permit, SLA, and unsigned-variation-order health view.
- Dashboard aggregation normalizes legacy opportunity stages to the ABI OPS
  canonical funnel, so active KPIs, stage distribution, rep scorecards, and
  conversion analysis include both historical and current records.
- Closing-date and sales-representative filters are parsed fail-closed,
  applied to Sales analytics, and propagated to the opportunity CSV export.
- Coverage and Conversion pages now include canonical opportunities, link to
  the opportunity record for account-first work, and route new work through
  the PPRF intake.
- Canonical won opportunities unlock their Project tab. The Kanban honors the
  compatible canonical transition for legacy rows while the server continues
  to validate every transition and KYC gate.

## Verification

- Targeted Sales dashboard unit tests: PASS.
- Web TypeScript: PASS.
- Web ESLint: PASS.
- Full web Vitest regression: PASS — 157 files / 973 tests passed; two
  database-environment integration tests were skipped as configured.
- Production Next.js build: PASS on local Node 24.16. The repository's required
  Node 22 runtime remains a release-environment verification gate.

## No migration or deployment

No schema migration, hosted-data change, deployment, or commit was performed.
