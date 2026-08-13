# Supabase reconciliation audit — 2026-08-10

## Target

- Project: `aqqrtkmtcsfkbyyqxowv` (`ERP`)
- Status: `ACTIVE_HEALTHY`
- Region: `ap-northeast-2`
- PostgreSQL: 17.6.1.121 (major 17)

## Migration parity

Connected Supabase inventory returned 55 applied migrations, ending at
`20260729233017_notification_outbox_foundation`. Repository contains 116
ordered migration files, ending at
`20260810120000_project_comment_delete_fk_tenant_preservation`. Pending suffix:
61 files. A direct ordered comparison returned `prefixMatch=true`; no
unexpected or out-of-order hosted version was found.

## Catalog and Cortex snapshot

- Public tables returned by provider are RLS-enabled.
- Vendor rows: 3; current Cortex vendor nodes: 3.
- Material rows: 0; current Cortex material nodes: 0.
- Absent newer authority families include document-processing jobs/evidence,
  project-comment request ledgers, purchase-order workflow requests,
  cost-entry creation requests, and customer-invoice draft requests.

## Advisors

- Security: 14 findings (11 WARN, 3 INFO): RLS-without-policy, public vector
  extension, executable security-definer RPCs, and leaked-password protection.
- Performance: 253 findings (1 WARN, 252 INFO): unindexed foreign keys,
  unused indexes, one duplicate index, and absolute Auth connection allocation.

Advisor output is evidence for review, not authorization to auto-fix production.

## Decision

Status: `BLOCKED_FOR_HOSTED_APPLY`, not because target is unhealthy, but because
source and hosted schema are materially different and no approved restore/clone
or rollback packet exists. No SQL, migration repair, provider setting,
deployment, tenant data, Storage object, or paid action changed.

Required next evidence: restorable backup/clone, isolated 116-migration replay,
catalog/data/RLS/function/audit diff, zero-skip DB/API and rollback checks,
owner approval, exact release SHA, and spend ceiling.
