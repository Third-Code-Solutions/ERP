# Next Actions

## Exact next action

Complete remaining M1 release controls without enabling production writes:

1. Resolve the GitHub organization billing/spending-limit block, rerun the
   clean PostgreSQL 17/Redis CI lane, and confirm no database test is skipped.
2. Alternative local path: enable firmware virtualization plus Windows Virtual
   Machine Platform, then run the pinned Supabase 2.109.1 PostgreSQL 17/Redis
   lane. Do not use the hosted application database.
3. Deploy the tenant-canary source while keeping
   `ERP_PROJECT_WRITES_VIA_API=false`; leave the tenant allowlist empty until
   clean CI evidence is attached.
4. Perform the provider-level enable/rollback drill for a controlled tenant:
   capture provider configuration, enable exact `true`, prove one compatible
   Web-to-Nest demo command and reconciliation, restore exact `false`, and
   prove the legacy branch is selected.
5. Record provider release IDs, runtime logs, final data reconciliation, and
   the tested rollback procedure before starting M2.

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
