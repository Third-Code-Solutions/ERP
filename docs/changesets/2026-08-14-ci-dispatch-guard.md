# CI manual-dispatch guard — 2026-08-14

## Finding

The first branch-dispatch run `31815138788` failed `BUILD OPS Invariants` before
the database replay. The migration collector used `set -u` and read
`GITHUB_EVENT_BEFORE`, which is not populated for `workflow_dispatch`.

## Change

Treat an absent event-before SHA as a zero/base event and scan all migrations.
The existing invariant test now protects this shell contract.

## Verification

- PASS — `pnpm test:build-ops-invariants`
- PASS — `node scripts/run-actionlint.mjs`
- PENDING — branch-dispatch CI replay after this commit
