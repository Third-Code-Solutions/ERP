# Stock Receipt workflow authority

## Scope

Posting and reversal are Core-owned commands. Web may request them only after a
future, explicitly approved tenant canary; it must not write receipt, journal,
stock-ledger, purchase-order, or workflow-request tables directly.

## Safety controls

- Keep `ERP_INVENTORY_RECEIPT_POST_WRITES_ENABLED=false` and
  `ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS` empty.
- Keep `ERP_INVENTORY_RECEIPT_REVERSE_WRITES_ENABLED=false` and
  `ERP_INVENTORY_RECEIPT_REVERSE_WRITES_TENANT_IDS` empty.
- Require a valid JWT, `inventory.manage`, strict commands, and an opaque
  `Idempotency-Key`.
- Resolve the receipt with both `receipt_id` and the authorized `tenant_id`
  before claiming a workflow request. Missing or cross-tenant receipts return
  concealed 404 and must not create a request row.
- Commit receipt state, replay ledger, journal, stock ledger, PO quantity,
  and semantic audit in one PostgreSQL transaction.
- Never let Python/AI approve, post, or reverse an ERP transaction.

## Verification

Run the focused canary with disposable PostgreSQL and Redis:

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
$env:REDIS_URL='redis://127.0.0.1:6379'
$env:ERP_REDIS_RESTART_EXPECTED='1'
$env:ERP_REDIS_TEST_DISTRIBUTION='ThirdCodeERP-Test'
$env:ERP_API_INTEGRATION_EXPECTED='1'
pnpm --filter @third-code-erp/api exec vitest run integration/stock-receipt-workflow.http.integration.spec.ts integration/stock-receipt.http.integration.spec.ts integration/inventory.database.integration.spec.ts --reporter=basic
```

The M3.245 evidence run passed 3/3. The zero-skip release lane also passed
117 migrations, 370/370 database tests, and 41/41 API integration files with
57/57 tests. Do not enable a hosted tenant until readiness, exact deployed SHA,
protected browser evidence, rollback, and billing approval are recorded.
