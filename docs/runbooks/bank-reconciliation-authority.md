# Bank reconciliation authority

## Scope

Core is the read authority for the bounded bank reconciliation projection when
the exact tenant selector is enabled:

- `GET /v1/finance/reconciliation`

The endpoint authenticates the actor, requires `finance.read`, validates the
strict limit, joins statement/account/line evidence with tenant-matched keys,
and returns bounded integer-cent/date/count data. Cross-tenant identifiers are
not disclosed. The Web direct database read remains the default until a
controlled cutover is separately approved.

## Guardrails

Keep `ERP_FINANCE_RECONCILIATION_READS_ENABLED=false`,
`ERP_FINANCE_RECONCILIATION_READS_TENANT_IDS` empty, and the Web selector
closed by default. Python/AI may analyze or recommend but cannot import,
match, reconcile, or void ERP bank evidence. Selected-Core errors are
terminal; the Web path must not silently fall back.

## Verification

```text
pnpm --filter @third-code-erp/api exec vitest run integration/finance-reconciliation.http.integration.spec.ts --reporter=verbose --testTimeout=90000
pnpm --filter @third-code-erp/api exec vitest run src/finance/finance-reconciliation.controller.spec.ts src/finance/finance-reconciliation.service.spec.ts --reporter=dot
pnpm --filter @third-code-erp/shared-types exec vitest run src/erp-api/finance-reconciliation.test.ts --reporter=dot
pnpm --filter @third-code-erp/database exec vitest run src/__tests__/bank-reconciliation.test.ts --reporter=dot
```

Then run aggregate API integration, typecheck, lint, production build,
provider-spend, hosted parity-plan, database release-plan, Web/DB boundary,
workflow action-reference, and actionlint. The current repository-wide test
gate still has a pre-existing invoice-draft mock failure; do not hide it.

Do not apply hosted SQL or trigger Railway/Vercel builds from this canary.
