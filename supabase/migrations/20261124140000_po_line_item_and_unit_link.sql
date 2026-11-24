-- NEEDS PRODUCTION MIGRATION APPROVAL (verified dump first; production has no PITR).
--
-- S1: every Purchase Order line gets its stock item and unit of measure.
--
-- None of the PO insert paths (web actions, Core API) set po_line_items.
-- material_item_id or uom_id, so every Stock Receipt line was disabled. This
-- release only adds (expand-only):
--   * unit_aliases(tenant_id, alias, uom_id): tenant data that says "pcs" means
--     the PC unit. Unit equivalence is data and is never guessed in code.
--   * resolve_unit_of_measure(tenant, text): exact UOM code match first
--     (case-insensitive, trimmed), then an alias; NULL when neither matches.
--   * a BEFORE INSERT trigger on po_line_items that fills a NULL
--     material_item_id from material_items by (tenant_id, code), and a NULL
--     uom_id from resolve_unit_of_measure(). It never overwrites a value the
--     writer set, never crosses tenants, and leaves uom_id NULL on a unit miss.
--   * an idempotent backfill of the two UPDATEs from 20260726233000 for lines
--     that are still unlinked. Lines on a deactivated Cost Code are skipped:
--     guard_po_line_budget_dimension would refuse to touch them.
-- The receipt guard (post_stock_receipt: item active, tracked, item.base_uom_id
-- = line.uom_id) and the freeze after a receipt line exists are unchanged.
--
-- Rollback (linked rows stay valid; the backfill is not reverted):
--   begin;
--   set local lock_timeout = '5s';
--   set local statement_timeout = '60s';
--   drop trigger if exists link_po_line_item_and_unit on public.po_line_items;
--   drop function if exists public.link_po_line_item_and_unit();
--   drop function if exists public.resolve_unit_of_measure(uuid, text);
--   drop table if exists public.unit_aliases;
--   delete from supabase_migrations.schema_migrations where version = '20261124140000';
--   commit;
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.unit_aliases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  alias varchar(32) not null,
  uom_id uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint unit_aliases_alias_nonempty
    check (alias = btrim(alias) and length(alias) > 0),
  constraint unit_aliases_uom_tenant_fk
    foreign key (tenant_id, uom_id)
    references public.units_of_measure(tenant_id, id)
    on delete restrict,
  constraint unit_aliases_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_unit_aliases_tenant_alias
  on public.unit_aliases (tenant_id, lower(alias));
create index if not exists idx_unit_aliases_tenant_uom
  on public.unit_aliases (tenant_id, uom_id);

-- Server-only, like the other tenant masters no browser session reads.
alter table public.unit_aliases enable row level security;
alter table public.unit_aliases force row level security;
revoke all on table public.unit_aliases from anon, authenticated;
drop policy if exists deny_direct_client_access on public.unit_aliases;
create policy deny_direct_client_access
on public.unit_aliases
for all
to anon, authenticated
using (false)
with check (false);

drop trigger if exists audit_unit_aliases on public.unit_aliases;
create trigger audit_unit_aliases
after insert or update or delete
on public.unit_aliases
for each row execute function public.audit_log_trigger();

create or replace function public.resolve_unit_of_measure(
  p_tenant_id uuid,
  p_unit text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select uom.id
      from public.units_of_measure uom
      where uom.tenant_id = p_tenant_id
        and pg_catalog.lower(uom.code) = pg_catalog.lower(pg_catalog.btrim(p_unit))
    ),
    (
      select alias.uom_id
      from public.unit_aliases alias
      where alias.tenant_id = p_tenant_id
        and pg_catalog.lower(alias.alias) = pg_catalog.lower(pg_catalog.btrim(p_unit))
    )
  )
$$;

create or replace function public.link_po_line_item_and_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.material_item_id is null and new.code is not null then
    select item.id
      into new.material_item_id
      from public.material_items item
     where item.tenant_id = new.tenant_id
       and item.code = new.code;
  end if;

  if new.uom_id is null and new.unit is not null then
    new.uom_id := public.resolve_unit_of_measure(new.tenant_id, new.unit);
  end if;

  return new;
end
$$;

drop trigger if exists link_po_line_item_and_unit on public.po_line_items;
create trigger link_po_line_item_and_unit
before insert
on public.po_line_items
for each row execute function public.link_po_line_item_and_unit();

-- Same privileges as the other trigger functions.
revoke execute on function public.resolve_unit_of_measure(uuid, text)
  from public, anon, authenticated;
grant execute on function public.resolve_unit_of_measure(uuid, text)
  to service_role;
revoke execute on function public.link_po_line_item_and_unit()
  from public, anon, authenticated;
grant execute on function public.link_po_line_item_and_unit()
  to service_role;

-- Backfill lines written before the trigger existed. Idempotent: only NULLs.
update public.po_line_items line
   set material_item_id = item.id
  from public.material_items item
 where item.tenant_id = line.tenant_id
   and item.code = line.code
   and line.code is not null
   and line.material_item_id is null
   and (
     line.cost_code_id is null
     or exists (
       select 1
       from public.cost_codes cost_code
       where cost_code.id = line.cost_code_id
         and cost_code.tenant_id = line.tenant_id
         and cost_code.is_active
     )
   );

update public.po_line_items line
   set uom_id = public.resolve_unit_of_measure(line.tenant_id, line.unit)
 where line.uom_id is null
   and line.unit is not null
   and public.resolve_unit_of_measure(line.tenant_id, line.unit) is not null
   and (
     line.cost_code_id is null
     or exists (
       select 1
       from public.cost_codes cost_code
       where cost_code.id = line.cost_code_id
         and cost_code.tenant_id = line.tenant_id
         and cost_code.is_active
     )
   );

commit;
