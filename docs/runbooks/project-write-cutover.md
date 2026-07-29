# Project Write Cutover

## Scope

This runbook controls only the incremental Project-update migration from the
legacy Next.js Server Action write path to the NestJS transaction authority.
It does not authorize any other ERP command, tenant, worker, or Python write.

Two independent gates are required:

- `ERP_PROJECT_WRITES_VIA_API=true`
- `ERP_PROJECT_WRITES_VIA_API_TENANT_IDS` contains the authenticated tenant UUID

Both checks execute server-side after the authenticated user's tenant is read
from PostgreSQL. Missing, empty, malformed, or non-matching allowlists fail
closed to the legacy path. `*` enables every syntactically valid tenant only
when it is the sole allowlist entry.

## Entry gates

Do not change either production variable until every item is attached:

1. Reviewed Web and API release SHAs.
2. Clean PostgreSQL 17 and Redis CI lane with zero skipped database tests.
3. Current linear migration ledger and green catalog verifier.
4. Railway `/health` and `/ready` return 200.
5. Vercel production and Web Analytics return 200.
6. Live 401, 403, cross-tenant 404, stale 409, authorized 200, audit actor,
   hash-chain, correlation-log, and exact-value restoration evidence.
7. Designated demo tenant, owner, Project, and recovery operator.
8. Complete mutable Project baseline and tenant audit tail captured read-only.
9. Last known-good Vercel and Railway deployment IDs recorded.
10. Maintenance window, operator, verifier, abort authority, and communication
    channel recorded.

Abort when any item is missing. Production data is never a disposable test
fixture.

## Pre-cutover snapshot

Use read-only SQL through an approved operator connection. Substitute values
through the client parameter mechanism; never paste credentials into commands
or logs.

```sql
begin read only;

select
  id,
  tenant_id,
  name,
  client,
  status,
  project_type,
  total_sqm,
  location,
  notes,
  updated_at
from public.projects
where tenant_id = :'tenant_id'::uuid
  and id = :'project_id'::uuid;

select id, hash, prev_hash, created_at
from public.audit_log
where tenant_id = :'tenant_id'::uuid
order by id desc
limit 1;

select count(*) as project_audit_count
from public.audit_log
where tenant_id = :'tenant_id'::uuid
  and entity_type = 'projects'
  and entity_id = :'project_id'::uuid;

commit;
```

Store evidence in the approved release artifact. Do not commit business values
or tenant identifiers to Git.

Run the redacted target gate from a trusted operator workstation:

```powershell
$env:CANARY_TENANT_ID = '<approved tenant UUID>'
$env:CANARY_PROJECT_ID = '<approved Project UUID>'
$env:CANARY_ACTOR_ID = '<approved actor UUID>'
node --env-file=.env.local scripts/plan-project-cutover.mjs --require-ready
Remove-Item Env:CANARY_TENANT_ID,Env:CANARY_PROJECT_ID,Env:CANARY_ACTOR_ID
```

The command opens a repeatable-read, read-only transaction and prints opaque
references plus control results only. Exit code `2` means a rollout blocker.
It does not replace the restricted complete-value baseline needed for exact
restoration.

As of 2026-07-29, neither existing tenant is eligible. The main demo tenant has
historical predecessor/hash mismatches; the clean QA tenant has no application
user or Auth identity. Use a dedicated canary tenant created through the
approved supported onboarding path. Never rewrite append-only history to pass
this gate.

## Dedicated canary onboarding

This step changes Auth and business state. Obtain explicit approval for one
unused user-controlled email identity before starting.

1. Confirm the hosted database release plan is current at migration
   `20260729051205` and the signup trigger is enabled.
2. Confirm `public.handle_new_user()` has `search_path=""`, client roles cannot
   execute it directly, and `service_role` retains execution.
3. Keep both Project routing gates disabled.
4. Open the canonical `/auth/signup` page and create the canary account through
   the product form.
5. Complete the email confirmation using the user-controlled inbox.
6. Sign in and verify the dashboard resolves the new Admin profile without an
   account-provisioning error.
7. Create one clearly labeled, non-critical E2E Project through
   `/projects/new`.
8. Capture the resulting tenant, actor, and Project UUIDs only in the
   restricted release artifact.
9. Run the read-only planner with `--require-ready`. Stop unless it reports
   zero blockers and a genesis-rooted, fully verified chain.

Do not create or modify `auth.users`, `public.tenants`, `public.users`,
`public.projects`, or `public.audit_log` through operator SQL for this setup.

## Tenant canary

1. Keep `ERP_PROJECT_WRITES_VIA_API=false`.
2. Set `ERP_PROJECT_WRITES_VIA_API_TENANT_IDS` to only the approved demo tenant
   UUID in Vercel Production.
3. Deploy and verify the canonical alias. Because the global flag remains
   false, every tenant still uses the legacy path.
4. Reconfirm Railway readiness, Vercel health, and the pre-cutover snapshot.
5. Set `ERP_PROJECT_WRITES_VIA_API=true` in Vercel Production.
6. Wait for the new production deployment to become READY and own the canonical
   alias.
7. Through the authenticated Web UI, update one non-critical demo Project
   field. Capture the returned user-visible result and corresponding UUID
   correlation log.
8. Verify the committed row, tenant, actor, action, diff keys, predecessor
   hash, and full tenant chain.
9. Restore every original business value through the same Web-to-Nest path
   using the latest optimistic timestamp.
10. Reconcile both append-only audit rows and retain the expected
    `updated_at` advance.
11. Confirm a non-allowlisted tenant remains on the legacy selector using
    automated branch tests. Do not mutate another tenant to prove exclusion.

## Reconciliation

Run after the canary update and again after restoration:

```sql
with tenant_chain as (
  select
    id,
    tenant_id,
    actor_id,
    entity_type,
    entity_id,
    action,
    diff,
    prev_hash,
    hash,
    lag(hash) over (partition by tenant_id order by id) as predecessor_hash
  from public.audit_log
  where tenant_id = :'tenant_id'::uuid
)
select
  count(*) filter (
    where entity_type = 'projects'
      and entity_id = :'project_id'::uuid
  ) as project_rows,
  bool_and(prev_hash = predecessor_hash) as chain_continuous,
  bool_and(actor_id = :'actor_id'::uuid) filter (
    where entity_type = 'projects'
      and entity_id = :'project_id'::uuid
  ) as actor_valid,
  bool_and(action = 'update') filter (
    where entity_type = 'projects'
      and entity_id = :'project_id'::uuid
  ) as action_valid
from tenant_chain
where id > :'baseline_audit_id'::bigint;
```

Expected controlled round trip:

- final business fields equal the captured baseline;
- final `updated_at` is later than the baseline;
- exactly two new Project audit rows exist;
- both rows identify the authorized same-tenant actor;
- first diff changes only the chosen field and `updated_at`;
- second diff restores that field and advances `updated_at`;
- each `prev_hash` equals its immediate tenant predecessor.

## Rollback drill

1. Set `ERP_PROJECT_WRITES_VIA_API=false` before changing the allowlist.
2. Wait for the rollback Vercel deployment to become READY and own the
   canonical alias.
3. Confirm the exact-disabled selector with automated tests and one designated
   demo Web update only if the release owner explicitly requires runtime proof.
4. Restore that demo value and reconcile its legacy application audit.
5. Clear `ERP_PROJECT_WRITES_VIA_API_TENANT_IDS` only after the exact-disabled
   deployment is verified.
6. Reconfirm frontend, Analytics, Railway health/readiness, Supabase data, and
   absence of new error logs.

Keep the last known-good Vercel deployment available throughout. API rollback
uses the recorded Railway deployment only when the API itself is defective;
otherwise leave the healthy API deployed and disable routing at the Web gate.

## Abort conditions

Immediately restore `ERP_PROJECT_WRITES_VIA_API=false` on:

- readiness or deployment failure;
- wrong tenant or actor;
- unauthorized or cross-tenant visibility;
- unexpected diff keys or record drift;
- missing or discontinuous audit hash;
- stale-write behavior other than 409;
- uncorrelated command outcome;
- restoration failure;
- any non-demo Project mutation.

Restoration of the exact business baseline has priority over diagnostics.
Append-only audit rows are evidence and are never deleted.
