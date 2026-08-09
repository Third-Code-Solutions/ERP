# Release Identity and Rollback Review

## M3.197 source-only release gate (2026-08-10)

Added `scripts/release-identity-plan.mjs` and its pure planner module. The
command is read-only: it records current Git SHA/branch/clean state, checks
the Vercel spend guard, and requires explicit API/Web hosted release IDs,
matching hosted source SHAs, and API/Web rollback IDs. It never calls a
provider, queries or mutates SQL, changes flags, or deploys.

Run:

```text
pnpm plan:release-identity -- --json
pnpm plan:release-identity -- --require-clear
```

Required operator-supplied evidence:

- `THIRD_CODE_API_RELEASE_ID`, `THIRD_CODE_API_RELEASE_SHA`
- `THIRD_CODE_WEB_RELEASE_ID`, `THIRD_CODE_WEB_RELEASE_SHA`
- `THIRD_CODE_API_ROLLBACK_ID`, `THIRD_CODE_WEB_ROLLBACK_ID`

The planner rejects dirty source, source-SHA mismatch, enabled Vercel Git,
non-clear spend guard, missing hosted IDs, and missing rollback IDs. Current
source-only run remains `review_required` because hosted identities and
rollback targets are not supplied; this is expected and prevents a false
production claim.

Rollback artifact: retain prior known-good API/Web IDs and source SHAs; clear
Core/Web flags and tenant allowlists first; restore prior aliases only after
readiness and legacy-route checks. No hosted canary is authorized by this
packet.
