# Production runbook — deploy, rollback, backup, restore

Operator quick reference for the ERP program. These documents hold the detail
and win if anything here disagrees, with one recorded exception: production has
no PITR, so the encrypted pre-migration dump in section 3 stands in for the
PITR and restore-rehearsal preconditions in `database-release.md` (owner
mandate in `docs/erp/STATE.md`). Commands assume a POSIX shell (Git Bash on
Windows).
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
   - It runs `pnpm smoke:prod` against prod with the dedicated `buildops-e2e`
     tenant. Credentials come from the GitHub `production` environment, and the
     target URL is pinned in `scripts/smoke-prod.mjs`.
   - Covered: login, dashboard, projects and their detail tabs, pipeline,
     procurement, purchase orders, inventory, invoices, finance, reports, tasks,
     settings.
   - Not covered yet: CRM/accounts, KYC queue, Cortex, assets, planning
     (`/process`), permits, punchlist, warranty, claims, admin, documents and BOM
     hubs. Check those by hand when a release touches them.
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

1. **Web — immediately:** pick the last good Ready production deployment, then
   roll back to it by URL.

   ```
   vercel ls thirdcode-erp --prod --scope team_n60dl3ccO8BFGFeUKQdqPhp3
   vercel rollback <last-good-deployment-url> --scope team_n60dl3ccO8BFGFeUKQdqPhp3 --yes
   ```

   - The deployment argument is required. Without it, Vercel CLI 54.x runs
     `rollback status`, which only reports pending rollbacks and changes nothing.
   - Vercel MCP `request_rollback` does the same from an agent session.
2. Confirm health:
   - `/api/health` and `/api/ready` return 200 with the previous `revision`;
   - re-run `smoke-prod.yml`.
3. **Railway (API / worker), if the defect is there:**
   - redeploy the previous successful deployment of that service (Railway
     dashboard → Deployments → Redeploy);
   - verify `/health` and `/ready`.
4. After a Vercel rollback, Vercel stops auto-assigning the production domain to
   new production deployments, so the next release needs one extra step:
   1. Merge the fix and dispatch `deploy-production.yml`. It deploys, then fails at
      "Verify production health and release identity" because the domain still
      serves the rollback target.
   2. Promote that run's deployment (URL in the "Deploy web" step log). This
      moves the domain and turns auto-assignment back on:
      `vercel promote <deployment-url> --scope team_n60dl3ccO8BFGFeUKQdqPhp3 --yes`.
   3. Confirm `/api/health` reports the new `revision`, then dispatch
      `deploy-production.yml` again so the identity checks and production E2E run
      end to end, then run `smoke-prod.yml`.
   - This follows Vercel's documented rollback behaviour; it has not been
     exercised on this project yet.
   - Record the rollback state in `docs/erp/STATE.md` until the promote in
     sub-step 2 is done.
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

The database URL exists only as the `SUPABASE_MIGRATION_DATABASE_URL` secret of
the GitHub `production` environment, so the dump runs on GitHub and comes back
encrypted to a key only the operator holds.

1. Once per operator, create the RSA-4096 backup keypair **outside the repo**,
   readable only by the operator account, and pin the public key in the
   `production` environment. The workflow reads only that pinned key (it is not
   a dispatch input, so a caller cannot choose who can decrypt the dump).

   ```
   mkdir -p ~/.erp-backup
   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out ~/.erp-backup/operator.key
   openssl pkey -in ~/.erp-backup/operator.key -pubout -out ~/.erp-backup/operator.pub.pem
   gh variable set PRODUCTION_BACKUP_PUBLIC_KEY --env production --body "$(base64 -w0 ~/.erp-backup/operator.pub.pem)"
   ```

   On Windows, restrict the folder:
   `icacls %USERPROFILE%\.erp-backup /inheritance:r /grant:r "%USERNAME%:(OI)(CI)F" /T`.
   Rotating the key is the same `gh variable set` with a new keypair.
2. Dispatch the dump (roles, schema, data via `supabase db dump`):

   ```
   gh workflow run backup-production.yml --ref main -f reason="<migration file it guards>"
   gh run watch <run-id> --exit-status
   ```
3. Check where the artifact came from, then download, decrypt and verify:

   ```
   gh run view <run-id> --json headBranch,event,workflowName   # main / workflow_dispatch / Production backup
   gh run download <run-id> -n production-backup -D backups/<UTC-ts>
   cd backups/<UTC-ts>
   trap 'rm -f key.txt' EXIT
   openssl pkeyutl -decrypt -inkey ~/.erp-backup/operator.key -pkeyopt rsa_padding_mode:oaep \
     -pkeyopt rsa_oaep_md:sha256 -pkeyopt rsa_mgf1_md:sha256 -in *-key.enc -out key.txt
   openssl enc -d -aes-256-cbc -pbkdf2 -in *-dump.tgz.enc -pass file:key.txt | tar -xz
   rm -f key.txt
   sha256sum -c SHA256SUMS.txt
   ```

   - The artifact expires after one day; the decrypted dump lives only in
     `backups/` (gitignored).
   - The dump holds every tenant's data. Keep it on an encrypted volume
     (BitLocker) and delete it once the migration is verified.
4. Record in `docs/erp/STATE.md`:
   - the run id and dump timestamp,
   - file sizes and the SHA-256 check result,
   - the migration it guards.
5. What the dump does **not** hold (Supabase CLI v2.109.1). It supplements, and
   does not replace, a platform backup; this project has no PITR, so it is the
   best copy available:
   - Storage objects. Inventory buckets separately if the migration touches
     storage.
   - The `supabase_migrations` ledger. After any replay, recreate the ledger rows
     before `plan-database-release.mjs --require-current` (the promotion gate)
     passes again.
   - The schema of Supabase-managed schemas (`auth`, `storage`, `extensions`,
     …). `data.sql` does hold `auth` and `storage` rows.
   - Reserved roles (`anon`, `authenticated`, `service_role`); `roles.sql`
     comments them out.
   - No restore drill into a scratch clone has been run yet. Run one before
     relying on the dump for anything beyond a migration guard.

Then apply the migration. The migration URL exists only in the GitHub
`production` environment, so the owner-authorised agent applies it through the
Supabase MCP `apply_migration` with the repo migration's name, before the
migration PR merges. That tool stamps the ledger with its own timestamp, so
compare `list_migrations` with the repo and, if the version differs, rename the
repo file to the stamped version in the PR before merging. The promotion's
ledger gate then passes when `deploy-production.yml` runs. A holder of the URL can instead
follow [`database-release.md`](../runbooks/database-release.md) (`supabase db push
--db-url <migration url>` after a `--dry-run`). Rules:
- Additive only: new tables, nullable or defaulted columns, new indexes created
  `CONCURRENTLY` where large.
- Drop, rename or retype only in a later release, after no deployed code uses the
  old shape.
- Any migration that would destroy production data → **stop and ask the owner**.

## 4. Restore

Restoring the database discards every write made after the backup. Treat it as
a last resort and an owner decision.

1. Restore into an **isolated clone first**:
   - A Supabase branch or a local `supabase start` stack. Plain PostgreSQL does not
     work: `data.sql` copies into `auth` and `storage`, and the schema needs the
     Supabase roles.
   - Load `roles.sql`, then `schema.sql`, then `data.sql`, then recreate the
     migration ledger (section 3, step 5).
   - Then verify it read-only:
     `ERP_PARITY_REPLAY_MAPPING_MODE=synthetic_clone_only pnpm verify:managed-supabase-parity-replay`.
2. Production restore only with explicit owner approval and announced downtime:
   - use the Supabase dashboard backup restore, or replay the dump;
   - then re-run the health checks and `smoke-prod.yml`.
3. A database restore does not restore deleted Storage objects.

## 5. Accepted risks

- The GitHub `production` environment has no protection rules and `main` has no
  branch protection: the GitHub plan returns 403 for both on this private repo.
  - `if: github.ref == 'refs/heads/main'` in the workflows is a guard, not an
    access control. Anyone with write access can dispatch the backup, smoke and
    deploy workflows.
  - Accepted while the repo has four collaborators and forking is off. If the
    plan is upgraded, set the environment's deployment branch policy to `main`
    and add a required reviewer.
- What gates a merge today: the merge rule in section 1 and the agent deny list
  in `.claude/settings.json`.

## 6. Enable a trial tenant

Per-tenant Core switches live in environment variables on two hosts: the API
(Railway) and the web app (Vercel). The list of what a trial tenant needs, and
what each missing switch looks like to a user, is `docs/erp/trial-flags.json`.
Do the steps in this order. Never paste a variable value that is not a tenant
UUID into a ticket or chat.

1. **Create the tenant.** Platform admin → Tenants → Create tenant, then enter
   the audited support context for it. Invite the first admin (Platform admin →
   Users → invite) and have them accept.
2. **Seed the finance and inventory basics.** Dry run first, then write:

   ```
   DATABASE_URL=... node scripts/bootstrap-trial-tenant.mjs --tenant-id <uuid>
   DATABASE_URL=... node scripts/bootstrap-trial-tenant.mjs --tenant-id <uuid> --apply
   ```
3. **API variables first (Railway).** For each API variable the checker lists
   (step 5), set `*_ENABLED=true` and append the tenant UUID to the comma list.
   Railway redeploys the service by itself. One malformed UUID in a list stops
   the API booting, so copy the value the checker prints and watch `/health` and
   `/ready` after the redeploy. If a health check fails, revert the variable
   first.
4. **Web variables second (Vercel).** Same change for the web variables. Vercel
   snapshots variables per deployment, so redeploy production afterwards
   (section 1, step 7). Doing the API first means the web never routes to a gate
   that is still closed.
5. **Check, with files kept outside the repo:**

   ```
   vercel env pull ../web.env --environment production
   railway variables --kv > ../api.env
   pnpm check:trial-flags --tenant <uuid> [<uuid> ...] --web-env ../web.env --api-env ../api.env
   rm ../web.env ../api.env
   ```

   Run it before step 3 to get the exact values to set, and again after step 4.
   It prints OK or MISSING per tenant per feature, the value to set for each
   missing variable, and the names (never the values) of shared variables that
   are absent. Exit code 1 means not ready. Add `--include-optional` for a
   tenant that uses drawings.
6. **Rehearse** as the tenant's own users, in this order: move a lead to Won
   (the project is created), create a project, record a cost entry, create a
   customer invoice draft from the project, change a user's role. Each is a
   write that stops with a plain "not enabled for this tenant" message while its
   switch is closed.
7. **Smoke:** `gh workflow run smoke-prod.yml --ref main` (section 1, step 6).

Rollback: remove the tenant UUID from the lists. That stops those writes for the
tenant and changes no data.
