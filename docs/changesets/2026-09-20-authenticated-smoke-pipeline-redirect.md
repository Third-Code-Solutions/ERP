# Authenticated smoke pipeline redirect

## Outcome

The authenticated smoke readiness contract now accepts the intentional legacy
`/pipeline/conversion` bookmark redirect as the same canonical list workspace
as `/pipeline/list`: `/pipeline?view=list`. Route behavior and authentication
checks remain unchanged; only the smoke assertion's expected-route
normalization was extended.

## Verification

- PASSED: `pnpm --config.engine-strict=false --filter @third-code-erp/web exec playwright test e2e/authenticated-smoke-readiness.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line` (11/11 tests).
- PASSED: `pnpm --config.engine-strict=false --filter @third-code-erp/web exec tsc --noEmit -p e2e/tsconfig.json`.
- PASSED: `pnpm --config.engine-strict=false --filter @third-code-erp/web exec vitest run "src/app/(dashboard)/pipeline/redirects.test.ts" --reporter=dot` (3 tests).
- PASSED: `git diff --check`.
- NOT RUN: repository ESLint does not configure the `apps/web/e2e` paths; the targeted invocation reported only ignored/unconfigured-file warnings and exited non-zero.

No dependencies, provider mutations, production route/authentication changes,
commits, pushes or deployments were made.
