-- Third Code ERP Agent memory: persisted Cortex conversations (tenant-scoped). Additive.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'cortex_message_role') then
    create type cortex_message_role as enum ('user','assistant','system');
  end if;
end $$;

create table if not exists cortex_conversations (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  title      varchar(255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cortex_conversations_tenant_user
  on cortex_conversations(tenant_id, user_id, updated_at);

create table if not exists cortex_messages (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references cortex_conversations(id) on delete cascade,
  role            cortex_message_role not null,
  content         text not null,
  citations       jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_cortex_messages_conversation on cortex_messages(conversation_id, created_at);
create index if not exists idx_cortex_messages_tenant on cortex_messages(tenant_id);

alter table cortex_conversations enable row level security;
alter table cortex_messages      enable row level security;

drop policy if exists cortex_conversations_tenant_read   on cortex_conversations;
drop policy if exists cortex_conversations_tenant_write  on cortex_conversations;
drop policy if exists cortex_conversations_tenant_update on cortex_conversations;
create policy cortex_conversations_tenant_read   on cortex_conversations for select using (tenant_id = auth_tenant_id());
create policy cortex_conversations_tenant_write  on cortex_conversations for insert with check (tenant_id = auth_tenant_id());
create policy cortex_conversations_tenant_update on cortex_conversations for update using (tenant_id = auth_tenant_id()) with check (tenant_id = auth_tenant_id());

drop policy if exists cortex_messages_tenant_read  on cortex_messages;
drop policy if exists cortex_messages_tenant_write on cortex_messages;
create policy cortex_messages_tenant_read  on cortex_messages for select using (tenant_id = auth_tenant_id());
create policy cortex_messages_tenant_write on cortex_messages for insert with check (tenant_id = auth_tenant_id());;
