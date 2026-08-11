# M3.269 - Successful bank-statement Core browser proof

## Scope

- Run the disposable bank-statement browser harness against the compiled Nest
  API instead of a controlled Core stub.
- Preserve the actual CSV bytes from Supabase's multipart signed-upload
  contract and serve them through the Core signed-read contract.
- Assert successful tenant-scoped detail rendering, persistence/idempotency,
  audit evidence, and cross-tenant cleanup denial.
- Keep all production selectors and provider/deployment paths closed.

## Evidence

- `pnpm --filter @third-code-erp/web test:e2e:bank-statement-storage-local`
  — PASS 1/1.
- Signed-upload route — PASS 6/6; root tests/typecheck/lint/build — PASS.
- Provider-spend, Web/DB boundary, workflow refs, actionlint, gitleaks,
  database release, and managed-parity plan — PASS.
- Protected API integration — NOT RUN; its explicit environment gate is
  unset.
- No hosted Supabase SQL/object, Vercel/Railway deployment, credential,
  provider setting, or paid action changed.

Source evidence SHA: `e6f9275`.
