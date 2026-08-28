# No-cost release-control recovery handoff

**Date:** 2026-08-28
**Owner:** Agent 01 — Product/PRD Guardian
**Status:** documentation-only authorization record; **production remains NO-GO**.

## Outcome

Added
[`docs/handoffs/2026-08-28-no-cost-release-control-recovery.md`](../handoffs/2026-08-28-no-cost-release-control-recovery.md),
a strict recovery sequence for the owner's explicit no-cost authorization.

The authorization is limited to approved host virtualization/network work for a
dedicated isolated Linux runner, existing-account Snyk authentication, local
schema/metadata-only lineage replay, and evidence-based product decisions. It
does not authorize paid purchases, account creation, secret disclosure,
production database writes, production migration/deployment, force-push, or
direct `main` changes.

## Ordered owners

1. Agent 12 defines the Linux runner/containment contract.
2. Agent 13 preflights and implements the isolated ephemeral Linux runner.
3. Agent 12 independently accepts or rejects the applied runner boundary.
4. Agent 12 then Agent 13 establish an existing Snyk OAuth/token path and run
   the required gate without revealing a token.
5. Agent 04 performs read-only target metadata collection and a local,
   schema/metadata-only replay to classify six historical unexpected/local-only
   and three ordered pending migration entries.
6. Agent 01 records O-01, O-14, and fractional-quantity/DUPA authority only
   from evidence; O-14 may not use an invented identity.
7. Agent 13 then Agent 12 run and independently review the full no-skip gate
   matrix.
8. Agent 04 produces final read-only parity evidence; Agent 13 writes a
   deployment handoff only, never a deployment.

## Mandatory controls

- Runner and local Supabase publication must prove effective loopback-only
  binding from Docker metadata and listener evidence before Auth credentials,
  reset, status, or tests.
- Existing Snyk local OAuth must not be scraped into an Actions token; only a
  compatible pre-existing token may be securely set for the exact repository.
- The local replay is metadata-only, data-free, exact-target scoped, and cannot
  use paid Supabase clone/branch/PITR resources, a hosted reset, migration
  repair, or a production write.
- O-01's default is `direct_only` to reproduce existing books; O-14 requires
  a verified existing accountable ABI ERP account; fractional quantity requires
  an evidence-based ADR and additive migration contract.
- Any failed/absent scan, wildcard listener, ambiguous target, data-dependent
  replay, missing ownership evidence, cost/account request, or production write
  requirement is an immediate **NO-GO**.

## Verification

- **PASS:** documentation-only scope; current release, runner, Auth-containment,
  Snyk, migration, ADR-020/ADR-030, and fractional-quantity evidence are routed
  to scoped owners with explicit acceptance, rollback, and stop criteria.
- **NOT RUN:** host/virtualization/network changes, runner registration, Snyk
  authentication/secret update, provider reads, local replay, product ADR,
  security scans, CI, production parity, migration, or deployment.
