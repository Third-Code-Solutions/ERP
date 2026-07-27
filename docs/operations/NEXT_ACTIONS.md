# Next Actions

## Exact next action

Complete M1 frontend release and integration evidence without enabling
production writes:

1. Resolve the GitHub organization billing/spending-limit block, rerun the
   clean PostgreSQL 17/Redis CI lane, and confirm no database test is skipped.
2. Exercise Supabase Auth and safe authorization/tenant-denial paths against
   the deployed Nest guard without using production business writes as tests.
3. Attach observability and rollback evidence.
4. Keep `ERP_PROJECT_WRITES_VIA_API=false` until cross-tenant, insufficient
   capability, stale-write, audit attribution, and rollback evidence is
   complete.
5. Then enable the Project-write slice for a controlled tenant, reconcile its
   audit/result data, and either continue or roll back before starting M2.

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
