-- Third Code ERP bank-statement object-storage source reference.
-- Inline CSV remains compatible; Core storage reads are feature-flagged off.

alter table public.bank_statements
  add column if not exists source_storage_path text;

alter table public.bank_statements
  drop constraint if exists bank_statements_source_storage_path_format;

alter table public.bank_statements
  add constraint bank_statements_source_storage_path_format
  check (
    source_storage_path is null
    or (
      source_storage_path = btrim(source_storage_path)
      and length(source_storage_path) between 1 and 2000
      and source_storage_path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/bank-statements/[^/]+$'
    )
  );
