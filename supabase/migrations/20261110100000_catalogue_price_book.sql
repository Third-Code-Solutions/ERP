-- Master construction price catalogue (docs/erp/specs/catalogue.md).
--
-- catalogue_items is the tenant's reference item list; catalogue_prices holds
-- append-only market price observations (low / average / high in centavos).
-- Additive only: two new tables, their indexes, one trigger function and the
-- pg_trgm extension. Nothing that exists is dropped, renamed or retyped.
--
-- Access: every read and write runs on the server as `postgres` with an
-- explicit tenant_id predicate. Browser roles get no table privilege at all;
-- the tenant SELECT policy is a second layer in case a grant is ever restored.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$ begin
  if to_regprocedure('public.audit_log_trigger()') is null then
    raise exception 'The price catalogue requires public.audit_log_trigger() before applying'
      using errcode = '55000';
  end if;
end $$;

-- Trigram search on item names. Available on production, not yet installed.
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.catalogue_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  trade text not null,
  specification text,
  unit text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  -- Seeded rows are <trade prefix>-<4 digits>; supplier-created rows SUP-<n>.
  constraint catalogue_items_code_format check (
    code ~ '^([A-Z]{2}-[0-9]{4}|SUP-[0-9]{1,12})$'
  ),
  constraint catalogue_items_name_check check (
    name = btrim(name) and char_length(name) between 1 and 300
  ),
  constraint catalogue_items_trade_check check (
    trade in (
      'earthworks', 'concrete', 'rebar-structural-steel', 'formwork',
      'masonry', 'waterproofing', 'roofing', 'doors-windows',
      'ceiling-drywall', 'floor-wall-finishes', 'paint', 'plumbing-sanitary',
      'electrical', 'fire-protection', 'mechanical-hvac', 'road-bridge-works',
      'drainage', 'site-safety', 'labor', 'equipment'
    )
  ),
  constraint catalogue_items_specification_length check (
    specification is null or char_length(specification) <= 2000
  ),
  constraint catalogue_items_unit_length check (
    char_length(unit) between 1 and 20
  ),
  -- RESTRICT keeps "edited by a person" (updated_by) from being cleared, which
  -- is what stops the seed from overwriting an admin edit.
  constraint catalogue_items_created_by_tenant_fk foreign key (tenant_id, created_by)
    references public.users (tenant_id, id) on delete restrict,
  constraint catalogue_items_updated_by_tenant_fk foreign key (tenant_id, updated_by)
    references public.users (tenant_id, id) on delete restrict
);

create unique index if not exists ux_catalogue_items_tenant_code
  on public.catalogue_items (tenant_id, code);
create unique index if not exists ux_catalogue_items_tenant_id_id
  on public.catalogue_items (tenant_id, id);
create index if not exists idx_catalogue_items_tenant_trade
  on public.catalogue_items (tenant_id, trade);
create index if not exists idx_catalogue_items_name_trgm
  on public.catalogue_items using gin (name extensions.gin_trgm_ops);

create table if not exists public.catalogue_prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  item_id uuid not null,
  region text not null default 'NCR',
  price_low_centavos bigint,
  price_avg_centavos bigint,
  price_high_centavos bigint,
  price_basis text,
  source_kind text not null,
  source_name text,
  source_url text,
  vendor_id uuid,
  checked_on date not null,
  flag text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint catalogue_prices_region_length check (
    char_length(region) between 1 and 40
  ),
  -- All three prices or none; the average is stored as observed.
  constraint catalogue_prices_price_range check (
    (
      price_low_centavos is null
      and price_avg_centavos is null
      and price_high_centavos is null
    )
    or (
      price_low_centavos is not null
      and price_avg_centavos is not null
      and price_high_centavos is not null
      and price_low_centavos >= 0
      and price_low_centavos <= price_avg_centavos
      and price_avg_centavos <= price_high_centavos
    )
  ),
  constraint catalogue_prices_basis_length check (
    price_basis is null or char_length(price_basis) <= 60
  ),
  constraint catalogue_prices_source_kind_check check (
    source_kind in ('research', 'supplier', 'manual')
  ),
  constraint catalogue_prices_source_name_length check (
    source_name is null or char_length(source_name) <= 200
  ),
  constraint catalogue_prices_source_url_check check (
    source_url is null
    or (source_url ~ '^https?://' and char_length(source_url) <= 2000)
  ),
  -- The current price is the newest checked_on, so a future date could never
  -- be superseded. "Today" is the Manila calendar date.
  constraint catalogue_prices_checked_on_not_future check (
    checked_on <= (now() at time zone 'Asia/Manila')::date
  ),
  constraint catalogue_prices_flag_length check (
    flag is null or char_length(flag) <= 200
  ),
  constraint catalogue_prices_notes_length check (
    notes is null or char_length(notes) <= 2000
  ),
  constraint catalogue_prices_item_tenant_fk foreign key (tenant_id, item_id)
    references public.catalogue_items (tenant_id, id) on delete restrict,
  constraint catalogue_prices_vendor_tenant_fk foreign key (tenant_id, vendor_id)
    references public.vendors (tenant_id, id) on delete restrict,
  constraint catalogue_prices_created_by_tenant_fk foreign key (tenant_id, created_by)
    references public.users (tenant_id, id) on delete restrict
);

-- Current price = first row per (tenant, item, region) in this order.
create index if not exists idx_catalogue_prices_current
  on public.catalogue_prices (tenant_id, item_id, region, checked_on desc, created_at desc);

-- Price observations are append-only: a correction is a new `manual` row.
create or replace function public.prevent_catalogue_price_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Catalogue price observations are append-only'
    using errcode = '55000';
end
$$;

revoke execute on function public.prevent_catalogue_price_mutation()
  from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1
      from pg_trigger
     where tgname = 'catalogue_prices_append_only'
       and tgrelid = 'public.catalogue_prices'::regclass
       and not tgisinternal
  ) then
    create trigger catalogue_prices_append_only
      before update or delete on public.catalogue_prices
      for each row execute function public.prevent_catalogue_price_mutation();
  end if;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['catalogue_items', 'catalogue_prices']
  loop
    if not exists (
      select 1
        from pg_trigger
       where tgname = 'audit_' || table_name
         and tgrelid = format('public.%I', table_name)::regclass
         and not tgisinternal
    ) then
      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_log_trigger()',
        'audit_' || table_name,
        table_name
      );
    end if;

    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);

    if not exists (
      select 1
        from pg_policies
       where schemaname = 'public'
         and tablename = table_name
         and policyname = table_name || '_tenant_select'
    ) then
      execute format(
        'create policy %I on public.%I for select to authenticated using (tenant_id = public.auth_tenant_id())',
        table_name || '_tenant_select',
        table_name
      );
    end if;
  end loop;
end
$$;

-- No browser access at all (SEC-01/SEC-02 and the catalogue security review):
-- the default ACL would otherwise hand `authenticated` a SELECT grant.
revoke all privileges on table public.catalogue_items, public.catalogue_prices
  from public, anon, authenticated;
grant all privileges on table public.catalogue_items, public.catalogue_prices
  to service_role;

commit;
