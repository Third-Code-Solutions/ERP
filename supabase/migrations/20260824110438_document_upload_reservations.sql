begin;

create type public.document_upload_reservation_state as enum (
  'active',
  'completed',
  'released',
  'expired'
);

create unique index ux_documents_tenant_project_id
  on public.documents (tenant_id, project_id, id);

create table public.document_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null
    references public.tenants (id) on delete cascade,
  project_id uuid not null,
  actor_id uuid not null,
  storage_path text not null,
  original_file_name varchar(255) not null,
  description varchar(2000),
  declared_size_bytes bigint not null,
  declared_content_type varchar(127) not null,
  idempotency_key varchar(256) not null,
  request_hash char(64) not null,
  state public.document_upload_reservation_state not null default 'active',
  expires_at timestamptz not null default (now() + interval '2 hours'),
  document_id uuid,
  terminal_at timestamptz,
  cleanup_attempt_count integer not null default 0,
  cleanup_claimed_at timestamptz,
  cleanup_completed_at timestamptz,
  cleanup_last_error_code varchar(64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_upload_reservations_project_tenant_fk
    foreign key (tenant_id, project_id)
    references public.projects (tenant_id, id)
    on delete restrict,
  constraint document_upload_reservations_actor_tenant_fk
    foreign key (tenant_id, actor_id)
    references public.users (tenant_id, id)
    on delete restrict,
  constraint document_upload_reservations_document_tenant_fk
    foreign key (tenant_id, project_id, document_id)
    references public.documents (tenant_id, project_id, id)
    on delete set null (document_id),
  constraint document_upload_reservations_storage_path_format check (
    storage_path = btrim(storage_path)
    and length(storage_path) between 1 and 2000
    and left(
      storage_path,
      length(concat(tenant_id::text, '/', project_id::text, '/', id::text, '-'))
    ) = concat(tenant_id::text, '/', project_id::text, '/', id::text, '-')
    and length(storage_path)
      > length(concat(tenant_id::text, '/', project_id::text, '/', id::text, '-'))
    and position('/' in substring(
      storage_path
      from length(concat(tenant_id::text, '/', project_id::text, '/', id::text, '-')) + 1
    )) = 0
    and position(chr(92) in storage_path) = 0
    and position('..' in storage_path) = 0
  ),
  constraint document_upload_reservations_original_file_name_nonempty check (
    original_file_name = btrim(original_file_name)
    and length(original_file_name) between 1 and 255
  ),
  constraint document_upload_reservations_description_bounded check (
    description is null
    or (
      description = btrim(description)
      and length(description) between 1 and 2000
    )
  ),
  constraint document_upload_reservations_declared_size_limit check (
    declared_size_bytes between 1 and 104857600
  ),
  constraint document_upload_reservations_declared_content_type_normalized check (
    declared_content_type = lower(btrim(declared_content_type))
    and declared_content_type
      ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'
  ),
  constraint document_upload_reservations_key_nonempty check (
    idempotency_key = btrim(idempotency_key)
    and length(idempotency_key) between 1 and 256
  ),
  constraint document_upload_reservations_request_hash_hex check (
    request_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint document_upload_reservations_expiry_window check (
    expires_at = created_at + interval '2 hours'
  ),
  constraint document_upload_reservations_timestamp_order check (
    updated_at >= created_at
    and (
      terminal_at is null
      or (terminal_at >= created_at and updated_at >= terminal_at)
    )
    and (
      cleanup_claimed_at is null
      or (
        terminal_at is not null
        and cleanup_claimed_at >= terminal_at
        and updated_at >= cleanup_claimed_at
      )
    )
    and (
      cleanup_completed_at is null
      or (
        cleanup_claimed_at is not null
        and cleanup_completed_at >= cleanup_claimed_at
        and updated_at >= cleanup_completed_at
      )
    )
  ),
  constraint document_upload_reservations_state_payload check (
    (
      state = 'active'
      and document_id is null
      and terminal_at is null
    )
    or
    (
      state = 'completed'
      and terminal_at is not null
      and terminal_at < expires_at
    )
    or
    (
      state = 'released'
      and document_id is null
      and terminal_at is not null
      and terminal_at < expires_at
    )
    or
    (
      state = 'expired'
      and document_id is null
      and terminal_at is not null
      and terminal_at >= expires_at
    )
  ),
  constraint document_upload_reservations_cleanup_evidence check (
    cleanup_attempt_count >= 0
    and (
      cleanup_last_error_code is null
      or (
        cleanup_last_error_code = btrim(cleanup_last_error_code)
        and length(cleanup_last_error_code) between 1 and 64
        and cleanup_last_error_code ~ '^[A-Z0-9_]+$'
      )
    )
    and (
      (
        cleanup_attempt_count = 0
        and cleanup_claimed_at is null
        and cleanup_completed_at is null
        and cleanup_last_error_code is null
      )
      or
      (
        cleanup_attempt_count > 0
        and state in ('released', 'expired')
        and cleanup_claimed_at is not null
        and (
          cleanup_completed_at is null
          or cleanup_last_error_code is null
        )
      )
    )
  )
);

create unique index ux_document_upload_reservations_tenant_id_id
  on public.document_upload_reservations (tenant_id, id);
create unique index ux_document_upload_reservations_storage_path
  on public.document_upload_reservations (storage_path);
create unique index ux_document_upload_reservations_tenant_actor_key
  on public.document_upload_reservations (
    tenant_id,
    actor_id,
    idempotency_key
  );
create unique index ux_document_upload_reservations_completed_document
  on public.document_upload_reservations (tenant_id, project_id, document_id)
  where document_id is not null;
create index idx_document_upload_reservations_project
  on public.document_upload_reservations (tenant_id, project_id);
create index idx_document_upload_reservations_active_project
  on public.document_upload_reservations (tenant_id, project_id, expires_at)
  where state = 'active';
create index idx_document_upload_reservations_due_active
  on public.document_upload_reservations (expires_at, id)
  where state = 'active';
create index idx_document_upload_reservations_terminal_cleanup
  on public.document_upload_reservations (state, terminal_at, id)
  where state in ('released', 'expired')
    and cleanup_completed_at is null;

create function public.guard_document_upload_reservation_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state <> 'active'
    or new.document_id is not null
    or new.terminal_at is not null
    or new.cleanup_attempt_count <> 0
    or new.cleanup_claimed_at is not null
    or new.cleanup_completed_at is not null
    or new.cleanup_last_error_code is not null
  then
    raise exception using
      errcode = '23514',
      message = 'document upload reservations must be created active';
  end if;

  return new;
end
$$;

create function public.guard_document_upload_reservation_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.project_id is distinct from old.project_id
    or new.actor_id is distinct from old.actor_id
    or new.storage_path is distinct from old.storage_path
    or new.original_file_name is distinct from old.original_file_name
    or new.description is distinct from old.description
    or new.declared_size_bytes is distinct from old.declared_size_bytes
    or new.declared_content_type is distinct from old.declared_content_type
    or new.idempotency_key is distinct from old.idempotency_key
    or new.request_hash is distinct from old.request_hash
    or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '23514',
      message = 'document upload reservation authority fields are immutable';
  end if;

  if old.state <> 'active' then
    if new.state is distinct from old.state
      or new.terminal_at is distinct from old.terminal_at
      or (
        new.document_id is distinct from old.document_id
        and not (
          old.state = 'completed'
          and old.document_id is not null
          and new.document_id is null
        )
      )
    then
      raise exception using
        errcode = '23514',
      message = 'terminal document upload reservations are immutable';
    end if;
  elsif new.state = 'completed' and new.document_id is null then
    raise exception using
      errcode = '23514',
      message = 'completed document upload reservations require a document';
  elsif new.state not in ('active', 'completed', 'released', 'expired') then
    raise exception using
      errcode = '23514',
      message = 'invalid document upload reservation transition';
  end if;

  if new.cleanup_attempt_count < old.cleanup_attempt_count then
    raise exception using
      errcode = '23514',
      message = 'cleanup attempt count cannot decrease';
  end if;

  if old.cleanup_claimed_at is not null
    and (
      new.cleanup_claimed_at is null
      or new.cleanup_claimed_at < old.cleanup_claimed_at
    )
  then
    raise exception using
      errcode = '23514',
      message = 'cleanup claim cannot be cleared or moved backwards';
  end if;

  if old.cleanup_completed_at is not null
    and (
      new.cleanup_attempt_count is distinct from old.cleanup_attempt_count
      or new.cleanup_claimed_at is distinct from old.cleanup_claimed_at
      or new.cleanup_completed_at is distinct from old.cleanup_completed_at
      or new.cleanup_last_error_code is distinct from old.cleanup_last_error_code
    )
  then
    raise exception using
      errcode = '23514',
      message = 'completed cleanup evidence is immutable';
  end if;

  if new.updated_at < old.updated_at then
    raise exception using
      errcode = '23514',
      message = 'document upload reservation updated_at cannot move backwards';
  end if;

  return new;
end
$$;

revoke all on function public.guard_document_upload_reservation_update()
  from public, anon, authenticated;
revoke all on function public.guard_document_upload_reservation_insert()
  from public, anon, authenticated;

create trigger guard_document_upload_reservation_insert
before insert on public.document_upload_reservations
for each row execute function public.guard_document_upload_reservation_insert();

create trigger guard_document_upload_reservation_update
before update on public.document_upload_reservations
for each row execute function public.guard_document_upload_reservation_update();

alter table public.document_upload_reservations enable row level security;
alter table public.document_upload_reservations force row level security;

revoke all privileges on table public.document_upload_reservations
  from public, anon, authenticated;
grant select, insert, update on table public.document_upload_reservations
  to service_role;

create policy deny_direct_client_access
on public.document_upload_reservations
for all to anon, authenticated
using (false)
with check (false);

commit;
