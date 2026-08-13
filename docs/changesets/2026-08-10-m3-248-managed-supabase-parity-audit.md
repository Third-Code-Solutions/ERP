# M3.248 - Managed Supabase parity/security audit

Date: 2026-08-10
Status: read-only provider audit; hosted cutover closed

## Evidence

- Project `aqqrtkmtcsfkbyyqxowv` (`ERP`) is `ACTIVE_HEALTHY`, region
  `ap-northeast-2`, PostgreSQL `17.6.1.121`.
- Hosted migrations: 55, ending at `20260729233017`.
- Repository migrations: 117, ending at `20260810130000`; 62 ordered suffix
  migrations remain pending.
- Hosted catalog: 88 public tables, all reported with RLS enabled. Force-RLS,
  policy correctness, and service-only privileges remain separate checks.
- Security advisors: 14 findings, 11 WARNs. Performance advisors: 253
  findings, one WARN.
- Stop-ship examples: public vector extension; executable public/authenticated
  security-definer helpers including `auth_tenant_id`; leaked-password
  protection disabled; duplicate tenant slug indexes.

## Release boundary

No SQL, Storage, deployment, provider setting, credential, or paid action was
performed. `hostedApplyApproved=false` remains in the source parity manifest.
Before any hosted suffix apply: backup/restore proof, duplicate Purchase Order
mapping, audit-recovery authority, ordered batches, post-batch catalog/RLS/
advisor checks, readiness, exact SHA, protected browser smoke, rollback, and
billing approval are required.
