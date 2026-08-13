-- M3.17: atomic, tenant-scoped delivery site-preparation start authority.
-- Feature gates remain closed by default; this migration only adds a ledger action.

begin;

alter type public.delivery_workflow_action
  add value if not exists 'start_site_preparation';

commit;
