-- Browser clients receive only server-issued signed upload/download tokens.
-- They must not list, insert, update, or delete documents through Storage with
-- their authenticated session JWT.

begin;

drop policy if exists "documents_tenant_select" on storage.objects;
drop policy if exists "documents_tenant_insert" on storage.objects;
drop policy if exists "documents_tenant_update" on storage.objects;
drop policy if exists "documents_tenant_delete" on storage.objects;

commit;

-- Rollback requires a separate reviewed policy migration. Do not restore the
-- legacy path-prefix policies ad hoc: signed URLs remain the browser boundary.
