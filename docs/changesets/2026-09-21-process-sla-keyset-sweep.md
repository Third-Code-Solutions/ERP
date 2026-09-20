# Process SLA sweep keyset traversal

## Outcome

The M-06 process SLA worker now captures one sweep timestamp and traverses all
eligible clocks in deterministic `(due_at, id)` keyset pages. Retained breached
clocks therefore cannot consume the first 1,000-row page forever. Future clocks
are left for a later sweep, equal `due_at` values use the UUID tie-breaker, and
the existing tenant/status/`updated_at` compare-and-set boundary remains the
only persistence path. Unchanged rows still produce no write; external clocks
and observe mode retain their no-escalation behavior.

## Verification

- PASSED: `pnpm --config.engine-strict=false --filter @third-code-erp/web test -- src/lib/inngest-process-sla.test.ts` (9/9).
- PASSED: `pnpm --config.engine-strict=false --filter @third-code-erp/web exec tsc --noEmit --pretty false`.
- PASSED: `pnpm --config.engine-strict=false exec eslint --max-warnings=0 apps/web/src/lib/inngest-process-sla.ts`.
- The focused suite covers more than 1,000 retained breached clocks, equal
  timestamps without skips or repeats, fixed sweep-time propagation, CAS loss,
  redundant-write suppression, external clocks, and observe mode.
- The repository requires Node 22.x; this environment used Node 24.16.0 with
  pnpm engine strictness disabled for local verification. No hosted database,
  deployment, or provider mutation was performed.

## Recovery

This is a worker/test-only change with no migration or persisted-data change.
Reverting the commit restores the previous bounded first-page sweep behavior.
