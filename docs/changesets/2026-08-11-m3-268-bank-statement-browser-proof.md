# M3.268 - Bank-statement browser Storage canary proof

## Scope

- Added a disposable loopback Playwright harness for the real Next bank-import
  form, Supabase-compatible auth/Storage client path, and controlled Core
  terminal response.
- Proved signed URL creation, browser PUT, exact tenant-shaped Core request,
  idempotency/bearer headers, audited cleanup, zero bank-statement writes,
  responsive rendering, and blocked external provider traffic.
- Corrected the signed-upload route's audit identity to use a UUID entity key
  while retaining the full Storage path in the audit diff.

## Validation

- `pnpm --filter @third-code-erp/web test:e2e:bank-statement-storage-local` —
  PASS (1/1).
- `pnpm --filter @third-code-erp/web exec vitest run src/app/api/finance/reconciliation/import/sign/route.test.ts` —
  PASS (6/6).
- `pnpm --filter @third-code-erp/web typecheck` — PASS.

## Release boundary

The Core response was intentionally controlled-disabled; successful import and
detail rendering remain a follow-up gate. All selectors remain false/empty.
No hosted SQL, Supabase object, provider setting, credential, deployment, or
paid action changed.

Source evidence SHA: `4f68cac`.
