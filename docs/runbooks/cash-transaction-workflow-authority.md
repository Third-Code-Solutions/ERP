# Cash transaction workflow authority

## Scope

Core is the only authority for posting and reversing a cash transaction:

- `POST /v1/finance/cash-transactions/:cashTransactionId/post`
- `POST /v1/finance/cash-transactions/:cashTransactionId/reverse`

The browser must supply the strict command body and an opaque idempotency key.
Core authenticates the actor, checks `finance.manage_cash`, resolves a
tenant-scoped visible record, locks it, and only then claims the request and
writes semantic audit. PostgreSQL owns allocation validation, journal
creation/posting, reversal linkage, and durable state transitions.

## Guardrails

Keep `ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED=false` and
`ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS` empty by default. Python/AI can
return analysis or recommendations but cannot approve, post, reverse, or
finalize an ERP transaction. Cross-tenant identifiers must remain concealed.

## Verification

Use the local transaction-bound canary before considering a selector change:

```text
pnpm --filter @third-code-erp/api exec vitest run integration/cash-transaction-workflow.http.integration.spec.ts --reporter=verbose --testTimeout=90000
```

Then run the aggregate integration lane, API typecheck, root lint, production
build, provider-spend guard, hosted parity-plan check, database release-plan
tests, Web/DB boundary check, workflow action-reference check, and actionlint.

Do not apply hosted SQL or trigger Railway/Vercel builds from this canary.
