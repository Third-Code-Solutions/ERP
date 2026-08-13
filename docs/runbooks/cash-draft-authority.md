# Cash draft authority

## Scope

Core is the only authority for cash draft create/update/delete:

- `POST /v1/finance/cash-transactions/drafts`
- `DELETE /v1/finance/cash-transactions/:cashTransactionId/draft`

Core authenticates the actor, checks `finance.manage_cash`, resolves the
tenant-scoped target, claims the idempotency key, and writes semantic audit in
one transaction. Draft update replaces allocations while the draft remains
locked. Draft delete removes allocations first, then the parent; PostgreSQL's
cash guard returns `OLD` for `BEFORE DELETE`.

## Guardrails

Keep `ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED=false` and
`ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS` empty by default. Python/AI can
return analysis or recommendations but cannot create, update, or delete ERP
cash drafts. Cross-tenant identifiers must remain concealed.

## Verification

```text
pnpm --filter @third-code-erp/api exec vitest run integration/cash-draft.http.integration.spec.ts --reporter=verbose --testTimeout=90000
pnpm --filter @third-code-erp/database exec vitest run src/__tests__/cash-draft-workflow.test.ts --reporter=verbose
```

Then run aggregate API integration, API/database typecheck, root lint,
production build, provider-spend guard, hosted parity-plan check, database
release-plan tests, Web/DB boundary, workflow action-reference, and actionlint.

Do not apply hosted SQL or trigger Railway/Vercel builds from this canary.
