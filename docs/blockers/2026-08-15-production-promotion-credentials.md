# Production promotion credentials — 2026-08-15

## Status

BLOCKED. Four of the seven required values are now present in the protected
GitHub `production` environment, but the release workflow cannot pass its
credential gate until the three provider access tokens are configured.

## Evidence

- Workflow: `deploy-production.yml`.
- Previous failed run: https://github.com/Third-Code-Solutions/ERP/actions/runs/31888953823
- Current failed run: https://github.com/Third-Code-Solutions/ERP/actions/runs/31892885897
- The current run stops at `Require production credentials` because
  `VERCEL_TOKEN`, `RAILWAY_TOKEN`, and `SUPABASE_ACCESS_TOKEN` are empty. It
  stops before dependency installation, the production-data boundary scan,
  migrations, provider deploys, health checks, or authenticated E2E.
- The read-only session-pooler boundary scan is reachable and reports
  `review_required`: one `cortex_nodes.title` row and one `projects.name` row
  under the non-demo tenant `e2e-qa-20260513-foreign`.

## Required operator action

Configure the missing provider access tokens documented in `docs/DEPLOYMENT.md`
through their provider secret-management interfaces, then rerun the guarded
workflow from the intended main revision. This note intentionally contains no
secret values.

The existing non-demo E2E data-boundary finding must also be cleared through
an authorized, reversible process before promotion. No production data was
changed as part of this audit.

## Resolution update — 2026-08-16

The historical blocker was remediated without widening the demo allowlist:

- The exact foreign synthetic `projects` row and its mirrored `cortex_nodes`
  row were removed with tenant, ID, and value guards. The append-only audit log
  contains two corresponding delete events; no tenant, user, calendar, or audit
  history was deleted.
- The production boundary verifier now reports `clear`, 70 E2E field matches,
  zero seeded identities outside the allowlist, and zero promotion violations.
- `RAILWAY_TOKEN` is now present as a newly generated production project API
  token. The workflow no longer depends on `SUPABASE_ACCESS_TOKEN`; it uses a
  separate `SUPABASE_MIGRATION_DATABASE_URL` write-scoped session-pooler secret
  and keeps `PRODUCTION_DATABASE_URL` read-only.
- Vercel still requires a classic, non-expiring personal token for durable CI
  operation. The current local OAuth session is sufficient only for an
  immediate promotion window and must not be treated as a permanent release
  credential.
