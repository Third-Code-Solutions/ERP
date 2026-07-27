# Next Actions

## Exact next action

Complete remaining M1 release controls without enabling production writes:

1. Resolve the GitHub organization billing/spending-limit block, rerun the
   clean PostgreSQL 17/Redis CI lane, and confirm no database test is skipped.
2. Add request correlation and structured command outcome logs without
   recording bearer tokens, command payloads, or sensitive record contents.
3. Rehearse the feature-flag rollback and verify the legacy Server Action
   remains the active production path.
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
