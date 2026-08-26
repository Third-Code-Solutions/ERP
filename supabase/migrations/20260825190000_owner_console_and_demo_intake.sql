-- ADR-027: Platform-level demo intake and owner-console audit evidence.
-- These records are deliberately tenantless because a prospect has no tenant
-- before conversion. They are server-only and must never become a tenant
-- switching or browser-access mechanism.

begin;

create table if not exists public.platform_demo_requests (
  id uuid primary key default gen_random_uuid(),
  contact_name varchar(255) not null,
  work_email varchar(255) not null,
  phone varchar(64),
  job_title varchar(120),
  company_name varchar(255) not null,
  organization_type varchar(64) not null,
  company_size varchar(64),
  team_size integer,
  use_case text not null,
  preferred_demo_window varchar(255),
  status varchar(32) not null default 'new',
  review_notes text,
  reviewed_by uuid,
  reviewed_by_email varchar(255),
  reviewed_at timestamptz,
  consent_recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_demo_requests_status_check
    check (status in ('new', 'contacted', 'demo_scheduled', 'converted', 'declined')),
  constraint platform_demo_requests_contact_name_nonempty
    check (length(btrim(contact_name)) > 0),
  constraint platform_demo_requests_company_name_nonempty
    check (length(btrim(company_name)) > 0),
  constraint platform_demo_requests_team_size_nonnegative
    check (team_size is null or team_size >= 1)
);

create index if not exists idx_platform_demo_requests_status_created_at
  on public.platform_demo_requests (status, created_at desc);
create index if not exists idx_platform_demo_requests_company_created_at
  on public.platform_demo_requests (company_name, created_at desc);

create table if not exists public.platform_audit_log (
  id bigserial primary key,
  actor_id uuid,
  actor_email varchar(255),
  entity_type varchar(100) not null,
  entity_id uuid not null,
  action varchar(80) not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint platform_audit_log_entity_type_nonempty
    check (length(btrim(entity_type)) > 0),
  constraint platform_audit_log_action_nonempty
    check (length(btrim(action)) > 0)
);

create index if not exists idx_platform_audit_log_entity
  on public.platform_audit_log (entity_type, entity_id);
create index if not exists idx_platform_audit_log_created_at
  on public.platform_audit_log (created_at desc);
create index if not exists idx_platform_audit_log_actor_id
  on public.platform_audit_log (actor_id);

-- Platform audit evidence is immutable even for trusted server paths.
create or replace function public.reject_platform_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'platform_audit_log is append-only';
end;
$$;

revoke all on function public.reject_platform_audit_mutation()
  from public, anon, authenticated;
grant execute on function public.reject_platform_audit_mutation()
  to service_role;

drop trigger if exists platform_audit_log_no_mutation on public.platform_audit_log;
create trigger platform_audit_log_no_mutation
  before update or delete on public.platform_audit_log
  for each row execute function public.reject_platform_audit_mutation();

alter table public.platform_demo_requests enable row level security;
alter table public.platform_demo_requests force row level security;
alter table public.platform_audit_log enable row level security;
alter table public.platform_audit_log force row level security;

revoke all privileges on table public.platform_demo_requests
  from public, anon, authenticated;
revoke all privileges on table public.platform_audit_log
  from public, anon, authenticated;
grant all privileges on table public.platform_demo_requests to service_role;
grant select, insert on table public.platform_audit_log to service_role;
grant usage, select on sequence public.platform_audit_log_id_seq to service_role;

commit;
