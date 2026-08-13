-- Cost-bounded, service-authorized Cortex assistant generation and memory.

begin;

do $$
begin
  create type public.cortex_assistant_turn_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.cortex_assistant_turn_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  user_id uuid not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  completion_hash char(64),
  state public.cortex_assistant_turn_request_state not null
    default 'processing',
  conversation_id uuid not null,
  user_message_id uuid not null,
  claim_token_hash char(64),
  lease_expires_at timestamptz,
  assistant_message_id uuid,
  outcome varchar(64),
  model varchar(100),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint cortex_assistant_turn_requests_tenant_user_fk
    foreign key (tenant_id, user_id)
    references public.users(tenant_id, id) on delete cascade,
  constraint cortex_assistant_turn_requests_tenant_conversation_fk
    foreign key (tenant_id, conversation_id)
    references public.cortex_conversations(tenant_id, id) on delete cascade,
  constraint cortex_assistant_turn_requests_tenant_user_message_fk
    foreign key (tenant_id, user_message_id)
    references public.cortex_messages(tenant_id, id) on delete cascade,
  constraint cortex_assistant_turn_requests_tenant_assistant_message_fk
    foreign key (tenant_id, assistant_message_id)
    references public.cortex_messages(tenant_id, id) on delete cascade,
  constraint cortex_assistant_turn_requests_key_nonempty check (
    idempotency_key = btrim(idempotency_key)
    and length(idempotency_key) between 1 and 256
  ),
  constraint cortex_assistant_turn_requests_request_hash_hex check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint cortex_assistant_turn_requests_completion_hash_hex check (
    completion_hash is null
    or completion_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint cortex_assistant_turn_requests_claim_hash_hex check (
    claim_token_hash is null
    or claim_token_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint cortex_assistant_turn_requests_result_object check (
    result is null or jsonb_typeof(result) = 'object'
  ),
  constraint cortex_assistant_turn_requests_outcome_valid check (
    outcome is null or outcome in (
      'model',
      'model_stream_failed_partial',
      'model_failed_grounded_fallback',
      'deterministic_grounded'
    )
  ),
  constraint cortex_assistant_turn_requests_model_nonempty check (
    model is null or (
      model = btrim(model)
      and length(model) between 1 and 100
    )
  ),
  constraint cortex_assistant_turn_requests_state_payload check (
    (
      state = 'processing'
      and completion_hash is null
      and claim_token_hash is not null
      and lease_expires_at is not null
      and assistant_message_id is null
      and outcome is null
      and model is null
      and result is null
      and completed_at is null
    )
    or (
      state = 'succeeded'
      and completion_hash is not null
      and claim_token_hash is null
      and lease_expires_at is null
      and assistant_message_id is not null
      and outcome is not null
      and model is not null
      and result is not null
      and completed_at is not null
    )
  ),
  constraint cortex_assistant_turn_requests_lease_after_created check (
    lease_expires_at is null or lease_expires_at > created_at
  ),
  constraint cortex_assistant_turn_requests_completed_after_created check (
    completed_at is null or completed_at >= created_at
  )
);

create unique index if not exists
  ux_cortex_assistant_turn_requests_tenant_user_key
  on public.cortex_assistant_turn_requests (
    tenant_id,
    user_id,
    idempotency_key
  );
create unique index if not exists
  ux_cortex_assistant_turn_requests_tenant_user_message
  on public.cortex_assistant_turn_requests (tenant_id, user_message_id);
create index if not exists
  idx_cortex_assistant_turn_requests_tenant_conversation
  on public.cortex_assistant_turn_requests (
    tenant_id,
    conversation_id,
    created_at
  );
create index if not exists
  idx_cortex_assistant_turn_requests_tenant_assistant_message
  on public.cortex_assistant_turn_requests (tenant_id, assistant_message_id);

alter table public.cortex_assistant_turn_requests enable row level security;
alter table public.cortex_assistant_turn_requests force row level security;
revoke all privileges on table public.cortex_assistant_turn_requests
  from public, anon, authenticated;
grant all privileges on table public.cortex_assistant_turn_requests
  to service_role;

commit;
