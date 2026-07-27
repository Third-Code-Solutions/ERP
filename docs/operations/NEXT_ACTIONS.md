# Next Actions

## Exact next action

Complete M1 frontend release and integration evidence without enabling
production writes:

1. Commit the deployment record as
   `kurtgav <kurtgavin.design@gmail.com>` and push it to `main`.
2. Confirm Vercel accepts the `kurtgav`-attributed commit, completes a
   production build, and moves `thirdcode-erp.vercel.app` to that exact SHA.
3. Verify landing, auth, unauthenticated dashboard redirect, SEO endpoints,
   console, network, and responsive production behavior.
4. Resolve the GitHub organization billing/spending-limit block, rerun the
   clean PostgreSQL 17/Redis CI lane, and confirm no database test is skipped.
5. Exercise Supabase Auth and safe authorization/tenant-denial paths against
   the deployed Nest guard without using production business writes as tests.
6. Attach observability and rollback evidence.
7. Keep `ERP_PROJECT_WRITES_VIA_API=false` until cross-tenant, insufficient
   capability, stale-write, audit attribution, and rollback evidence is
   complete.

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
