# Approval route preview UI

## Scope

- Added an authenticated, read-only Web Core client adapter for the fixed
  `purchase_order` approval-route preview query.
- Added an accessible integer-centavo form to the Process Health workspace with
  deterministic `unconfigured`, `no_match`, `incomplete`, `ambiguous`, and
  `matched` diagnostics.
- Preserved the `preview_only` and `configured_rules_only` markers and stated
  that the diagnostic is not approval policy and cannot approve or execute a
  purchase order.

## Verification

- `pnpm --config.engine-strict=false --filter @third-code-erp/web exec vitest run src/lib/erp-core-client.test.ts --testTimeout=30000` — passed, 174 tests.
- Targeted ESLint for the three changed Web files — passed.
- `git diff --check` — passed.
- Web typecheck — blocked by pre-existing `.next/types` imports for routes that
  are absent from the current checkout; no diagnostics remained for the changed
  files after the local fix.

The local runtime is Node 24.16.0 while the repository declares Node 22.x;
checks used `pnpm --config.engine-strict=false` and emitted the expected engine
warning.
