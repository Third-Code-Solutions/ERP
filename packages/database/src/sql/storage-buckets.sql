-- =============================================================================
-- ABI OPS Storage Buckets
-- Idempotent — safe to re-run.
-- Run via: psql / supabase db execute / Supabase SQL editor.
-- =============================================================================

-- Documents are server-mediated only. Browser sessions receive a signed upload
-- or download URL from the application; they must never receive Storage RLS
-- permissions directly. Keep this bootstrap in lock-step with
-- scripts/verify-hosted-documents-storage.mjs.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'documents',
  'documents',
  false,
  104857600,
  ARRAY[
    'application/acad',
    'application/dxf',
    'application/json',
    'application/msword',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/bmp',
    'image/gif',
    'image/heic',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'image/webp',
    'text/csv',
    'text/html',
    'text/plain'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Remove every legacy direct-browser policy for the documents bucket. A
-- separate reviewed migration is required to introduce any replacement.

DROP POLICY IF EXISTS "documents_tenant_select" ON storage.objects;
DROP POLICY IF EXISTS "documents_tenant_insert" ON storage.objects;
DROP POLICY IF EXISTS "documents_tenant_update" ON storage.objects;
DROP POLICY IF EXISTS "documents_tenant_delete" ON storage.objects;
