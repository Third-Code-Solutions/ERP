-- Durable, server-authorized Cortex user-turn persistence.

begin;

do $$
begin
  create type public.cortex_conversation_turn_request_state as enum (
    'processing',
    'succeeded'
  );
exception
  when duplicate_object then null;
end
$$;

create unique index if not exists ux_cortex_conversations_tenant_id_id
  on public.cortex_conversations (tenant_id, id);
create unique index if not exists ux_cortex_messages_tenant_id_id
  on public.cortex_messages (tenant_id, id);

create table if not exists public.cortex_conversation_turn_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants(id) on delete cascade,
  user_id uuid not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.cortex_conversation_turn_request_state not null
    default 'processing',
  conversation_id uuid,
  message_id uuid,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint cortex_conversation_turn_requests_tenant_user_fk
    foreign key (tenant_id, user_id)
    references public.users(tenant_id, id) on delete cascade,
  constraint cortex_conversation_turn_requests_tenant_conversation_fk
    foreign key (tenant_id, conversation_id)
    references public.cortex_conversations(tenant_id, id) on delete cascade,
  constraint cortex_conversation_turn_requests_tenant_message_fk
    foreign key (tenant_id, message_id)
    references public.cortex_messages(tenant_id, id) on delete cascade,
  constraint cortex_conversation_turn_requests_key_nonempty check (
    idempotency_key = btrim(idempotency_key)
    and length(idempotency_key) between 1 and 256
  ),
  constraint cortex_conversation_turn_requests_hash_hex check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint cortex_conversation_turn_requests_result_object check (
    result is null or jsonb_typeof(result) = 'object'
  ),
  constraint cortex_conversation_turn_requests_state_payload check (
    (
      state = 'processing'
      and conversation_id is null
      and message_id is null
      and result is null
      and completed_at is null
    )
    or (
      state = 'succeeded'
      and conversation_id is not null
      and message_id is not null
      and result is not null
      and completed_at is not null
    )
  ),
  constraint cortex_conversation_turn_requests_completed_after_created check (
    completed_at is null or completed_at >= created_at
  )
);

create unique index if not exists
  ux_cortex_conversation_turn_requests_tenant_id_id
  on public.cortex_conversation_turn_requests (tenant_id, id);
create unique index if not exists
  ux_cortex_conversation_turn_requests_tenant_user_key
  on public.cortex_conversation_turn_requests (
    tenant_id,
    user_id,
    idempotency_key
  );
create index if not exists
  idx_cortex_conversation_turn_requests_tenant_conversation
  on public.cortex_conversation_turn_requests (
    tenant_id,
    conversation_id,
    created_at
  );

alter table public.cortex_conversation_turn_requests enable row level security;
alter table public.cortex_conversation_turn_requests force row level security;
revoke all privileges on table public.cortex_conversation_turn_requests
  from public, anon, authenticated;
grant all privileges on table public.cortex_conversation_turn_requests
  to service_role;

commit;
