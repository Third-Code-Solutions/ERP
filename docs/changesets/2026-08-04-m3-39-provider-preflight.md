# M3.39 provider preflight boundary

The source release is pushed and Railway is healthy, but the hosted Supabase
database was not advanced. The target is a verified 55-row prefix while the
source has 87 migrations. The connected apply connector returned
`INVALID_ARGUMENT` for the first real suffix migration, and the provider
reports a pre-existing `MIGRATIONS_FAILED` branch state.

Two no-op connector probes were used only to confirm the error boundary. Both
probe migration rows and the temporary table were removed; a read-only check
confirmed zero probe rows/table and the original 55-row ledger. No source
suffix DDL, business data, Storage, or net migration-history change remains.

Next: obtain the supported Supabase ordered-apply/reconciliation path plus an
approved backup/restore and catalog/data/RLS/Storage diff. Do not hand-insert
migration history, concatenate the suffix into an untracked migration, or
bypass the existing hosted-apply gate.
