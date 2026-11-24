-- NEEDS PRODUCTION MIGRATION APPROVAL (verified dump first; production has no PITR).
--
-- Requisition retry keys compare the whole command, not just its action.
--
-- procurement_requisition_events.idempotency_key is unique per tenant, and a
-- retried key replays the stored result. The replay compared only the
-- requisition id and action, so a key reused with another quote selection,
-- rejection reason or create payload returned the first result as if it had
-- run. request_hash stores the SHA-256 of the canonical command each event
-- answered; Core API refuses (409) a key whose stored hash, action or actor
-- differs from the retry.
--
-- Nullable, no default and no backfill: existing rows keep NULL. A create
-- event written before this column carries its hash in reason as
-- 'request_hash:<sha256>', which Core API still reads; an older transition
-- event has no stored hash, so a retry of it is refused rather than replayed.
-- ADD COLUMN without a default is a catalog-only change; it takes a brief
-- ACCESS EXCLUSIVE lock on the table under a 5-second lock timeout.
--
-- Rollback, after the Core API release that writes request_hash is rolled back:
--   alter table public.procurement_requisition_events drop column if exists request_hash;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.procurement_requisition_events
  add column if not exists request_hash char(64);

comment on column public.procurement_requisition_events.request_hash is
  'SHA-256 (hex) of the canonical command this event answered; a reused idempotency key must match it.';

commit;
