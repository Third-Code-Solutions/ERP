-- Provider health policy and query support. No policy or provider activation.

begin;

alter table public.cortex_assistant_provider_policies
  add column circuit_failure_threshold smallint not null default 3,
  add column circuit_failure_window_seconds integer not null default 300,
  add column circuit_cooldown_seconds integer not null default 900,
  add constraint cortex_asst_provider_policies_circuit_bounds check (
    circuit_failure_threshold between 1 and 20
    and circuit_failure_window_seconds between 60 and 86400
    and circuit_cooldown_seconds between 60 and 86400
  );

create index idx_cortex_asst_provider_attempt_terminal
  on public.cortex_assistant_provider_attempts (
    tenant_id,
    policy_id,
    terminal_at,
    id
  )
  where status = 'settled';

commit;
