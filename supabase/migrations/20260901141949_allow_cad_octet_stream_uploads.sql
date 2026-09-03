-- CAD uploads are validated and processed as opaque binary evidence before
-- the worker classifies the file. Keep the documents bucket allowlist aligned
-- with that server-controlled intake path.
update storage.buckets
set allowed_mime_types = array(
  select distinct unnest(
    coalesce(allowed_mime_types, array[]::text[])
    || array['application/octet-stream']::text[]
  )
  order by 1
)
where id = 'documents';
