-- M3.14: extend the tenant-scoped delivery workflow ledger for inspection start.
-- The existing ledger remains the single idempotency boundary for delivery
-- state changes; this migration only adds the new action value.

begin;

alter type public.delivery_workflow_action
  add value if not exists 'start_inspection';

commit;
