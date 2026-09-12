# KYC artifact Web workflow

## Outcome

- Replaced the account KYC artifact form's raw document UUID field with a Core-backed, account-scoped document picker.
- Added server-paginated search, independently retained selected-document resolution, readable project/opportunity context, metadata-only submission, loading/empty/error/retry states, and keyboard-safe pagination focus.
- Routed artifact creation through Core with strict command/result validation, request-identity preservation for uncertain outcomes, and fail-closed account/tenant/result checks.
- Showed the picker only to roles with `account.create` (owner, admin and sales under the existing capability matrix); review and artifact history behavior remain unchanged.

## Verification

- `pnpm --config.engine-strict=false --dir apps/web exec vitest run src/lib/kyc-artifact-core-client.test.ts "src/app/(dashboard)/crm/accounts/actions.test.ts"` — PASSED (14/14).
- `pnpm --config.engine-strict=false --dir apps/web exec tsc --noEmit` — PASSED.
- `pnpm --config.engine-strict=false --dir apps/web exec tsc --noEmit -p e2e/tsconfig.json` — PASSED.
- Focused ESLint on the changed Web source/tests — PASSED.
- `pnpm --config.engine-strict=false --dir apps/web exec playwright test e2e/kyc-artifact-workflow.spec.ts --project=chromium --workers=1 --retries=0 --timeout=30000 --global-timeout=300000` — PASSED (7/7), including 320/768/1024/1440 viewport checks and screenshots in the OS temp directory.

## Limits

- No commit, push, workflow/provider setting, Core/shared/DB, migration, upload or deletion changes were made in this Web slice.
- Local verification used Node 24 with `--config.engine-strict=false`; CI remains Node 22. Full Web and authenticated production/browser suites were not run here.
