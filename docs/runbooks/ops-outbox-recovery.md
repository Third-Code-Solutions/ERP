# Outbox recovery

Scope: ABI OPS provider-delivery and SAP posting outboxes. These extensions
remain gated until the installation's providers and policies are accepted.

Claims have a five-minute processing lease. The next sweep moves an expired
claim to `dead_letter` with `OUTCOME_UNKNOWN` and preserves its attempt number
and idempotency key. A late worker response cannot overwrite the recovered
state. Only an explicit HTTP 429 rejection is retried automatically, with a
maximum of five attempts. Timeouts, unexpected responses and other HTTP
failures require reconciliation because the provider may already have accepted
the request. Dead-letter work blocks fiscal-period close.

For an incident:

1. Identify the exact installation, tenant, outbox row, idempotency key and
   original business record. Do not create a replacement request or delete
   the original row/attempts.
2. Check the provider's receipt and delivery/posting history using that key,
   recipient/business reference and time window. A transport timeout is not
   proof of rejection. For SAP, reconcile the external document and ledger.
3. If accepted, retain the provider document/message ID and supporting receipt.
   If conclusively rejected, retain that evidence before scheduling a retry
   with the original key. If uncertain, leave the row in `dead_letter` and
   escalate to the provider and company's finance/operations owner.
4. An authorized installation operator must reconcile the exact row through a
   reviewed transaction: lock the tenant audit chain and row, require the
   original tenant/ID/status/attempt number, stamp the active actor, retain all
   attempts and append the reason plus receipt reference to the audit log.
   Do not weaken append-only controls or run a bulk status reset. There is no
   self-service reconciliation screen in this release; operator review is
   required before enabling these optional integrations for live use.
5. Verify the business document, provider receipt, outbox terminal state and
   audit evidence agree. Retry a rejected operation only after the provider
   configuration is healthy. Check backlog and period-close readiness again.

Local regression: `apps/api/integration/outbox-recovery.database.integration.spec.ts`
proves expired/live leases, single recovery, late-response fencing, uncertain
timeouts and explicit rate-limit retry against disposable PostgreSQL. It does
not prove delivery by a real external provider.
