-- WO-16: permit return control, LGU duration learning, and the
-- mobilization readiness gate.
--
-- Existing permit columns remain intact for compatibility. New duration and
-- readiness fields are additive; expected_return_at is the canonical return
-- forecast while expected_approval_at remains a legacy alias.

begin;

do $$
begin
  alter type public.permit_type add value if not exists 'occupancy_permit';
  alter type public.permit_type add value if not exists 'cari';
  alter type public.permit_type add value if not exists 'performance_bond';
  alter type public.permit_type add value if not exists 'surety_bond';
  alter type public.permit_type add value if not exists 'construction_bond';
  alter type public.permit_status add value if not exists 'released';
  alter type public.permit_status add value if not exists 'refunded';
  alter type public.permit_status add value if not exists 'cancelled';
end
$$;

create table if not exists public.permit_duration_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lgu_name varchar(160) not null,
  permit_type public.permit_type not null,
  min_duration_days integer not null,
  expected_duration_days integer not null,
  max_duration_days integer not null,
  observed_count integer not null default 0,
  last_observed_days integer,
  last_observed_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permit_duration_profiles_range
    check (
      min_duration_days >= 0
      and min_duration_days <= expected_duration_days
      and expected_duration_days <= max_duration_days
    ),
  constraint permit_duration_profiles_observed_count
    check (observed_count >= 0 and (observed_count = 0 or last_observed_days is not null)),
  constraint permit_duration_profiles_lgu_name_nonempty
    check (lgu_name = btrim(lgu_name) and length(lgu_name) > 0),
  constraint permit_duration_profiles_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint permit_duration_profiles_updated_by_tenant_fk
    foreign key (tenant_id, updated_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint permit_duration_profiles_identity
    unique (tenant_id, lgu_name, permit_type)
);

create unique index if not exists ux_permit_duration_profiles_tenant_id_id
  on public.permit_duration_profiles (tenant_id, id);
create index if not exists idx_permit_duration_profiles_tenant_lgu
  on public.permit_duration_profiles (tenant_id, lgu_name);

alter table public.permits
  add column if not exists expected_return_at timestamptz,
  add column if not exists actual_return_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists lgu_name varchar(160),
  add column if not exists responsible_user_id uuid,
  add column if not exists duration_profile_id uuid,
  add column if not exists min_duration_days integer,
  add column if not exists expected_duration_days integer,
  add column if not exists max_duration_days integer,
  add column if not exists escalation_at timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists escalation_reason varchar(500),
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid;

-- Backfill the canonical forecast from the existing column before the new
-- application starts writing both fields.
update public.permits
   set expected_return_at = expected_approval_at
 where expected_return_at is null
   and expected_approval_at is not null;

create unique index if not exists ux_permits_tenant_id_id
  on public.permits (tenant_id, id);
create index if not exists idx_permits_tenant_responsible
  on public.permits (tenant_id, responsible_user_id);
create index if not exists idx_permits_tenant_expected_return
  on public.permits (tenant_id, expected_return_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.permits'::regclass
      and conname = 'permits_duration_range'
  ) then
    alter table public.permits
      add constraint permits_duration_range
      check (
        (
          min_duration_days is null
          and expected_duration_days is null
          and max_duration_days is null
        ) or (
          min_duration_days is not null
          and expected_duration_days is not null
          and max_duration_days is not null
          and min_duration_days >= 0
          and min_duration_days <= expected_duration_days
          and expected_duration_days <= max_duration_days
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.permits'::regclass
      and conname = 'permits_escalation_reason'
  ) then
    alter table public.permits
      add constraint permits_escalation_reason
      check (
        escalated_at is null
        or (escalation_reason is not null and length(btrim(escalation_reason)) > 0)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.permits'::regclass
      and conname = 'permits_project_tenant_fk'
  ) then
    alter table public.permits
      add constraint permits_project_tenant_fk
      foreign key (tenant_id, project_id)
      references public.projects(tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.permits'::regclass
      and conname = 'permits_responsible_user_tenant_fk'
  ) then
    alter table public.permits
      add constraint permits_responsible_user_tenant_fk
      foreign key (tenant_id, responsible_user_id)
      references public.users(tenant_id, id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.permits'::regclass
      and conname = 'permits_duration_profile_tenant_fk'
  ) then
    alter table public.permits
      add constraint permits_duration_profile_tenant_fk
      foreign key (tenant_id, duration_profile_id)
      references public.permit_duration_profiles(tenant_id, id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.permits'::regclass
      and conname = 'permits_created_by_tenant_fk'
  ) then
    alter table public.permits
      add constraint permits_created_by_tenant_fk
      foreign key (tenant_id, created_by)
      references public.users(tenant_id, id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.permits'::regclass
      and conname = 'permits_updated_by_tenant_fk'
  ) then
    alter table public.permits
      add constraint permits_updated_by_tenant_fk
      foreign key (tenant_id, updated_by)
      references public.users(tenant_id, id)
      on delete set null;
  end if;
end
$$;

create table if not exists public.mobilization_readiness (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  commented_fcd_received_at timestamptz,
  po_copies_received_at timestamptz,
  cari_received_at timestamptz,
  ntp_received_at timestamptz,
  started_at timestamptz,
  started_by uuid,
  override_reason varchar(500),
  override_at timestamptz,
  override_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobilization_readiness_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id)
    on delete cascade,
  constraint mobilization_readiness_started_by_tenant_fk
    foreign key (tenant_id, started_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint mobilization_readiness_override_by_tenant_fk
    foreign key (tenant_id, override_by)
    references public.users(tenant_id, id)
    on delete restrict,
  constraint mobilization_readiness_created_by_tenant_fk
    foreign key (tenant_id, created_by)
    references public.users(tenant_id, id)
    on delete set null,
  constraint mobilization_readiness_updated_by_tenant_fk
    foreign key (tenant_id, updated_by)
    references public.users(tenant_id, id)
    on delete set null,
  constraint mobilization_readiness_tenant_project_unique
    unique (tenant_id, project_id),
  constraint mobilization_readiness_start_actor
    check (
      (started_at is null and started_by is null)
      or (started_at is not null and started_by is not null)
    ),
  constraint mobilization_readiness_override
    check (
      (
        override_reason is null
        and override_at is null
        and override_by is null
      ) or (
        started_at is not null
        and override_reason is not null
        and length(btrim(override_reason)) > 0
        and override_at is not null
        and override_by is not null
      )
    ),
  constraint mobilization_readiness_start_gate
    check (
      started_at is null
      or (
        (
          commented_fcd_received_at is not null
          and po_copies_received_at is not null
          and cari_received_at is not null
          and ntp_received_at is not null
        )
        or override_reason is not null
      )
    )
);

create unique index if not exists ux_mobilization_readiness_tenant_id_id
  on public.mobilization_readiness (tenant_id, id);
create index if not exists idx_mobilization_readiness_project
  on public.mobilization_readiness (tenant_id, project_id);
create index if not exists idx_mobilization_readiness_started
  on public.mobilization_readiness (tenant_id, started_at);

create or replace function public.guard_mobilization_readiness()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.started_at is not null then
    if new.started_at is distinct from old.started_at
       or new.started_by is distinct from old.started_by then
      raise exception 'Mobilization start is immutable once recorded';
    end if;

    if (old.commented_fcd_received_at is not null and new.commented_fcd_received_at is null)
       or (old.po_copies_received_at is not null and new.po_copies_received_at is null)
       or (old.cari_received_at is not null and new.cari_received_at is null)
       or (old.ntp_received_at is not null and new.ntp_received_at is null) then
      raise exception 'Mobilization evidence cannot be cleared after start';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists guard_mobilization_readiness on public.mobilization_readiness;
create trigger guard_mobilization_readiness
  before insert or update on public.mobilization_readiness
  for each row execute function public.guard_mobilization_readiness();

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.permit_duration_profiles'::regclass
      and tgname = 'audit_permit_duration_profiles'
  ) then
    create trigger audit_permit_duration_profiles
      after insert or update or delete on public.permit_duration_profiles
      for each row execute function public.audit_log_trigger();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.mobilization_readiness'::regclass
      and tgname = 'audit_mobilization_readiness'
  ) then
    create trigger audit_mobilization_readiness
      after insert or update or delete on public.mobilization_readiness
      for each row execute function public.audit_log_trigger();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.permits'::regclass
      and tgname = 'audit_permits'
  ) then
    create trigger audit_permits
      after insert or update or delete on public.permits
      for each row execute function public.audit_log_trigger();
  end if;
end
$$;

alter table public.permits enable row level security;
alter table public.permits force row level security;
alter table public.permit_duration_profiles enable row level security;
alter table public.permit_duration_profiles force row level security;
alter table public.mobilization_readiness enable row level security;
alter table public.mobilization_readiness force row level security;

revoke all privileges on table public.permits, public.permit_duration_profiles,
  public.mobilization_readiness from public, anon, authenticated;
grant select, insert, update on table public.permits to authenticated;
grant select, insert, update on table public.permit_duration_profiles to authenticated;
grant select, insert, update on table public.mobilization_readiness to authenticated;
grant all privileges on table public.permits, public.permit_duration_profiles,
  public.mobilization_readiness to service_role;

drop policy if exists permits_tenant_read on public.permits;
create policy permits_tenant_read on public.permits
  for select to authenticated
  using (tenant_id = public.auth_tenant_id());
drop policy if exists permits_tenant_insert on public.permits;
create policy permits_tenant_insert on public.permits
  for insert to authenticated
  with check (
    tenant_id = public.auth_tenant_id()
    and exists (
      select 1 from public.users actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = public.auth_tenant_id()
        and actor.role::text in ('admin', 'owner', 'commercial', 'sd_pm_pe', 'pm', 'safety')
    )
  );
drop policy if exists permits_tenant_update on public.permits;
create policy permits_tenant_update on public.permits
  for update to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and exists (
      select 1 from public.users actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = public.auth_tenant_id()
        and actor.role::text in ('admin', 'owner', 'commercial', 'sd_pm_pe', 'pm', 'safety')
    )
  )
  with check (tenant_id = public.auth_tenant_id());

drop policy if exists permit_duration_profiles_tenant_read on public.permit_duration_profiles;
create policy permit_duration_profiles_tenant_read on public.permit_duration_profiles
  for select to authenticated
  using (tenant_id = public.auth_tenant_id());
drop policy if exists permit_duration_profiles_tenant_insert on public.permit_duration_profiles;
create policy permit_duration_profiles_tenant_insert on public.permit_duration_profiles
  for insert to authenticated
  with check (
    tenant_id = public.auth_tenant_id()
    and exists (
      select 1 from public.users actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = public.auth_tenant_id()
        and actor.role::text in ('admin', 'owner', 'commercial', 'sd_pm_pe', 'pm')
    )
  );
drop policy if exists permit_duration_profiles_tenant_update on public.permit_duration_profiles;
create policy permit_duration_profiles_tenant_update on public.permit_duration_profiles
  for update to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and exists (
      select 1 from public.users actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = public.auth_tenant_id()
        and actor.role::text in ('admin', 'owner', 'commercial', 'sd_pm_pe', 'pm')
    )
  )
  with check (tenant_id = public.auth_tenant_id());

drop policy if exists mobilization_readiness_tenant_read on public.mobilization_readiness;
create policy mobilization_readiness_tenant_read on public.mobilization_readiness
  for select to authenticated
  using (tenant_id = public.auth_tenant_id());
drop policy if exists mobilization_readiness_tenant_insert on public.mobilization_readiness;
create policy mobilization_readiness_tenant_insert on public.mobilization_readiness
  for insert to authenticated
  with check (
    tenant_id = public.auth_tenant_id()
    and exists (
      select 1 from public.users actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = public.auth_tenant_id()
        and actor.role::text in ('admin', 'owner', 'commercial', 'sd_pm_pe', 'pm', 'safety')
    )
  );
drop policy if exists mobilization_readiness_tenant_update on public.mobilization_readiness;
create policy mobilization_readiness_tenant_update on public.mobilization_readiness
  for update to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and exists (
      select 1 from public.users actor
      where actor.id = (select auth.uid())
        and actor.tenant_id = public.auth_tenant_id()
        and actor.role::text in ('admin', 'owner', 'commercial', 'sd_pm_pe', 'pm', 'safety')
    )
  )
  with check (tenant_id = public.auth_tenant_id());

commit;
