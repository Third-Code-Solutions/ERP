# Next Actions

## Exact next action

Complete remaining M1 release controls without enabling production writes:

1. Resolve the GitHub organization billing/spending-limit block, rerun the
   clean PostgreSQL 17/Redis CI lane, and confirm no database test is skipped.
2. Execute one controlled Nest Project update against demo data without
   enabling the Web feature flag. Snapshot the row and audit tail first.
3. Verify committed result, authenticated actor attribution, tenant scope,
   correlation log, and audit evidence; then restore the original demo values
   through a second authorized Nest command and reconcile both audit entries.
4. Keep `ERP_PROJECT_WRITES_VIA_API=false` until clean CI and the controlled
   mutation/reconciliation evidence are complete.
5. Then perform the provider-level enable/rollback drill for a controlled
   tenant before starting M2.

## Following milestone

M2: remove the Python `scope_items` direct-write path. Python returns immutable
processing evidence; BullMQ transports it; a new Nest command authorizes,
idempotently validates, and commits accepted changes.

## Do not start yet

- No finance migration before M1 integration evidence.
- No broad Server Action replacement.
- No production feature-flag enablement.
- No new microservices.
- No external ERP source, schema, UI, or wording reuse.
