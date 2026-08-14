# Web database boundary revalidation

## Status

VERIFIED COMPLETE for the static boundary inventory. This is a repository
guard correction, not a production authority migration.

## Changed

- Removed the obsolete direct-write allowlist entry for the closed 410 Togal
  endpoint.
- Explicitly classified the active WO-08 generic takeoff-import and WO-12
  inspection-photo routes, which are tenant-scoped, capability-gated, and
  audited within their transactions.
- Updated the boundary fixture to match the actual route inventory.

## Verification

- `pnpm test:web-db-boundary`: PASS (4/4).
- The guard still blocks a synthetic unallowlisted direct write and an
  unclassified raw `db.execute` route.

## Release boundary

No application data, hosted configuration, deployment, commit, or push was
performed.
