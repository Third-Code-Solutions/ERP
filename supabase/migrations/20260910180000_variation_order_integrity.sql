-- Harden the existing VO lifecycle without replacing the compatibility UI.
-- The browser actions remain available; the database now rejects impossible
-- cross-tenant references and status jumps from any writer.

begin;

create unique index if not exists ux_variation_orders_tenant_id_id
  on public.variation_orders (tenant_id, id);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'variation_orders_project_tenant_fk'
  ) then
    alter table public.variation_orders
      add constraint variation_orders_project_tenant_fk
      foreign key (tenant_id, project_id)
      references public.projects (tenant_id, id)
      on delete cascade;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'variation_orders_time_impact_days_reasonable'
  ) then
    alter table public.variation_orders
      add constraint variation_orders_time_impact_days_reasonable
      check (time_impact_days between -3650 and 3650);
  end if;
end $$;

create or replace function public.guard_variation_order_transition()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status in ('signed', 'rejected') then
    raise exception 'Finalized variation orders are immutable';
  end if;
  if new.status = 'pending_commercial_pricing' and old.status <> 'draft' then
    raise exception 'Variation order must be draft before commercial pricing';
  end if;
  if new.status = 'pending_client_signature' and old.status <> 'pending_commercial_pricing' then
    raise exception 'Variation order must be commercially priced before client signature';
  end if;
  if new.status = 'signed' and old.status <> 'pending_client_signature' then
    raise exception 'Variation order must be awaiting client signature before signing';
  end if;
  if new.status = 'rejected' and old.status in ('signed', 'rejected') then
    raise exception 'Finalized variation orders are immutable';
  end if;
  if new.status = 'signed' and new.signed_at is null then
    raise exception 'Signed variation orders require a signed timestamp';
  end if;
  return new;
end;
$$;

alter table public.variation_orders enable row level security;
alter table public.variation_orders force row level security;

do $$ begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'guard_variation_order_transition'
       and tgrelid = 'public.variation_orders'::regclass
       and not tgisinternal
  ) then
    create trigger guard_variation_order_transition
      before update on public.variation_orders
      for each row execute function public.guard_variation_order_transition();
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'audit_variation_orders'
       and tgrelid = 'public.variation_orders'::regclass
       and not tgisinternal
  ) then
    create trigger audit_variation_orders
      after insert or update or delete on public.variation_orders
      for each row execute function public.audit_log_trigger();
  end if;
end $$;

commit;
