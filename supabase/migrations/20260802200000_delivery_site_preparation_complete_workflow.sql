-- M3.18: atomic, tenant-scoped delivery site-preparation completion.
-- Feature gates remain closed by default; this migration only adds the
-- existing ledger action value.

begin;

alter type public.delivery_workflow_action
  add value if not exists 'complete_site_preparation';

commit;
