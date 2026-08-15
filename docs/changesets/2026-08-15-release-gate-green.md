# Enterprise release-gate recovery

## Verified state

GitHub Actions run `31818071628` passed on commit `5e950866` for:

- Actionlint
- Secret Scan
- Lint
- Type Check
- Unit Tests
- BUILD OPS Invariants
- Database Reproducibility (Postgres 17)
- Build

The database replay reached the Nest transaction-boundary integration and
production-container smoke after rebuilding the schema from zero. E2E was
skipped because the workflow only enables it for pull requests with a
configured E2E base URL.

## Root causes repaired

- CI-only Postgres grants contradicted the anonymous-table privilege invariant.
- The authenticated user read grant was missing from the clean replay.
- The budget integration fixture did not include the now-required BOM-line
  lineage.
- WO-12 inspection tables had RLS policies without authenticated table grants.
- A document-processing assertion treated a CAD worker recommendation as
  authoritative pricing even though draft BOMs are intentionally unpriced.

## Production boundary

No hosted data was deleted or modified by this changeset. Production-data
contamination and exact tenant cleanup remain a separate blocked boundary until
the target tenant, retention policy, backup/restore evidence, and reversible
manifest are supplied.
