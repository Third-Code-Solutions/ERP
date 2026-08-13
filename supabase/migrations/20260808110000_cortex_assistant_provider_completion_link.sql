-- Immutable authority link from an official assistant completion to one
-- settled provider attempt. No policy, credential, or provider activation.

begin;

create unique index ux_cortex_asst_provider_attempt_tenant_id
  on public.cortex_assistant_provider_attempts (tenant_id, id);

alter table public.cortex_assistant_turn_requests
  add column provider_attempt_id uuid;

alter table public.cortex_assistant_turn_requests
  add constraint cortex_asst_turn_requests_tenant_provider_attempt_fk
  foreign key (tenant_id, provider_attempt_id)
  references public.cortex_assistant_provider_attempts(tenant_id, id)
  on delete restrict;

create unique index ux_cortex_asst_turn_requests_provider_attempt
  on public.cortex_assistant_turn_requests (tenant_id, provider_attempt_id);

alter table public.cortex_assistant_turn_requests
  drop constraint cortex_assistant_turn_requests_outcome_valid;
alter table public.cortex_assistant_turn_requests
  add constraint cortex_assistant_turn_requests_outcome_valid check (
    outcome is null or outcome in (
      'model',
      'model_stream_failed_partial',
      'model_failed_grounded_fallback',
      'deterministic_grounded',
      'provider_grounded'
    )
  );

alter table public.cortex_assistant_turn_requests
  drop constraint cortex_assistant_turn_requests_state_payload;
alter table public.cortex_assistant_turn_requests
  add constraint cortex_assistant_turn_requests_state_payload check (
    (
      state = 'processing'
      and completion_hash is null
      and claim_token_hash is not null
      and lease_expires_at is not null
      and assistant_message_id is null
      and provider_attempt_id is null
      and outcome is null
      and model is null
      and result is null
      and completed_at is null
    )
    or
    (
      state = 'succeeded'
      and completion_hash is not null
      and claim_token_hash is null
      and lease_expires_at is null
      and assistant_message_id is not null
      and (
        (outcome = 'provider_grounded' and provider_attempt_id is not null)
        or
        (outcome <> 'provider_grounded' and provider_attempt_id is null)
      )
      and outcome is not null
      and model is not null
      and result is not null
      and completed_at is not null
    )
  );

create function public.enforce_cortex_asst_provider_completion_link()
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

create trigger enforce_cortex_asst_provider_completion_link
before insert or update on public.cortex_assistant_turn_requests
for each row execute function
  public.enforce_cortex_asst_provider_completion_link();

revoke all on function public.enforce_cortex_asst_provider_completion_link()
  from public, anon, authenticated;
grant execute on function public.enforce_cortex_asst_provider_completion_link()
  to service_role;

commit;
