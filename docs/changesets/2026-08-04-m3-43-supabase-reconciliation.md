# M3.43 — Supabase reconciliation gate

## Scope

Read-only provider reconciliation for the configured Third Code ERP database.

## Changed files

- `docs/research/supabase-reconciliation-20260804.md`
- architecture and operations memory files

## Verification

- 87 source migrations vs 55 hosted migrations.
- Protected Supabase branch reports `MIGRATIONS_FAILED` at the first pending
  migration because one tenant has 12 duplicate `PO-0002` purchase orders.
- 88 public tables have RLS enabled; Storage has one private bucket and 37
  objects; advisors recorded security/performance findings.
- No hosted SQL, data, Storage, migration history, Railway variable, or Vercel
  deployment changed.

## Next action

Supported backup/restore, owner-approved duplicate repair, ordered migration
replay, and full catalog/RLS/Storage/audit verification before any mutation
canary or Vercel promotion.
