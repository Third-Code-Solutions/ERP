# Railway promotion poller hardening

## Changed

- Preflight source-bound successful deployments and retain them when none of the component's watched container inputs changed. This prevents a no-op Railway upload from getting stuck in `INITIALIZING` during an otherwise identical production promotion.
- Retry transient Railway deployment-list responses (including empty/non-JSON provider bodies) with bounded exponential backoff before failing closed.
- Preserve the existing source, configuration, health, and terminal-state checks for actual deployments.

## Verification

- `node --test scripts/deploy-railway-service.test.mjs`
- `git diff --check`

## Operational boundary

This changes only the promotion guard/poller. It does not alter application release identity, Railway project/service targets, or production data.
