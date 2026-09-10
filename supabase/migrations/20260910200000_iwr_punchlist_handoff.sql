-- QA/QC rejected-IWR to punchlist handoff.
-- The handoff is a single immutable operation: one rejected IWR can produce
-- several punchlist rows, while retries resolve to the same rows.

begin;

alter table public.quality_hold_points
  add column if not exists punchlist_handoff_at timestamptz,
  add column if not exists punchlist_handoff_by uuid;

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'quality_hold_points_punchlist_handoff_by_tenant_fk'
       and conrelid = 'public.quality_hold_points'::regclass
  ) then
    alter table public.quality_hold_points
      add constraint quality_hold_points_punchlist_handoff_by_tenant_fk
      foreign key (tenant_id, punchlist_handoff_by)
      references public.users(tenant_id, id)
      on delete restrict;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'quality_hold_points_punchlist_handoff_metadata_consistent'
       and conrelid = 'public.quality_hold_points'::regclass
  ) then
    alter table public.quality_hold_points
      add constraint quality_hold_points_punchlist_handoff_metadata_consistent
      check (
        (punchlist_handoff_at is null and punchlist_handoff_by is null)
        or
        (punchlist_handoff_at is not null and punchlist_handoff_by is not null)
      );
  end if;
end $$;

create table if not exists public.quality_hold_point_punchlist_handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  quality_hold_point_id uuid not null,
  client_request_id uuid not null,
  request_hash varchar(64) not null,
  source_iwr_number varchar(40) not null,
  source_findings text not null default '',
  source_rejection_reason text not null,
  plan_document_id uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint quality_hold_point_punchlist_handoffs_request_hash_length
    check (length(request_hash) = 64),
  constraint quality_hold_point_punchlist_handoffs_source_iwr_number_nonempty
    check (source_iwr_number = btrim(source_iwr_number) and length(source_iwr_number) > 0),
  constraint quality_hold_point_punchlist_handoffs_source_rejection_reason_nonempty
    check (source_rejection_reason = btrim(source_rejection_reason) and length(source_rejection_reason) > 0),
  constraint quality_hold_point_punchlist_handoffs_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id) on delete cascade,
  constraint quality_hold_point_punchlist_handoffs_source_quality_tenant_fk
    foreign key (tenant_id, quality_hold_point_id)
    references public.quality_hold_points(tenant_id, id) on delete restrict,
  constraint quality_hold_point_punchlist_handoffs_plan_document_tenant_fk
    foreign key (tenant_id, plan_document_id)
    references public.documents(tenant_id, id) on delete no action,
  constraint quality_hold_point_punchlist_handoffs_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id) on delete restrict
);

create unique index if not exists ux_quality_hold_point_punchlist_handoffs_tenant_id_id
  on public.quality_hold_point_punchlist_handoffs (tenant_id, id);
create unique index if not exists ux_quality_hold_point_punchlist_handoffs_tenant_source
  on public.quality_hold_point_punchlist_handoffs (tenant_id, quality_hold_point_id);
create unique index if not exists ux_quality_hold_point_punchlist_handoffs_tenant_client_request
  on public.quality_hold_point_punchlist_handoffs (tenant_id, client_request_id);
create unique index if not exists ux_quality_hold_point_punchlist_handoffs_tenant_id_project_id
  on public.quality_hold_point_punchlist_handoffs (tenant_id, id, project_id);
create index if not exists idx_quality_hold_point_punchlist_handoffs_project
  on public.quality_hold_point_punchlist_handoffs (tenant_id, project_id, created_at);
create index if not exists idx_quality_hold_point_punchlist_handoffs_source
  on public.quality_hold_point_punchlist_handoffs (tenant_id, quality_hold_point_id);

alter table public.punchlist_items
  add column if not exists source_handoff_id uuid;

do $$ begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'punchlist_items_source_handoff_tenant_project_fk'
       and conrelid = 'public.punchlist_items'::regclass
  ) then
    alter table public.punchlist_items
      add constraint punchlist_items_source_handoff_tenant_project_fk
      foreign key (tenant_id, source_handoff_id, project_id)
      references public.quality_hold_point_punchlist_handoffs(tenant_id, id, project_id)
      on delete restrict;
  end if;
end $$;

create index if not exists idx_punchlist_source_handoff
  on public.punchlist_items (tenant_id, source_handoff_id);

create or replace function public.prevent_handed_off_quality_hold_point_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.punchlist_handoff_at is not null then
    raise exception 'Rejected IWR is immutable after punchlist handoff';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'prevent_handed_off_quality_hold_point_mutation'
       and tgrelid = 'public.quality_hold_points'::regclass
       and not tgisinternal
  ) then
    create trigger prevent_handed_off_quality_hold_point_mutation
      before update or delete on public.quality_hold_points
      for each row execute function public.prevent_handed_off_quality_hold_point_mutation();
  end if;
end $$;

alter table public.quality_hold_point_punchlist_handoffs enable row level security;
alter table public.quality_hold_point_punchlist_handoffs force row level security;
revoke all privileges on table public.quality_hold_point_punchlist_handoffs from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'quality_hold_point_punchlist_handoffs'
       and policyname = 'quality_hold_point_punchlist_handoffs_deny_direct_client_access'
  ) then
    create policy quality_hold_point_punchlist_handoffs_deny_direct_client_access
      on public.quality_hold_point_punchlist_handoffs
      for all to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'audit_quality_hold_point_punchlist_handoffs'
       and tgrelid = 'public.quality_hold_point_punchlist_handoffs'::regclass
       and not tgisinternal
  ) then
    create trigger audit_quality_hold_point_punchlist_handoffs
      after insert or update or delete on public.quality_hold_point_punchlist_handoffs
      for each row execute function public.audit_log_trigger();
  end if;
end $$;

commit;
