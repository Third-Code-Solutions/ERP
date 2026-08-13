-- Versioned, provider-neutral request/response authority for provider attempts.
-- Rolling-compatible: attempts created before this migration retain null protocol data.

begin;

alter table public.cortex_assistant_provider_attempts
  add column protocol_version smallint,
  add column dispatch_key char(64),
  add column request_fingerprint char(64),
  add column provider_request_id_hash char(64),
  add column response_fingerprint char(64);

alter table public.cortex_assistant_provider_attempts
  add constraint cortex_asst_provider_attempts_protocol_version check (
    protocol_version is null or protocol_version = 1
  ),
  add constraint cortex_asst_provider_attempts_protocol_hashes_hex check (
    (dispatch_key is null or dispatch_key ~ '^[0-9a-f]{64}$')
    and (
      request_fingerprint is null
      or request_fingerprint ~ '^[0-9a-f]{64}$'
    )
    and (
      provider_request_id_hash is null
      or provider_request_id_hash ~ '^[0-9a-f]{64}$'
    )
    and (
      response_fingerprint is null
      or response_fingerprint ~ '^[0-9a-f]{64}$'
    )
  );

alter table public.cortex_assistant_provider_attempts
  drop constraint cortex_asst_provider_attempts_state_payload;
alter table public.cortex_assistant_provider_attempts
  add constraint cortex_asst_provider_attempts_state_payload check (
    (
      status = 'reserved'
      and consumed_cost_micros is null
      and outcome_code is null
      and protocol_version is null
      and dispatch_key is null
      and request_fingerprint is null
      and provider_request_id_hash is null
      and response_fingerprint is null
      and dispatched_at is null
      and terminal_at is null
    )
    or (
      status = 'dispatched'
      and consumed_cost_micros is null
      and outcome_code is null
      and (
        (
          protocol_version is null
          and dispatch_key is null
          and request_fingerprint is null
        )
        or (
          protocol_version = 1
          and dispatch_key is not null
          and request_fingerprint is not null
        )
      )
      and provider_request_id_hash is null
      and response_fingerprint is null
      and dispatched_at is not null
      and terminal_at is null
    )
    or (
      status = 'settled'
      and consumed_cost_micros is not null
      and outcome_code is not null
      and (
        (
          protocol_version is null
          and dispatch_key is null
          and request_fingerprint is null
          and provider_request_id_hash is null
          and response_fingerprint is null
        )
        or (
          protocol_version = 1
          and dispatch_key is not null
          and request_fingerprint is not null
          and (
            (
              outcome_code = 'provider_succeeded'
              and provider_request_id_hash is not null
              and response_fingerprint is not null
            )
            or (
              outcome_code <> 'provider_succeeded'
              and provider_request_id_hash is null
              and response_fingerprint is null
            )
          )
        )
      )
      and dispatched_at is not null
      and terminal_at is not null
    )
    or (
      status = 'released'
      and consumed_cost_micros = 0
      and outcome_code is not null
      and protocol_version is null
      and dispatch_key is null
      and request_fingerprint is null
      and provider_request_id_hash is null
      and response_fingerprint is null
      and dispatched_at is null
      and terminal_at is not null
    )
  );

create or replace function public.enforce_cortex_asst_provider_attempt_transition()
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

  if old.status = 'dispatched'
    and (
      new.protocol_version is distinct from old.protocol_version
      or new.dispatch_key is distinct from old.dispatch_key
      or new.request_fingerprint is distinct from old.request_fingerprint
    ) then
    raise exception 'provider dispatch authority is immutable'
      using errcode = '23514';
  end if;

  return new;
end
$$;

create or replace function public.enforce_cortex_asst_provider_completion_link()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  validate_link boolean := false;
begin
  if tg_op = 'UPDATE' then
    if old.provider_attempt_id is not null
      and (
        new.id is distinct from old.id
        or new.tenant_id is distinct from old.tenant_id
        or new.provider_attempt_id is distinct from old.provider_attempt_id
        or new.assistant_message_id is distinct from old.assistant_message_id
        or new.completion_hash is distinct from old.completion_hash
        or new.outcome is distinct from old.outcome
        or new.model is distinct from old.model
      ) then
      raise exception 'provider completion authority is immutable'
        using errcode = '23514';
    end if;
  end if;

  if new.provider_attempt_id is not null then
    if tg_op = 'INSERT' then
      validate_link := true;
    elsif new.provider_attempt_id is distinct from old.provider_attempt_id then
      validate_link := true;
    end if;
  end if;

  if validate_link and not exists (
      select 1
      from public.cortex_assistant_provider_attempts attempt
      inner join public.cortex_assistant_provider_policies policy
        on policy.id = attempt.policy_id
        and policy.tenant_id = attempt.tenant_id
      inner join public.cortex_assistant_generation_jobs job
        on job.id = attempt.job_id
        and job.tenant_id = attempt.tenant_id
      where attempt.id = new.provider_attempt_id
        and attempt.tenant_id = new.tenant_id
        and attempt.status = 'settled'
        and attempt.outcome_code = 'provider_succeeded'
        and attempt.consumed_cost_micros is not null
        and attempt.consumed_cost_micros <= attempt.reserved_cost_micros
        and (
          attempt.protocol_version is null
          or (
            attempt.protocol_version = 1
            and attempt.response_fingerprint = new.completion_hash
          )
        )
        and job.request_id = new.id
        and job.status = 'processing'
        and job.attempt_count = attempt.attempt_number
        and policy.model = new.model
    ) then
    raise exception 'provider completion attempt is not settled current authority'
      using errcode = '23514';
  end if;

  return new;
end
$$;

revoke all on function public.enforce_cortex_asst_provider_attempt_transition()
  from public, anon, authenticated;
grant execute on function public.enforce_cortex_asst_provider_attempt_transition()
  to service_role;
revoke all on function public.enforce_cortex_asst_provider_completion_link()
  from public, anon, authenticated;
grant execute on function public.enforce_cortex_asst_provider_completion_link()
  to service_role;

commit;
