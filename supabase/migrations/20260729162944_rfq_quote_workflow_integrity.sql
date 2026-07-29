-- Quote workflow integrity: stable line identity, retry idempotency,
-- tenant-composite references, and an explicit RFQ state machine.

do $$
begin
  if exists (
    select 1
      from public.rfq_quotes quote
      left join public.rfqs parent
        on parent.tenant_id = quote.tenant_id
       and parent.id = quote.rfq_id
      left join public.vendors vendor
        on vendor.tenant_id = quote.tenant_id
       and vendor.id = quote.vendor_id
      left join public.material_items item
        on item.tenant_id = quote.tenant_id
       and item.id = quote.material_item_id
     where parent.id is null
        or vendor.id is null
        or (quote.material_item_id is not null and item.id is null)
  ) then
    raise exception
      'Cannot enforce RFQ quote tenancy while invalid references exist';
  end if;
end
$$;

alter table public.rfq_quotes
  add column if not exists submission_id uuid,
  add column if not exists bom_line_item_id uuid;

update public.rfq_quotes
   set submission_id = gen_random_uuid()
 where submission_id is null;

alter table public.rfq_quotes
  alter column submission_id set default gen_random_uuid(),
  alter column submission_id set not null;

create unique index if not exists ux_rfqs_tenant_id_id
  on public.rfqs (tenant_id, id);

create unique index if not exists ux_rfq_quotes_tenant_submission
  on public.rfq_quotes (tenant_id, submission_id);

create index if not exists idx_rfq_quotes_tenant_rfq
  on public.rfq_quotes (tenant_id, rfq_id);

alter table public.rfq_quotes
  drop constraint if exists rfq_quotes_rfq_id_fkey,
  drop constraint if exists rfq_quotes_vendor_id_fkey,
  drop constraint if exists rfq_quotes_material_item_id_fkey,
  drop constraint if exists rfq_quotes_rfq_tenant_fk,
  drop constraint if exists rfq_quotes_vendor_tenant_fk,
  drop constraint if exists rfq_quotes_material_tenant_fk,
  drop constraint if exists rfq_quotes_bom_line_tenant_fk;

alter table public.rfq_quotes
  add constraint rfq_quotes_rfq_tenant_fk
    foreign key (tenant_id, rfq_id)
    references public.rfqs (tenant_id, id)
    on delete cascade
    not valid,
  add constraint rfq_quotes_vendor_tenant_fk
    foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id)
    on delete restrict
    not valid,
  add constraint rfq_quotes_material_tenant_fk
    foreign key (tenant_id, material_item_id)
    references public.material_items (tenant_id, id)
    on delete restrict
    not valid,
  add constraint rfq_quotes_bom_line_tenant_fk
    foreign key (tenant_id, bom_line_item_id)
    references public.bom_line_items (tenant_id, id)
    on delete restrict
    not valid;

alter table public.rfq_quotes
  validate constraint rfq_quotes_rfq_tenant_fk,
  validate constraint rfq_quotes_vendor_tenant_fk,
  validate constraint rfq_quotes_material_tenant_fk,
  validate constraint rfq_quotes_bom_line_tenant_fk;

create or replace function public.guard_rfq_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if (
    old.status = 'pending'
    and new.status in ('quotes_received', 'cancelled')
  ) or (
    old.status = 'quotes_received'
    and new.status in ('completed', 'cancelled')
  ) then
    return new;
  end if;

  raise exception
    'Invalid RFQ status transition: % -> %',
    old.status,
    new.status
    using errcode = '23514';
end;
$$;

revoke all on function public.guard_rfq_status_transition()
  from public, anon, authenticated;
grant execute on function public.guard_rfq_status_transition()
  to service_role;

drop trigger if exists trg_guard_rfq_status_transition
  on public.rfqs;

create trigger trg_guard_rfq_status_transition
before update of status on public.rfqs
for each row
when (old.status is distinct from new.status)
execute function public.guard_rfq_status_transition();
