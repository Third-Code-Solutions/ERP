# Journal Reverse Authority

## Scope

The Core owns journal reversal at
POST /v1/finance/journals/:journalEntryId/reverse. The browser supplies only a
strict reason, posting date, and opaque idempotency key. Core authorizes the
actor and tenant, locks the visible posted entry, and PostgreSQL atomically
creates and posts a balanced reversal entry linked to the original, then
records the request ledger and semantic audit.

## Safety

Keep `ERP_FINANCE_JOURNAL_REVERSE_WRITES_ENABLED=false` and
`ERP_FINANCE_JOURNAL_REVERSE_WRITES_TENANT_IDS` empty. Python/AI may analyze or
recommend but cannot reverse or finalize journals. Cross-tenant ids must stay
concealed; a repeated key replays the durable result, while changed input or a
second reversal conflicts.

## Local verification

Use local PostgreSQL 17 and Redis 7.4.9 with the repository integration
environment. Run the focused journal-reverse HTTP canary first, then the API
integration lane with the explicit 15-second timeout. Follow with API
typecheck, root lint, production build, and the provider-spend, Supabase
parity, database-release, Web/DB boundary, workflow action-reference, and
actionlint policy gates. Do not apply hosted SQL or trigger provider builds as
part of this runbook.
