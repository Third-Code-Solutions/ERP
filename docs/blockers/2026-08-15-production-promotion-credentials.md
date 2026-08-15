# Production promotion credentials — 2026-08-15

## Status

BLOCKED. The release workflow cannot reach its read-only production boundary
scan or provider deployment until the GitHub `production` environment has the
approved values for all required secrets.

## Evidence

- Workflow: `deploy-production.yml`.
- Failed run: https://github.com/Third-Code-Solutions/ERP/actions/runs/31888953823
- The run stopped at `Require production credentials` before dependency
  installation, the production-data boundary scan, migrations, provider
  deploys, health checks, or authenticated E2E.

## Required operator action

Configure the approved production environment secrets documented in
`docs/DEPLOYMENT.md`, then rerun the guarded workflow from the intended main
revision. Values must be entered through the provider's secret management
interfaces; this note intentionally contains no secret values.

The existing non-demo E2E data-boundary finding must also be cleared through
an authorized, reversible process before promotion. No production data was
changed as part of this audit.
