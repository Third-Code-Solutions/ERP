-- M3.102: atomic, tenant-scoped delivery in-transit transition.
-- Feature gates remain closed by default; this migration only adds the
-- server-owned request-ledger action value.

begin;

alter type public.delivery_workflow_action
  add value if not exists 'mark_in_transit';

commit;
