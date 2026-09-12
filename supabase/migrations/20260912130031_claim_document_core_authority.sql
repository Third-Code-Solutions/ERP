-- Claim attachment mutations are Core-owned. Keep tenant-scoped SELECT and
-- existing rows, foreign keys, audit triggers and trusted server grants intact.
-- Parent-table cascade permissions are a separate authority boundary.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.progress_claim_documents enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on table public.progress_claim_documents from public, anon, authenticated;

-- Table-level REVOKE does not remove independently granted column privileges.
do $$
declare
  columns_sql text;
begin
  select string_agg(format('%I', attname), ', ' order by attnum)
    into columns_sql
    from pg_attribute
   where attrelid = 'public.progress_claim_documents'::regclass
     and attnum > 0 and not attisdropped;
  execute format(
    'revoke insert (%1$s), update (%1$s), references (%1$s) on table public.progress_claim_documents from public, anon, authenticated',
    columns_sql
  );
end
$$;

drop policy if exists progress_claim_documents_tenant_insert on public.progress_claim_documents;
drop policy if exists progress_claim_documents_tenant_update on public.progress_claim_documents;
drop policy if exists progress_claim_documents_tenant_delete on public.progress_claim_documents;

-- Restrictive policies remain a backstop against a later accidental regrant.
-- Do not use FOR ALL: existing authenticated SELECT must remain unchanged.
drop policy if exists progress_claim_documents_deny_client_insert on public.progress_claim_documents;
create policy progress_claim_documents_deny_client_insert
  on public.progress_claim_documents as restrictive
  for insert to anon, authenticated with check (false);

drop policy if exists progress_claim_documents_deny_client_update on public.progress_claim_documents;
create policy progress_claim_documents_deny_client_update
  on public.progress_claim_documents as restrictive
  for update to anon, authenticated using (false) with check (false);

drop policy if exists progress_claim_documents_deny_client_delete on public.progress_claim_documents;
create policy progress_claim_documents_deny_client_delete
  on public.progress_claim_documents as restrictive
  for delete to anon, authenticated using (false);

-- Supports the Core document-retention lookup without deduplicating evidence.
create index if not exists idx_progress_claim_docs_tenant_document
  on public.progress_claim_documents (tenant_id, document_id);

commit;

-- Recovery: keep this boundary when reverting application code; roll forward
-- or temporarily disable attachment writes. Do not restore unsafe client DML.
-- No row/schema/FK rollback is required, and the supporting index may remain.
