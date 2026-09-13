# ADR-033: Controlled mobilization receipts

Status: Accepted for implementation; production migration remains release-gated.

## Context

WO-16 requires persisted external returns or an authorized, attributed override
before mobilization. The mounted Web actions are the only application writers
found for `mobilization_readiness`. Existing authenticated table grants bypass
their capability checks, and the trigger permits replacing evidence after start.

## Decision

Keep the existing server-action interface as the controlled mutation boundary.
Retire direct `anon`/`authenticated` table mutations while retaining tenant-scoped
read access and RLS. Do not add a security-definer API or grant access to users or
tenant administration tables. Privileged writes must carry the existing audited
actor stamp; an invoker trigger checks current active actor/tenant and canonical
manage/override capabilities, and protects the recorded start and evidence.

Both mounted commands lock current authority, then the tenant-scoped project,
then readiness. The project serializes initial creation. Exact receipt/start
replays do not duplicate semantic audit events. Supplied invalid dates reject;
only an omitted receipt date retains the existing current-time behavior.

UI edits are not receipts. Saved counts advance only on a confirmed scoped
response. Refresh failure cannot turn committed success into a claimed rollback.

## Consequences and release

No application route, permit type, capability, public signing contract or data is
removed. External clients attempting direct table writes must use the controlled
application workflow. Test direct-write denial, lifecycle admission, tenant
isolation, override authority and immutable evidence on synthetic PostgreSQL.
Use a new forward-only migration; never edit historical audit or migration files.
Recovery, migration rehearsal and hosted verification remain required before
production promotion. Recovery should promote a reviewed compatible application
or apply a reviewed fix-forward, not reopen the bypass.
