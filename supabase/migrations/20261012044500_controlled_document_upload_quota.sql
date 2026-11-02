begin;

alter table public.document_upload_reservations
  add column core_controlled boolean not null default false,
  add column upload_sha256 char(64),
  add column upload_started_at timestamptz,
  add column upload_settled_at timestamptz,
  add constraint document_upload_transport_evidence check (
    (upload_sha256 is null and upload_started_at is null and upload_settled_at is null)
    or (upload_sha256 is not null and upload_started_at is not null
      and upload_sha256 ~ '^[0-9a-f]{64}$' and upload_started_at >= created_at
      and (upload_settled_at is null or upload_settled_at >= upload_started_at))
  );

-- Pending, expired and released capacity is charged until Storage cleanup is
-- positively confirmed. Expiry alone never makes uncertain bytes disappear.
create function public.guard_document_upload_quota() returns trigger
language plpgsql set search_path = '' as $$
declare used_bytes bigint; pending_bytes bigint; requested_bytes bigint;
begin
  if tg_table_name = 'document_upload_reservations' then
    requested_bytes := new.declared_size_bytes;
    if tg_op = 'UPDATE' then
      if new.core_controlled is distinct from old.core_controlled then
        raise exception using errcode = '23514', message = 'upload transport authority is immutable';
      end if;
      if old.upload_sha256 is not null and new.upload_sha256 is distinct from old.upload_sha256 then
        raise exception using errcode = '23514', message = 'upload content identity is immutable';
      end if;
      return new;
    end if;
  elsif new.project_id is null then
    return new;
  elsif tg_op = 'UPDATE' and new.project_id is not distinct from old.project_id
    and new.size_bytes = old.size_bytes and new.tenant_id = old.tenant_id then
    return new;
  end if;
  if tg_table_name = 'documents' then requested_bytes := new.size_bytes; end if;
  perform 1 from public.projects where id = new.project_id and tenant_id = new.tenant_id for update;
  select coalesce(sum(size_bytes), 0) into used_bytes from public.documents
    where tenant_id = new.tenant_id and project_id = new.project_id
      and (tg_table_name <> 'documents' or id <> new.id);
  select coalesce(sum(declared_size_bytes), 0) into pending_bytes from public.document_upload_reservations
    where tenant_id = new.tenant_id and project_id = new.project_id
      and (state <> 'completed' or document_id is null) and cleanup_completed_at is null
      and (tg_table_name <> 'documents' or storage_path <> new.storage_path);
  if used_bytes + pending_bytes + requested_bytes > 524288000 then
    raise exception using errcode = '23514', message = 'Project storage quota exceeded';
  end if;
  return new;
end $$;
revoke all on function public.guard_document_upload_quota() from public, anon, authenticated;
create trigger document_upload_quota_guard before insert or update on public.document_upload_reservations
  for each row execute function public.guard_document_upload_quota();
create trigger document_project_quota_guard before insert or update on public.documents
  for each row execute function public.guard_document_upload_quota();

-- Preserve existing signed-read access. A future permissive policy must not
-- accidentally reopen JWT writes around Core's reservation authority.
revoke insert, update on public.documents from public, anon, authenticated;
create policy documents_core_insert_only on public.documents as restrictive for insert to anon, authenticated
  with check (false);
create policy documents_core_update_only on public.documents as restrictive for update to anon, authenticated
  using (false) with check (false);
create policy documents_core_insert_only on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'documents');
create policy documents_core_update_only on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'documents') with check (bucket_id <> 'documents');
create policy documents_core_delete_only on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'documents');
commit;

-- Recovery: roll forward. Do not restore direct signed uploads. Existing data
-- is untouched; removing these guards requires a reviewed replacement quota.
