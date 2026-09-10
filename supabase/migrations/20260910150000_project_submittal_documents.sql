-- CDE attachment links for project submittals. Binary objects stay in documents.

begin;

do $$ begin
  create type public.project_submittal_document_role as enum (
    'submission',
    'plan',
    'response'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.project_submittal_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null,
  submittal_id uuid not null,
  document_id uuid not null,
  role public.project_submittal_document_role not null,
  caption varchar(255) not null default '',
  linked_by uuid not null,
  client_request_id uuid not null,
  request_hash varchar(64) not null,
  created_at timestamptz not null default now(),
  constraint project_submittal_documents_caption_length check (length(caption) <= 255),
  constraint project_submittal_documents_request_hash_length check (length(request_hash) = 64),
  constraint project_submittal_documents_project_tenant_fk foreign key (tenant_id, project_id)
    references public.projects(tenant_id, id) on delete cascade,
  constraint project_submittal_documents_submittal_tenant_fk foreign key (tenant_id, submittal_id)
    references public.project_submittals(tenant_id, id) on delete cascade,
  constraint project_submittal_documents_document_tenant_fk foreign key (tenant_id, document_id)
    references public.documents(tenant_id, id) on delete cascade,
  constraint project_submittal_documents_linked_by_tenant_fk foreign key (tenant_id, linked_by)
    references public.users(tenant_id, id) on delete restrict
);

create unique index if not exists ux_project_submittal_documents_tenant_id_id
  on public.project_submittal_documents (tenant_id, id);
create unique index if not exists ux_project_submittal_documents_tenant_submittal_document_role
  on public.project_submittal_documents (tenant_id, submittal_id, document_id, role);
create unique index if not exists ux_project_submittal_documents_tenant_client_request
  on public.project_submittal_documents (tenant_id, client_request_id);
create index if not exists idx_project_submittal_documents_submittal
  on public.project_submittal_documents (tenant_id, project_id, submittal_id, created_at);
create index if not exists idx_project_submittal_documents_document
  on public.project_submittal_documents (tenant_id, project_id, document_id);

create or replace function public.assert_project_submittal_document_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  document_project_id uuid;
  submittal_project_id uuid;
  submittal_status text;
begin
  select d.project_id into document_project_id
    from public.documents d
   where d.tenant_id = new.tenant_id and d.id = new.document_id;
  if document_project_id is null or document_project_id <> new.project_id then
    raise exception 'Document is outside the project scope';
  end if;

  select s.project_id, s.status::text into submittal_project_id, submittal_status
    from public.project_submittals s
   where s.tenant_id = new.tenant_id and s.id = new.submittal_id;
  if submittal_project_id is null or submittal_project_id <> new.project_id then
    raise exception 'Submittal is outside the project scope';
  end if;
  if submittal_status = 'approved' then
    raise exception 'Approved project submittals are immutable';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_approved_project_submittal_document_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  submittal_status text;
begin
  select s.status::text into submittal_status
    from public.project_submittals s
   where s.tenant_id = old.tenant_id and s.id = old.submittal_id;
  if submittal_status = 'approved' then
    raise exception 'Approved project submittals are immutable';
  end if;
  return old;
end;
$$;

alter table public.project_submittal_documents enable row level security;
alter table public.project_submittal_documents force row level security;
revoke all privileges on table public.project_submittal_documents from public, anon, authenticated;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'project_submittal_documents'
       and policyname = 'project_submittal_documents_deny_direct_client_access'
  ) then
    create policy project_submittal_documents_deny_direct_client_access
      on public.project_submittal_documents
      for all to anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'assert_project_submittal_document_scope'
       and tgrelid = 'public.project_submittal_documents'::regclass
       and not tgisinternal
  ) then
    create trigger assert_project_submittal_document_scope
      before insert or update on public.project_submittal_documents
      for each row execute function public.assert_project_submittal_document_scope();
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'prevent_approved_project_submittal_document_mutation'
       and tgrelid = 'public.project_submittal_documents'::regclass
       and not tgisinternal
  ) then
    create trigger prevent_approved_project_submittal_document_mutation
      before delete on public.project_submittal_documents
      for each row execute function public.prevent_approved_project_submittal_document_mutation();
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'audit_project_submittal_documents'
       and tgrelid = 'public.project_submittal_documents'::regclass
       and not tgisinternal
  ) then
    create trigger audit_project_submittal_documents
      after insert or update or delete on public.project_submittal_documents
      for each row execute function public.audit_log_trigger();
  end if;
end $$;

commit;
