# M3.158 handoff - protected Cortex route proof

The real `/cortex` Next route is now reproducible with zero hosted side effects:
a rejecting loopback Auth/profile contract, the full local PostgreSQL 17
migration/seed replay, and installed Chrome. Run:

```powershell
$env:E2E_CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
pnpm --filter @third-code-erp/web test:e2e:cortex-route-local
```

Prerequisite: local `erp_self_hosted_ci` must contain the current 104-migration
ledger and deterministic seed. The harness starts and stops ports 4327/4328.
It supplies no production credential and rejects unexpected Auth/REST calls.

Do not use this proof as full Supabase protocol or production Auth evidence.
Keep all Cortex canaries closed. Next work is the owner-governed M3.152
Purchase Order mapping on a complete managed backup/PITR restore, not a hosted
deployment.
