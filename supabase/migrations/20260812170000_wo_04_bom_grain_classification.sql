-- WO-04 / M-01: discriminate work-item and material-line grain.
--
-- This migration is additive. bom_line_items.id remains the downstream spine.
-- The review table records unresolved UOMs and material lines that still need
-- a human-selected parent. No parent is inferred or auto-created here.

alter table public.bom_line_items
  add column if not exists kind text not null default 'work_item',
  add column if not exists parent_line_item_id uuid,
  add column if not exists location_id uuid,
  add column if not exists division_id uuid,
  add column if not exists item_no text,
  add column if not exists drawing_revision_id uuid,
  add column if not exists takeoff_import_id uuid,
  add column if not exists unit_rate_source text not null default 'manual',
  add column if not exists classification_status text not null default 'classified',
  add column if not exists classification_reason text;

create unique index if not exists ux_bom_line_items_tenant_bom_id_id
  on public.bom_line_items (tenant_id, bom_id, id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bom_line_items'::regclass
       and conname = 'bom_line_items_kind_check'
  ) then
    alter table public.bom_line_items
      add constraint bom_line_items_kind_check
      check (kind in ('work_item', 'material_line'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bom_line_items'::regclass
       and conname = 'bom_line_items_unit_rate_source_check'
  ) then
    alter table public.bom_line_items
      add constraint bom_line_items_unit_rate_source_check
      check (unit_rate_source in ('dupa', 'manual', 'client_boq'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bom_line_items'::regclass
       and conname = 'bom_line_items_classification_status_check'
  ) then
    alter table public.bom_line_items
      add constraint bom_line_items_classification_status_check
      check (classification_status in ('classified', 'review'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.bom_line_items'::regclass
       and conname = 'bom_line_items_parent_bom_tenant_fk'
  ) then
    alter table public.bom_line_items
      add constraint bom_line_items_parent_bom_tenant_fk
      foreign key (tenant_id, bom_id, parent_line_item_id)
      references public.bom_line_items (tenant_id, bom_id, id)
      on delete restrict;
  end if;
end
$$;

create index if not exists idx_bom_line_items_tenant_parent_line_item
  on public.bom_line_items (tenant_id, parent_line_item_id);

create index if not exists idx_bom_line_items_tenant_kind
  on public.bom_line_items (tenant_id, kind);

-- Backfill only from the approved UOM mapping. The default work_item value is
-- a storage placeholder for ambiguous rows; classification_status is the
-- authoritative gate until an estimator resolves the review record.
update public.bom_line_items
   set kind = 'work_item',
       classification_status = 'classified',
       classification_reason = null
 where classification_status = 'classified'
   and regexp_replace(lower(btrim(coalesce(unit, ''))), E'\\s+', '', 'g')
       in ('sqm', 'cu.m', 'm2', 'lm', 'lot');

update public.bom_line_items
   set kind = 'material_line',
       classification_status = 'review',
       classification_reason = 'Material lines require an explicit parent work item.'
 where classification_status = 'classified'
   and regexp_replace(lower(btrim(coalesce(unit, ''))), E'\\s+', '', 'g')
       in ('pc', 'pcs', 'kg', 'set', 'liters');

update public.bom_line_items
   set kind = 'work_item',
       classification_status = 'review',
       classification_reason = 'UOM is not in the approved grain classification list.'
 where classification_status = 'classified'
   and regexp_replace(lower(btrim(coalesce(unit, ''))), E'\\s+', '', 'g')
       not in ('sqm', 'cu.m', 'm2', 'lm', 'lot', 'pc', 'pcs', 'kg', 'set', 'liters');

create table if not exists public.bom_line_item_grain_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bom_id uuid not null,
  bom_line_item_id uuid not null,
  proposed_kind text,
  reason text not null,
  status text not null default 'pending',
  resolved_kind text,
  resolved_parent_line_item_id uuid,
  created_by uuid,
  resolved_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint bom_line_item_grain_reviews_status_check
    check (status in ('pending', 'resolved', 'rejected')),
  constraint bom_line_item_grain_reviews_proposed_kind_check
    check (proposed_kind is null or proposed_kind in ('work_item', 'material_line')),
  constraint bom_line_item_grain_reviews_resolved_kind_check
    check (resolved_kind is null or resolved_kind in ('work_item', 'material_line')),
  constraint bom_line_item_grain_reviews_resolved_shape_check
    check (
      status <> 'resolved'
      or (
        resolved_kind is not null
        and (
          resolved_kind = 'work_item'
          or resolved_parent_line_item_id is not null
        )
      )
    ),
  constraint bom_line_item_grain_reviews_line_bom_tenant_fk
    foreign key (tenant_id, bom_id, bom_line_item_id)
    references public.bom_line_items (tenant_id, bom_id, id)
    on delete cascade,
  constraint bom_line_item_grain_reviews_bom_tenant_fk
    foreign key (tenant_id, bom_id)
    references public.boms (tenant_id, id)
    on delete cascade,
  constraint bom_line_item_grain_reviews_parent_bom_tenant_fk
    foreign key (tenant_id, bom_id, resolved_parent_line_item_id)
    references public.bom_line_items (tenant_id, bom_id, id)
    on delete restrict,
  constraint bom_line_item_grain_reviews_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users (tenant_id, id)
    on delete restrict,
  constraint bom_line_item_grain_reviews_resolved_by_tenant_fk
    foreign key (tenant_id, resolved_by)
    references public.users (tenant_id, id)
    on delete restrict,
  constraint bom_line_item_grain_reviews_updated_by_tenant_fk
    foreign key (tenant_id, updated_by)
    references public.users (tenant_id, id)
    on delete restrict
);

create unique index if not exists ux_bom_line_item_grain_reviews_tenant_id_id
  on public.bom_line_item_grain_reviews (tenant_id, id);

create index if not exists idx_bom_line_item_grain_reviews_tenant_bom_line
  on public.bom_line_item_grain_reviews (tenant_id, bom_id, bom_line_item_id);

create unique index if not exists ux_bom_line_item_grain_reviews_pending_line
  on public.bom_line_item_grain_reviews (tenant_id, bom_line_item_id)
  where status = 'pending';

-- Existing rows that need a human decision become durable review records.
insert into public.bom_line_item_grain_reviews (
  tenant_id,
  bom_id,
  bom_line_item_id,
  proposed_kind,
  reason,
  created_at,
  updated_at
)
select
  line.tenant_id,
  line.bom_id,
  line.id,
  case when line.kind = 'material_line' then 'material_line' else null end,
  coalesce(line.classification_reason, 'Explicit grain review required.'),
  now(),
  now()
from public.bom_line_items line
where line.classification_status = 'review'
  and not exists (
    select 1
    from public.bom_line_item_grain_reviews review
    where review.tenant_id = line.tenant_id
      and review.bom_line_item_id = line.id
      and review.status = 'pending'
  );

alter table public.bom_line_item_grain_reviews enable row level security;

revoke all privileges on table public.bom_line_item_grain_reviews
from public, anon, authenticated;

grant select, insert, update
on table public.bom_line_item_grain_reviews
to authenticated;

grant all privileges on table public.bom_line_item_grain_reviews
to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'bom_line_item_grain_reviews'
       and policyname = 'bom_line_item_grain_reviews_tenant_read'
  ) then
    create policy bom_line_item_grain_reviews_tenant_read
      on public.bom_line_item_grain_reviews
      for select
      to authenticated
      using (tenant_id = public.auth_tenant_id());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'bom_line_item_grain_reviews'
       and policyname = 'bom_line_item_grain_reviews_tenant_insert'
  ) then
    create policy bom_line_item_grain_reviews_tenant_insert
      on public.bom_line_item_grain_reviews
      for insert
      to authenticated
      with check (tenant_id = public.auth_tenant_id());
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'bom_line_item_grain_reviews'
       and policyname = 'bom_line_item_grain_reviews_tenant_update'
  ) then
    create policy bom_line_item_grain_reviews_tenant_update
      on public.bom_line_item_grain_reviews
      for update
      to authenticated
      using (tenant_id = public.auth_tenant_id())
      with check (tenant_id = public.auth_tenant_id());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.bom_line_item_grain_reviews'::regclass
      and tgname = 'audit_bom_line_item_grain_reviews'
  ) then
    create trigger audit_bom_line_item_grain_reviews
      after insert or update or delete
      on public.bom_line_item_grain_reviews
      for each row execute function public.audit_log_trigger();
  end if;
end
$$;

-- I-03 is deliberately not enabled here. The invariant trigger is a later
-- release gate after the review queue is empty and the before/after FK ledger
-- comparison has passed. location_id, division_id, drawing_revision_id and
-- takeoff_import_id receive their FKs in the migrations that create those
-- dimension/source tables; this migration does not invent placeholder tables.
