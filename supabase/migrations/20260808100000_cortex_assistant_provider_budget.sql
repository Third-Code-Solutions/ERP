-- Inert provider-attempt money authority. No policy rows or provider calls.

begin;

create table public.cortex_assistant_provider_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  provider varchar(50) not null,
  model varchar(100) not null,
  enabled boolean not null default false,
  request_limit_micros bigint not null,
  daily_limit_micros bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cortex_asst_provider_policies_provider_valid check (
    provider ~ '^[a-z0-9][a-z0-9._-]{0,49}$'
  ),
  constraint cortex_asst_provider_policies_model_valid check (
    model ~ '^[a-z0-9][a-z0-9._:/-]{0,99}$'
  ),
  constraint cortex_asst_provider_policies_limit_bounds check (
    request_limit_micros between 1 and 999999999999
    and daily_limit_micros between request_limit_micros and 999999999999
  ),
  constraint cortex_asst_provider_policies_updated_after_created check (
    updated_at >= created_at
  )
);

create unique index ux_cortex_asst_provider_policy_tenant_id
  on public.cortex_assistant_provider_policies (tenant_id, id);
create unique index ux_cortex_asst_provider_policy_scope
  on public.cortex_assistant_provider_policies (tenant_id, provider, model);

create function public.enforce_cortex_asst_provider_policy_update()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.provider is distinct from old.provider
    or new.model is distinct from old.model
    or new.created_at is distinct from old.created_at
    or new.updated_at < old.updated_at then
    raise exception 'provider policy identity and time are immutable'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger enforce_cortex_asst_provider_policy_update
before update on public.cortex_assistant_provider_policies
for each row execute function
  public.enforce_cortex_asst_provider_policy_update();

create trigger audit_cortex_assistant_provider_policies
after insert or update or delete
on public.cortex_assistant_provider_policies
for each row execute function public.audit_log_trigger();

create table public.cortex_assistant_provider_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  policy_id uuid not null,
  job_id uuid not null,
  attempt_number integer not null,
  request_hash char(64) not null,
  status varchar(20) not null default 'reserved',
  reserved_cost_micros bigint not null,
  consumed_cost_micros bigint,
  outcome_code varchar(100),
  budget_date date not null default (
    pg_catalog.timezone('UTC', transaction_timestamp())::date
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dispatched_at timestamptz,
  terminal_at timestamptz,
  constraint cortex_asst_provider_attempts_tenant_job_fk
    foreign key (tenant_id, job_id)
    references public.cortex_assistant_generation_jobs(tenant_id, id)
    on delete restrict,
  constraint cortex_asst_provider_attempts_tenant_policy_fk
    foreign key (tenant_id, policy_id)
    references public.cortex_assistant_provider_policies(tenant_id, id)
    on delete restrict,
  constraint cortex_asst_provider_attempts_attempt_bounds check (
    attempt_number between 1 and 3
  ),
  constraint cortex_asst_provider_attempts_request_hash_hex check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint cortex_asst_provider_attempts_status_allowed check (
    status in ('reserved', 'dispatched', 'settled', 'released')
  ),
  constraint cortex_asst_provider_attempts_cost_bounds check (
    reserved_cost_micros between 1 and 999999999999
    and (
      consumed_cost_micros is null
      or consumed_cost_micros between 0 and reserved_cost_micros
    )
  ),
  constraint cortex_asst_provider_attempts_outcome_valid check (
    outcome_code is null
    or outcome_code ~ '^[a-z0-9][a-z0-9:_-]{0,99}$'
  ),
  constraint cortex_asst_provider_attempts_state_payload check (
    (
      status = 'reserved'
      and consumed_cost_micros is null
      and outcome_code is null
      and dispatched_at is null
      and terminal_at is null
    )
    or (
      status = 'dispatched'
      and consumed_cost_micros is null
      and outcome_code is null
      and dispatched_at is not null
      and terminal_at is null
    )
    or (
      status = 'settled'
      and consumed_cost_micros is not null
      and outcome_code is not null
      and dispatched_at is not null
      and terminal_at is not null
    )
    or (
      status = 'released'
      and consumed_cost_micros = 0
      and outcome_code is not null
      and dispatched_at is null
      and terminal_at is not null
    )
  ),
  constraint cortex_asst_provider_attempts_timestamp_order check (
    updated_at >= created_at
    and (dispatched_at is null or dispatched_at >= created_at)
    and (terminal_at is null or terminal_at >= created_at)
    and (status <> 'settled' or terminal_at >= dispatched_at)
  )
);

create unique index ux_cortex_asst_provider_attempt_job_attempt
  on public.cortex_assistant_provider_attempts (
    tenant_id,
    job_id,
    attempt_number
  );
create index idx_cortex_asst_provider_attempt_daily
  on public.cortex_assistant_provider_attempts (
    tenant_id,
    policy_id,
    budget_date,
    status
  );

create function public.enforce_cortex_asst_provider_attempt_transition()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.policy_id is distinct from old.policy_id
    or new.job_id is distinct from old.job_id
    or new.attempt_number is distinct from old.attempt_number
    or new.request_hash is distinct from old.request_hash
    or new.reserved_cost_micros is distinct from old.reserved_cost_micros
    or new.budget_date is distinct from old.budget_date
    or new.created_at is distinct from old.created_at then
    raise exception 'provider attempt identity and reservation are immutable'
      using errcode = '23514';
  end if;

  if new.status = old.status then
    if to_jsonb(new) is distinct from to_jsonb(old) then
      raise exception 'same-state provider attempt mutation is forbidden'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if not (
    (old.status = 'reserved' and new.status in ('dispatched', 'released'))
    or (old.status = 'dispatched' and new.status = 'settled')
  ) then
    raise exception 'invalid provider attempt state transition'
      using errcode = '23514';
  end if;

  return new;
end
$$;

create trigger enforce_cortex_asst_provider_attempt_transition
before update on public.cortex_assistant_provider_attempts
for each row execute function
  public.enforce_cortex_asst_provider_attempt_transition();

revoke all on function public.enforce_cortex_asst_provider_attempt_transition()
  from public, anon, authenticated;
grant execute on function public.enforce_cortex_asst_provider_attempt_transition()
  to service_role;
revoke all on function public.enforce_cortex_asst_provider_policy_update()
  from public, anon, authenticated;
grant execute on function public.enforce_cortex_asst_provider_policy_update()
  to service_role;

alter table public.cortex_assistant_provider_policies enable row level security;
alter table public.cortex_assistant_provider_policies force row level security;
alter table public.cortex_assistant_provider_attempts enable row level security;
alter table public.cortex_assistant_provider_attempts force row level security;

revoke all privileges on table public.cortex_assistant_provider_policies
  from public, anon, authenticated;
revoke all privileges on table public.cortex_assistant_provider_attempts
  from public, anon, authenticated;
grant all privileges on table public.cortex_assistant_provider_policies
  to service_role;
grant all privileges on table public.cortex_assistant_provider_attempts
  to service_role;

commit;
