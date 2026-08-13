-- WO-11: PPRF dual-track gate.
--
-- Financial Evaluation and Credit Investigation are independent durable
-- tracks. A later pipeline stage must not infer clearance from an account
-- summary or from client-side state.

begin;

do $$
begin
  create type public.opportunity_kyc_track_type as enum (
    'financial_evaluation',
    'credit_investigation'
  );
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.opportunity_kyc_track_status as enum (
    'pending',
    'in_review',
    'approved',
    'flagged',
    'rejected'
  );
exception when duplicate_object then null;
end
$$;

-- Needed before the tenant-safe composite foreign key below.
create unique index if not exists ux_opportunities_tenant_id_id
  on public.opportunities (tenant_id, id);

create table if not exists public.opportunity_kyc_tracks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  opportunity_id uuid not null,
  track_type public.opportunity_kyc_track_type not null,
  status public.opportunity_kyc_track_status not null default 'pending',
  due_at timestamptz not null,
  prepared_by uuid,
  prepared_at timestamptz,
  fc_recommended_by uuid,
  fc_recommended_at timestamptz,
  president_decided_by uuid,
  president_decided_at timestamptz,
  decision_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunity_kyc_tracks_decision_reason
    check (
      status not in ('flagged', 'rejected')
      or (decision_reason is not null and length(btrim(decision_reason)) > 0)
    ),
  constraint opportunity_kyc_tracks_approved_decision
    check (
      status <> 'approved'
      or (
        president_decided_by is not null
        and president_decided_at is not null
        and fc_recommended_at is not null
      )
    ),
  constraint opportunity_kyc_tracks_opportunity_tenant_fk
    foreign key (tenant_id, opportunity_id)
    references public.opportunities(tenant_id, id)
    on delete cascade,
  constraint opportunity_kyc_tracks_prepared_by_tenant_fk
    foreign key (tenant_id, prepared_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint opportunity_kyc_tracks_fc_recommended_by_tenant_fk
    foreign key (tenant_id, fc_recommended_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint opportunity_kyc_tracks_president_decided_by_tenant_fk
    foreign key (tenant_id, president_decided_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint opportunity_kyc_tracks_track_unique
    unique (tenant_id, opportunity_id, track_type)
);

create unique index if not exists ux_opportunity_kyc_tracks_tenant_id_id
  on public.opportunity_kyc_tracks (tenant_id, id);
create index if not exists idx_opportunity_kyc_tracks_tenant_status
  on public.opportunity_kyc_tracks (tenant_id, status, due_at);
create index if not exists idx_opportunity_kyc_tracks_opportunity
  on public.opportunity_kyc_tracks (tenant_id, opportunity_id);

alter table public.opportunity_kyc_tracks enable row level security;

revoke all privileges on table public.opportunity_kyc_tracks
from public, anon, authenticated;
grant select, insert, update on table public.opportunity_kyc_tracks to authenticated;
grant all privileges on table public.opportunity_kyc_tracks to service_role;

drop policy if exists opportunity_kyc_tracks_tenant_read
  on public.opportunity_kyc_tracks;
create policy opportunity_kyc_tracks_tenant_read
  on public.opportunity_kyc_tracks
  for select to authenticated
  using (tenant_id = public.auth_tenant_id());

drop policy if exists opportunity_kyc_tracks_tenant_insert
  on public.opportunity_kyc_tracks;
create policy opportunity_kyc_tracks_tenant_insert
  on public.opportunity_kyc_tracks
  for insert to authenticated
  with check (
    tenant_id = public.auth_tenant_id()
    and exists (
      select 1
      from public.users actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = public.auth_tenant_id()
        and actor.role::text in ('sales', 'admin', 'owner')
    )
  );

drop policy if exists opportunity_kyc_tracks_tenant_update
  on public.opportunity_kyc_tracks;
create policy opportunity_kyc_tracks_tenant_update
  on public.opportunity_kyc_tracks
  for update to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and exists (
      select 1
      from public.users actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = public.auth_tenant_id()
        and actor.role::text in ('finance', 'admin', 'owner')
    )
  )
  with check (
    tenant_id = public.auth_tenant_id()
    and exists (
      select 1
      from public.users actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = public.auth_tenant_id()
        and actor.role::text in ('finance', 'admin', 'owner')
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.opportunity_kyc_tracks'::regclass
      and tgname = 'audit_opportunity_kyc_tracks'
  ) then
    create trigger audit_opportunity_kyc_tracks
      after insert or update or delete
      on public.opportunity_kyc_tracks
      for each row execute function public.audit_log_trigger();
  end if;
end
$$;

commit;
