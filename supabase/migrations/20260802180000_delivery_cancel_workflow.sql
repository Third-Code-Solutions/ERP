-- M3.16: atomic, tenant-scoped delivery cancellation authority.
-- Feature gates remain closed by default; this migration only adds the
-- ledger action and cancellation evidence columns.

begin;

alter type public.delivery_workflow_action
  add value if not exists 'cancel_delivery';

alter table public.delivery_schedules
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid,
  add column if not exists cancellation_reason text;

alter table public.delivery_schedules
  drop constraint if exists delivery_schedules_cancelled_by_tenant_fk;

alter table public.delivery_schedules
  add constraint delivery_schedules_cancelled_by_tenant_fk
    foreign key (tenant_id, cancelled_by)
    references public.users (tenant_id, id)
    on delete set null
    not valid;

alter table public.delivery_schedules
  validate constraint delivery_schedules_cancelled_by_tenant_fk;

commit;
