# RFQ transition adapter handoff

## Scope

The RFQ terminal-transition path now has a source-only NestJS adapter. The
existing Next.js transaction service remains the default writer.

## Completed sequence

1. Shared contracts define strict complete/cancel commands and the
   tenant-scoped result.
2. API exposes authenticated complete/cancel routes with `rfq.dispatch`,
   tenant-derived identity, row locking, quote-coverage validation, and
   semantic audit in the same transaction.
3. Web exposes a disabled-by-default tenant allowlist cutover and keeps
   post-commit completion notification behavior.
4. Disposable PostgreSQL/Redis tests cover tenant isolation, terminal state,
   retry rejection, audit, and rollback.

## Next owner

→ Operations/release owner. Reason: enabling the adapter requires M1 canary,
Railway/Supabase readiness, an approved tenant UUID, monitoring, rollback, and
explicit environment approval. Inputs: `ERP_RFQ_TRANSITION_WRITES_VIA_API`
and `ERP_RFQ_TRANSITION_WRITES_VIA_API_TENANT_IDS`. Expected output: one
controlled tenant canary with runtime logs and rollback evidence.
