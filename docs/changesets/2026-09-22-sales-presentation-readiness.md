# Sales presentation readiness

## Outcome

- Preserved Manila calendar dates on pipeline cards and opportunity detail views.
- Applied registered route permissions to opportunity BOM and project navigation while retaining the pre-won project gate.
- Replaced raw opportunity type and lead-stage copy with user-facing labels.
- Aggregated legacy and canonical opportunity stages consistently for dashboard KPIs, scorecards, alerts, and stage distribution.
- Tenant-scoped sales-rep lookups and retained reps whose activity is terminal-only.

## Verification

- PASSED: 60 focused Vitest cases covering date boundaries, route access, navigation policy, stage normalization, terminal-only reps, and existing dashboard alert behavior.
- PASSED: Web TypeScript check (`tsc --noEmit`).
- PASSED: focused ESLint on changed production files.
- Environment caveat: checks ran under Node 24.16.0 with engine strictness disabled because Node 22.x is required but unavailable in this shell.

## Handoff

→ Handoff to Agent 13. Reason: implementation is locally verified and ready for release validation. Inputs: this changeset and the Sales readiness worktree diff. Expected output: exact-source/provider verification, deployment gates, and live Sales journey evidence.
