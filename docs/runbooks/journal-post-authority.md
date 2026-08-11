# Journal Post Authority

## Scope

The Core owns manual journal posting at
POST /v1/finance/journals/:journalEntryId/post. The route and idempotency key
identify the command. Core authorizes the actor and tenant, locks the draft
journal, and PostgreSQL atomically validates the open period and balanced
lines, assigns the journal number, marks it posted, records the request
ledger, and writes semantic audit.

## Safety

Keep `ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED=false` and
`ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS` empty. Python/AI may analyze or
recommend but cannot post or finalize journals. Cross-tenant ids must remain
concealed; a repeated key replays the durable result, while a key for another
journal conflicts.

## Local verification

Use local PostgreSQL 17 and Redis 7.4.9 with the repository integration
environment. Run the focused journal-post HTTP canary first, then the API
integration lane with the explicit 15-second timeout. Follow with API
typecheck, root lint, production build, and the provider-spend, Supabase
parity, database-release, Web/DB boundary, workflow action-reference, and
actionlint policy gates. Do not apply hosted SQL or trigger provider builds as
part of this runbook.
