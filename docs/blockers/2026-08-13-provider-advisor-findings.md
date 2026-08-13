# Hosted Supabase advisor findings

## Status

OPEN. Read-only Supabase advisor and catalog inspection completed on
2026-08-13 for project `aqqrtkmtcsfkbyyqxowv`.

## Security findings

- `public.financial_sequences`, `public.notification_deliveries`, and
  `public.notification_outbox` have RLS enabled with no policies. This is
  fail-closed for direct client access, but requires an explicit decision on
  whether these service-owned tables should remain unexposed or receive
  narrowly scoped policies.
- `vector` extension is installed in `public`.
- `public.auth_tenant_id()` is `SECURITY DEFINER` and executable by `anon`.
  `authenticated` execution is required by existing tenant RLS predicates and
  must not be revoked without replacing those predicates first.
- `auth_can_manage_budgets`, `auth_can_manage_finance`,
  `auth_can_manage_inventory`, `auth_can_read_budgets`,
  `auth_can_read_cortex_node_type`, `auth_can_read_cortex_subject`, and
  `auth_can_read_inventory` are `SECURITY DEFINER` and executable by
  `authenticated`. They are called by existing RLS policies; changing their
  privilege model requires a tested policy/function migration.
- Supabase Auth leaked-password protection is disabled.

## Performance findings

- Advisor reports unindexed foreign keys, including
  `account_kyc_artifacts.document_id` and `account_kyc_artifacts.uploaded_by`.
  Full advisor output must be reconciled against source migrations before
  adding indexes.
- `public.tenants` has duplicate identical unique indexes:
  `idx_tenants_slug` and `tenants_slug_unique`.

## Release boundary

No SQL was executed. Do not apply remediation to hosted production until the
source-authority decision, complete migration reconciliation, duplicate PO
resolution, backup/rollback plan, and exact production approval are complete.

The likely first safe remediation is revoking `anon` execution on
`public.auth_tenant_id()` and enabling leaked-password protection through the
approved Supabase Auth configuration path. Function relocation, vector schema
move, policy changes, and index cleanup require source migration review and
mixed-version compatibility testing.
