# Reconcile production migration history with source control

## Outcome

The repository now contains the seven migration versions already present in the
production Supabase ledger but missing from `main`. This is source reconciliation,
not a new database rollout: the protected workflow remains code-only and must
show zero pending SQL before deploying applications.

## Added migration sources

- `20260824110438_document_upload_reservations.sql`
- `20260824144430_document_opportunity_project_integrity.sql`
- `20260824152813_document_upload_reconciliation_indexes.sql`
- `20260825100000_sales_pipeline_prospect_name.sql`
- `20260825101000_docuseal_non_bom_submission_identity.sql`
- `20260825102000_documents_storage_server_only.sql`
- `20260901141949_allow_cad_octet_stream_uploads.sql`

The first six files are byte-identical Git objects from the database-owned
`agent-04/upload-reservations` branch. The seventh mirrors the SQL shown by the
authenticated Supabase migration-history view: it adds
`application/octet-stream` to the `documents` bucket MIME allowlist.

## Evidence and safety

- Production run `33768641038` passed release gates and exact-target validation,
  then failed closed at `157 applied / 150 repository`, `7 unexpected`, `0 missing`.
- The database preview and every Railway/Vercel deployment step were skipped.
- No migration history was edited and no SQL was run against production.
- CI must rebuild all 157 migrations from zero and pass database/schema/RLS gates
  before this reconciliation can merge.
- The dated managed-Supabase parity manifest and runbook now record the same
  authenticated 157/157 boundary and source head.

## Rollback

Revert this source-only commit before deployment if CI shows any incompatibility.
Do not delete or rewrite the seven already-applied production ledger rows.
