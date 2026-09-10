# Approval sequence hardening

## Scope

- Require every distinct lower active approval sequence to be completed before a higher sequence can be requested.
- Bind predecessor checks to active approval-rule IDs while preserving non-contiguous sequences and alternative amount-band rules sharing a sequence.
- Reject decisions whose approval rule was deactivated after request creation.

## Verification

- `pnpm --config.engine-strict=false --filter @third-code-erp/api exec vitest run src/process/process.service.spec.ts --testTimeout=30000` — passed, 11 tests.
- `pnpm --config.engine-strict=false --filter @third-code-erp/api exec vitest run src/process/process.controller.spec.ts --testTimeout=30000` — passed, 5 tests.
- `pnpm --config.engine-strict=false --filter @third-code-erp/api typecheck` — passed.
- `git diff --check` — passed.

The local runtime is Node 24.16.0 while the repository declares Node 22.x; checks were run with pnpm engine-strict disabled and emitted the expected engine warning.

## Deliberate non-scope

Approval amount-band selection remains unchanged because the existing command has no monetary amount or route identity. Delegated approvals and the purchase-order workflow remain untouched.
