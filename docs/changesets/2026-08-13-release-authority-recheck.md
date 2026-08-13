# Release authority recheck

## Scope

Rechecked current Vercel deployment identity and Supabase provider-source
database drift before any deploy or migration mutation.

## Evidence

- Vercel project is `pavi-2e9809a4/thirdcode-erp`; public alias resolves to
  deployment `dpl_F1Xo2hfhpMrfvrHG1hiPRKeim9mN`.
- Multiple READY production deployments exist; direct deployment URLs are
  Vercel-protected and are not public production proof.
- Supabase provider-source plan remains read-only and blocked at 55/124
  applied migrations with 69 pending migrations.
- One duplicate tenant Purchase Order number group remains: 12 `PO-0002`
  rows in the `buildops-e2e` tenant. Rows include issued records and linked
  delivery schedules, so no automatic deletion or merge is safe.

## Result

No Vercel deployment, alias change, migration SQL, or hosted data mutation was
performed. Production and database promotion remain blocked pending explicit
release approval, data reconciliation, and exact SHA alignment.
