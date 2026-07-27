# Next Actions

## Exact next action

Complete M1 source publication and deployment without enabling production
writes:

1. Grant the active GitHub identity access to
   `Third-Code-Solutions/ERP`, then push the reviewed local release commit.
2. Grant the Vercel CLI/deployment identity access to team
   `team_n60dl3ccO8BFGFeUKQdqPhp3` and project
   `prj_5yZX5MTJdXZYWRIeS50jVhmjqzdb`.
3. Grant the Railway CLI identity access to project
   `a21fd382-80b2-4218-8025-11f420a062e3`, then enumerate the production
   services before selecting the Nest API target.
4. Execute the updated clean PostgreSQL 17/Redis CI lane.
5. Confirm all database tests execute without skips and the clean-schema diff
   is empty.
6. Deploy the Vercel frontend from the reviewed commit. Verify build identity,
   `/api/health`, `/api/ready`, landing/auth/dashboard browser flows, console,
   network, and production alias.
7. Deploy the Nest container to the confirmed Railway API service. Verify
   `/health`, `/ready`, logs, CORS, Supabase Auth, Redis, and rollback.
8. Keep `ERP_PROJECT_WRITES_VIA_API=false` until cross-tenant, insufficient
   capability, stale-write, audit attribution, and rollback evidence is
   attached.

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
