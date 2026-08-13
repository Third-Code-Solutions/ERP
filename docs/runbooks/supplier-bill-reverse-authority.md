# Supplier Bill Reverse Authority

## Scope

The Core owns the supplier-bill reverse transaction. The browser supplies only
the bill id, strict reversal inputs, and an opaque idempotency key. Core
authorizes the actor and tenant, locks the bill, validates posted state and
reason, and PostgreSQL atomically records the reversal linkage, balanced
journal unwind, request ledger, and semantic audit.

## Safety

Keep `ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_ENABLED=false` and
`ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS` empty. Python/AI may
recommend or analyze but cannot reverse or finalize a bill. Cross-tenant ids
must remain concealed; replaying the same command is safe, while reusing a key
for different input conflicts.

## Local verification

Use local PostgreSQL 17 and Redis 7.4.9 with the repository integration
environment. Run the focused supplier-bill reverse HTTP canary first, then the
API integration lane with the explicit 15-second timeout. Follow with API
typecheck, root lint, production build, and the provider-spend, Supabase
parity, database-release, Web/DB boundary, workflow action-reference, and
actionlint policy gates. Do not apply hosted SQL or trigger provider builds as
part of this runbook.
