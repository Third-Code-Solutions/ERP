-- =============================================================================
-- ABI OPS Storage Buckets
-- Idempotent — safe to re-run.
-- Run via: psql / supabase db execute / Supabase SQL editor.
-- =============================================================================

-- documents bucket (private, RLS-on, signed URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: tenant_id is encoded as the first path segment in the storage key.
-- See apps/web/src/app/api/upload/route.ts where we write
--   `${tenant_id}/${project_id}/${uuid}-${file_name}`.
-- These policies enforce that authenticated users only access their tenant's path.

DROP POLICY IF EXISTS "documents_tenant_select" ON storage.objects;
CREATE POLICY "documents_tenant_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "documents_tenant_insert" ON storage.objects;
CREATE POLICY "documents_tenant_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "documents_tenant_update" ON storage.objects;
CREATE POLICY "documents_tenant_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "documents_tenant_delete" ON storage.objects;
CREATE POLICY "documents_tenant_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );
