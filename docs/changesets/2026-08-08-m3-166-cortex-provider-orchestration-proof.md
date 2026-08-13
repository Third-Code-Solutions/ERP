# M3.166 Cortex provider orchestration proof

## Outcome

Added a closed, provider-neutral Nest orchestration seam around the existing
PostgreSQL provider budget authority. The production adapter is deliberately
unavailable. Tests use an in-memory fake; no network or paid provider call is
possible from this milestone.

## Behavior

- Requires generation, provider-execution, and provider-budget gates plus the
  same exact tenant in every allowlist.
- Reconciles superseded work, reserves before dispatch, rejects dispatched
  replay, validates bounded output and authorized citations, and settles actual
  fake cost before the existing Nest completion authority commits.
- Releases reserved work at zero during cancellation, retry, failure, recovery,
  or pre-dispatch execution failure.
- Conservatively settles dispatched work at the reserved maximum when the
  external outcome is unknown.
- Allows independently gated exact-tenant recovery to drain stale work after
  intake or execution closes, without reopening provider dispatch.

## Validation

- API: 599/599.
- Shared: 260/260.
- Web: 676/676.
- Python: 8/8.
- Clean PostgreSQL 17/Redis 7.4.9 lane: 108/108 migrations; database 354/354,
  zero skips; full API integration.
- Schema hash unchanged before/after:
  `ED239E894DF4109848F2EFC991F041217DE955880C4CF6092ECF029CEB966E74`.
- Lint, typecheck, Nest/Next production build (82 pages), spend guard 4/4,
  controlled release 5/5, Actionlint, pinned workflow refs, Gitleaks over 549
  commits, and diff hygiene passed.

## Release and rollback

No schema migration, public API, UI, Python behavior, provider credential,
provider package, cloud access, or deployment was added. All gates remain
false and allowlists empty. Roll back by leaving execution closed; if a future
activation has created open attempts, reconcile them before reverting source.
Never delete or down-migrate the provider ledger.
