# Deployment

This guide walks through bringing Third Code ERP from an empty cloud account to
a working production stack. The platform spans four hosted services:

| Service | What it runs | Why |
|---|---|---|
| Vercel | `apps/web` (Next.js 15) | Edge runtime, ISR, server actions |
| Supabase | Postgres, Storage, Auth, Realtime | Single multi-tenant data plane |
| Inngest | Background jobs + crons | SLA, cadence, warranty automation |
| Railway | `apps/workers/dxf-parser` (Python) | DXF / Togal parsing offload |

DocuSeal, Resend, and Semaphore are optional and only need to be
provisioned when their feature is enabled.

---

## 1. Supabase Project

1. Create a new project at `app.supabase.com`. Pick the closest region
   to manila (`ap-southeast-1`).
2. From `Project Settings → API`, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server only)
3. Enable the `pgvector` extension via `Database → Extensions`.
4. Install the CLI and link locally:

   ```bash
   brew install supabase/tap/supabase
   supabase login
   supabase link --project-ref <ref>
   ```

5. Apply migrations in order (see [Migration Order](#migration-order)):

   ```bash
   supabase db push
   ```

6. Create the storage buckets referenced in
   `supabase/migrations/20260509173356_storage_buckets.sql`. The
   migration script creates them, but verify under
   `Storage → Buckets` that `project-docs`, `bom-exports`,
   `signatures`, and `turnover` exist and are private.

---

## 2. Vercel Project

1. From `vercel.com/new`, import the GitHub repo.
2. Set `Root Directory` to `apps/web`.
3. Framework preset: `Next.js`. Build command: `pnpm build`. Install
   command: `pnpm install --frozen-lockfile`.
4. Add every variable from
   [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md). At minimum:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`
   - `NEXT_PUBLIC_SITE_URL` (your production domain)
5. Add the production domain in `Settings → Domains` and update
   `NEXT_PUBLIC_SITE_URL` to match. Portal share links and email CTAs
   use this value.

---

## 3. Inngest

1. Create an Inngest app at `app.inngest.com`. The app id is
   `third-code-erp` (configured in `apps/web/src/lib/inngest.ts`).
2. Under `Manage → Event Keys`, copy the production key into Vercel as
   `INNGEST_EVENT_KEY`.
3. Under `Manage → Signing Key`, copy the signing key into Vercel as
   `INNGEST_SIGNING_KEY`.
4. Connect the deployment by hitting
   `https://<your-domain>/api/webhooks/inngest` once from the Inngest
   console — it will introspect the registered functions:
   - `sla.tick` (every 30 min)
   - `cadence.daily` (07:00 PHT)
   - `warranty.cnps` (hourly)
   - `permits.staleness` (08:00 PHT)
5. Confirm the functions appear under `Functions` with status
   `Active`.

---

## 4. Railway (DXF Parser, Optional)

Skip this if you don't need DXF / Togal parsing on day one — BOM rows
can still be created manually.

1. Create a Railway project, point it at `apps/workers/dxf-parser`.
2. Use the bundled `Dockerfile`. Build command is inferred.
3. Add env vars:
   - `PARSER_SHARED_SECRET` (must match the value in Vercel)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
4. Expose a public URL. Set Vercel's `PARSER_URL` to that value.
5. Smoke test: `curl -X POST $PARSER_URL/health` returns `{"ok": true}`.

---

## 5. DocuSeal (Optional)

When `DOCUSEAL_API_URL` is set, the BOM client portal and turnover
package replace the built-in canvas signature pad with a DocuSeal
envelope flow.

1. Create a Railway service from the `docuseal/docuseal` Docker image.
2. Mount a persistent volume for `/data/docuseal`.
3. Set `DOCUSEAL_API_URL` (e.g. `https://docuseal.actuate.ph`) and
   `DOCUSEAL_API_KEY` in Vercel.
4. Generate `DOCUSEAL_WEBHOOK_SECRET` (any 32-byte hex string) and set
   it in both Vercel and DocuSeal `Settings → Webhooks`.
5. Point the DocuSeal webhook URL at
   `https://<your-domain>/api/webhooks/docuseal`.

---

## Migration Order

`supabase/migrations` is the only ordered deployment authority. Never maintain
or apply a second manual migration list. The PostgreSQL 17 reproducibility job
rebuilds the database from zero, requires every database test to execute, and
asserts an empty schema diff.

The authorized Supabase target was reconciled on 2026-07-28 and now reports
44/44 repository migrations, no unexpected versions, and a green protected
catalog verifier. Future releases still require the read-only planner,
reviewed SQL, backup/rollback evidence, and the procedure in
[`database-release.md`](runbooks/database-release.md). Never use hosted
`db reset` or ad hoc `migration repair`.

The incremental Project-write migration uses a separate tenant-scoped canary
and rollback procedure. Follow
[`project-write-cutover.md`](runbooks/project-write-cutover.md); never enable
the global flag without a reviewed tenant allowlist.

---

## Edge Functions (Legacy)

Three Supabase Edge Functions remain available for environments that
cannot reach Inngest. The Inngest path is now the preferred deploy.
Full instructions live in
[`supabase/functions/README.md`](../supabase/functions/README.md).

```bash
supabase functions deploy sla-checker
supabase functions deploy permit-staleness-checker
supabase functions deploy cnps-survey-sender
```

Disable the corresponding Inngest function when you flip on the edge
function for that job — running both will double-fire notifications.

---

## Smoke Test Checklist

After every production deploy, hit these endpoints in order:

| URL | Expected |
|---|---|
| `GET /` | 200; sign-in screen renders |
| `GET /api/health` | Process liveness: `{"ok": true, "service": "third-code-erp-web"}` |
| `GET /api/ready` | Database readiness: `{"ok": true, "database": "up"}` |
| `POST /api/webhooks/inngest` (from Inngest dashboard) | 200 with registered functions list |
| `GET /(dashboard)/dashboard` | KPI cards load within 2s |
| `GET /(dashboard)/crm/accounts` | Accounts table renders |
| `GET /portal/bom/<token>` (with a seeded token) | Client BOM portal loads, no auth required |

If any step fails, check Vercel function logs first, then Supabase
`Logs → Postgres`.

---

## Rollback

Vercel keeps every deployment immutable. To roll back:

1. Open `vercel.com/<team>/<project>/deployments`.
2. Find the last known-good deployment.
3. Click `Promote to Production`.

The migration ledger does not provide reliable paired down scripts. Never run
`supabase db reset --linked` against a hosted environment.

For a fully understood additive defect with intact data, use a reviewed
forward-only fix migration. For destructive, uncertain, or integrity-affecting
outcomes, restore the recorded pre-release backup/PITR point and expect
downtime. Database restore does not restore deleted Storage objects. Follow
[`database-release.md`](runbooks/database-release.md).

---

## Monitoring (Recommended)

Not committed yet — add when the customer load justifies the spend:

- **Sentry** for frontend + server errors (`@sentry/nextjs`)
- **Axiom** or **Better Stack** for structured logs
- **Better Stack Uptime** with a 1-minute check on `/api/health`
- **PagerDuty** wired to Better Stack for SEV-1 paging

When wiring Sentry, set `SENTRY_DSN` in Vercel and source maps will be
uploaded automatically by the build pipeline.
