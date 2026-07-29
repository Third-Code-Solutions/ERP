-- Durable, permission-revalidated Cortex record context.
-- Conversation/message mutation is server-only; authenticated clients retain
-- owner-scoped read access through existing RLS policies.

alter table public.cortex_conversations
  add column if not exists context_ref_table varchar(100),
  add column if not exists context_ref_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'cortex_conversations_context_pair_check'
      and conrelid = 'public.cortex_conversations'::regclass
  ) then
    alter table public.cortex_conversations
      add constraint cortex_conversations_context_pair_check
      check (
        (context_ref_table is null and context_ref_id is null)
        or
        (context_ref_table is not null and context_ref_id is not null)
      )
      not valid;
  end if;
end
$$;

alter table public.cortex_conversations
  validate constraint cortex_conversations_context_pair_check;

drop policy if exists cortex_conversations_owner_insert
  on public.cortex_conversations;
drop policy if exists cortex_conversations_owner_update
  on public.cortex_conversations;
drop policy if exists cortex_messages_parent_owner_insert
  on public.cortex_messages;

revoke insert, update, delete
  on table public.cortex_conversations
  from authenticated;
revoke insert (tenant_id, user_id, title)
  on table public.cortex_conversations
  from authenticated;
revoke update (title, updated_at)
  on table public.cortex_conversations
  from authenticated;

revoke insert, update, delete
  on table public.cortex_messages
  from authenticated;
revoke insert (tenant_id, conversation_id, role, content, citations)
  on table public.cortex_messages
  from authenticated;

grant select on table public.cortex_conversations, public.cortex_messages to authenticated;
grant all privileges on table public.cortex_conversations, public.cortex_messages to service_role;
