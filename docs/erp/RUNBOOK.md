# Production runbook — deploy, rollback, backup, restore

Operator quick reference for the ERP program. These documents hold the detail
and win if anything here disagrees:
- [`docs/DEPLOYMENT.md`](../DEPLOYMENT.md)
- [`docs/runbooks/database-release.md`](../runbooks/database-release.md)
- [`.github/workflows/deploy-production.yml`](../../.github/workflows/deploy-production.yml)

Never print or commit connection strings, tokens, or dumps.

| Surface | Where | Health |
|---|---|---|
| Web | Vercel project `thirdcode-erp` (team `team_n60dl3ccO8BFGFeUKQdqPhp3`) → https://thirdcode-erp.vercel.app | `/api/health`, `/api/ready` (both report `revision` = first 12 chars of the SHA) |
| Core API | Railway service `c45b3d01-…` → https://third-code-erp-api-production.up.railway.app | `/health`, `/ready` |
| CAD worker | Railway service `328c6650-…` → https://abi-ops-cad-worker-production.up.railway.app | `/health` |
| Database | Supabase `aqqrtkmtcsfkbyyqxowv` (PostgreSQL 17, **no PITR**) | Supabase dashboard |

## 1. Deploy

1. Merge the PR into `main` only when:
   - every CI check is green (`gh pr checks <n>`),
   - the security verdict is PASS,
   - the review verdict is APPROVE.

   Merge with `gh pr merge <n> --squash --delete-branch`.
2. Wait for `CI` on the `main` push to pass. The promotion refuses a SHA without a
   green canonical push run:

   ```
   gh run list --workflow ci.yml --branch main --limit 1
   ```
3. Promote:

   ```
   gh workflow run deploy-production.yml --ref main -f reason="<PR #, change>" -f verify_password_rotation=false
   ```

   The workflow:
   - re-verifies CI;
   - runs the release gates (lint, typecheck, tests, build, invariants);
   - checks the migration ledger is current (it is code-only, so a pending migration
     fails here);
   - deploys Railway API + CAD worker, then Vercel `--prod`;
   - checks health and release identity;
   - runs production E2E.
4. Watch it: `gh run watch <run-id> --exit-status`.
5. Confirm the Vercel deployment is Ready:

   ```
   vercel ls thirdcode-erp --prod --scope team_n60dl3ccO8BFGFeUKQdqPhp3
   vercel inspect <deployment-url> --scope team_n60dl3ccO8BFGFeUKQdqPhp3
   ```

   `curl -s https://thirdcode-erp.vercel.app/api/health` should report the new
   `revision`.
6. Smoke: `gh workflow run smoke-prod.yml --ref main`, then watch it.
   - It runs `pnpm smoke:prod` (login, dashboard, one read route per shipped module)
     against prod with the dedicated `buildops-e2e` tenant. Credentials come from
     the GitHub `production` environment.
   - Locally, `pnpm smoke:prod` needs the same variables injected. The script lists
     only the names of missing variables.
7. Feature flags: turn a feature's flag on in Vercel production only after step 6
   passes. Env vars snapshot per deployment, so a flag change needs the next deploy
   (or a redeploy) to take effect.

Vercel env changes: `vercel env add <NAME> production` with the value piped on
stdin. Never pass secrets on the command line in shared logs.

## 2. Roll back (code)

Trigger: smoke fails, `/api/health` or `/api/ready` is not 200, or runtime errors
spike (`get_runtime_errors` or the Vercel dashboard).

1. **Web — immediately:**

   ```
   vercel rollback --scope team_n60dl3ccO8BFGFeUKQdqPhp3 --yes
   ```

   - This reverts to the previous production deployment. To target one, pass its
     URL: `vercel rollback <previous-prod-url> …`.
   - Find candidates with `vercel ls thirdcode-erp --prod`.
2. Confirm health:
   - `/api/health` and `/api/ready` return 200 with the previous `revision`;
   - re-run `smoke-prod.yml`.
3. **Railway (API / worker), if the defect is there:**
   - redeploy the previous successful deployment of that service (Railway
     dashboard → Deployments → Redeploy);
   - verify `/health` and `/ready`.
4. After a Vercel rollback, Vercel stops auto-assigning the production domain.
   - The next release must end with `vercel promote <new-deployment-url>`, or be
     promoted from the dashboard, after its smoke passes.
   - Record this in `docs/erp/STATE.md`.
5. Open a fix PR. Log the incident in `docs/erp/STATE.md`:
   - time,
   - symptom,
   - rolled-back-to deployment,
   - fix PR.
6. If production is still broken after the rollback, **stop and page the owner**.

**Never roll back the database.**
- Migrations are expand/contract, so the previous code stays compatible with the
  new schema.
- Fix forward with an additive migration.

## 3. Backup (before any production migration)

Production has real/demo data and no PITR. Take a logical dump into `backups/`
before applying any migration. `backups/` is gitignored; never commit or upload a
dump.

1. Preflight, read-only:

   ```
   pnpm plan:database-export
   ```

   - It needs `DATABASE_EXPORT_URL` (session pooler `:5432`) and `PG_DUMP_PATH`,
     injected by the secret manager.
   - It must report `status: "ready"`.
2. Dump roles, schema and data. The connection string comes from the injected env
   var; never echo it.

   ```
   supabase db dump --db-url "$DATABASE_EXPORT_URL" --role-only -f backups/<UTC-ts>-roles.sql
   supabase db dump --db-url "$DATABASE_EXPORT_URL"             -f backups/<UTC-ts>-schema.sql
   supabase db dump --db-url "$DATABASE_EXPORT_URL" --data-only --use-copy -f backups/<UTC-ts>-data.sql
   ```
3. Record in `docs/erp/STATE.md`:
   - the dump timestamp,
   - file sizes,
   - the migration it guards.
4. Storage objects are **not** in the dump. Inventory buckets separately if the
   migration touches storage.

Then apply the migration with the reviewed path in
[`database-release.md`](../runbooks/database-release.md) (`supabase db push --db-url
<migration url>` after a `--dry-run`). Rules:
- Additive only: new tables, nullable or defaulted columns, new indexes created
  `CONCURRENTLY` where large.
- Drop, rename or retype only in a later release, after no deployed code uses the
  old shape.
- Any migration that would destroy production data → **stop and ask the owner**.

## 4. Restore

Restoring the database discards every write made after the backup. Treat it as
a last resort and an owner decision.

1. Restore into an **isolated clone first**:
   - Supabase branch, or local PostgreSQL 17:
     `psql -f roles.sql`, then `schema.sql`, then `data.sql`.
   - Then verify it read-only:
     `ERP_PARITY_REPLAY_MAPPING_MODE=synthetic_clone_only pnpm verify:managed-supabase-parity-replay`.
2. Production restore only with explicit owner approval and announced downtime:
   - use the Supabase dashboard backup restore, or replay the dump;
   - then re-run the health checks and `smoke-prod.yml`.
3. A database restore does not restore deleted Storage objects.
