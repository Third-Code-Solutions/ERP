# Tenant invite provisioning (P0 auth `handle_new_user`)

Scope: the admin invite path created an orphan tenant per invited user instead of
provisioning into the inviter's tenant, and the server action then tried to insert
the `public.users` row a second time. Fix the trigger, keep tenant/role authority
server-side, and prove the invariant with regressions against a real schema. No
production deploy and no real demo requests are included.

## Changes

- `supabase/migrations/20261020190000_tenant_invite_provisioning.sql` re-validates
  the invite claim (`raw_app_meta_data.erp_invite`) inside the same transaction as
  the `auth.users` insert: tenant, inviter, role and claim shape are checked
  before any row is written, so a browser-supplied tenant or role can never reach
  `public.users` through this trigger.
- Same migration fails closed when `raw_app_meta_data` is not a JSON object:
  `raise exception ... using errcode = '22023'`, message
  `raw app metadata must be a JSON object`. A double-encoded claim used to yield
  `null` from `-> 'erp_invite'` and silently self-sign the invitee into a fresh
  tenant; it now aborts the auth insert instead.
- Migration header documents the rollback path (replace the function; re-apply the
  prior definition from `20260729054456_persist_signup_organization_type.sql`),
  the absence of any table/column/data change, mixed-version safety (atomic
  `create or replace`) and retry idempotency (`drop trigger if exists` +
  `create or replace`, verified by re-applying the file on a migrated database).
- `packages/database/src/__tests__/tenant-invitation.test.ts`: inserts now pass
  JSON through `tx.json(...)` instead of `${JSON.stringify(...)}::jsonb`, so the
  driver serializes exactly once and the test can no longer mask the defect it is
  meant to catch. Added `expectRejected` (savepoint-scoped) for cases that must
  throw, coverage for malformed/incomplete claims, a deliberate double-encoding
  case asserting the `22023` guard, a suspension fixture that satisfies
  `users_inactive_status_reason_check` instead of loosening it, and an
  `audit_log` append-only regression.

## Verification and limits

- Gate chain `pnpm test` → `pnpm lint` → `pnpm typecheck` → `pnpm build` with
  `CI=1`: `TEST_EXIT=0` (15m42s; shared-types 93 files, database 94 passed / 18
  skipped, operations 3 passed), `LINT_EXIT=0` (`--max-warnings=0`),
  `TYPECHECK_EXIT=0` on the rerun after the test typing was corrected (the first
  pass was 2, both in `tenant-invitation.test.ts`, no app code), `BUILD_EXIT=0`
  (2 tasks successful).
- `supabase db reset` exit 0: all migrations applied through
  `20261020190000_tenant_invite_provisioning.sql`, `supabase/seed.sql` loaded,
  containers restarted. Local stack then served 214 public tables, Kong REST 200
  and Studio 307.
- `npx vitest run tenant-invitation.test.ts signup-provisioning.test.ts` with
  `DATABASE_URL` pointed at the local stack: 2 files, 20 tests passed. Without
  `DATABASE_URL` those 18 database files skip, which is why the gate must be run
  with the variable set for the RLS/trigger evidence to mean anything.
- Migration re-applied by hand on the migrated database: exit 0, trigger
  `on_auth_user_created` still present and valid.
- `supabase_vector_erp` restart-loops on this host (cannot reach the Docker socket
  at 192.168.65.254:2375). Log shipping only; it does not gate REST, Auth, Studio,
  migrations or the regressions above.

## Security review (2026-11-02)

Independent review of the 11 trial-hardening migrations found no CRITICAL issue.

**Fixed in this change set**

- MEDIUM: `a_platform_invited_user_provision` runs before `on_auth_user_created`
  and matched on email alone. A tenant admin could create an auth user for an
  address holding a pending platform invitation to another tenant, and the
  account landed in that other tenant before the `erp_invite` claim was checked.
  `provision_platform_invited_user()` now rejects (`42501`) an auth insert that
  carries `erp_invite` for an email with a pending platform invitation. Covered by
  `tenant-invitation.test.ts` (fails on the previous definition, passes now; the
  plain-signup invitation path is asserted unchanged).

**Open, owner decision or pre-deploy work**

- MEDIUM, deploy: `20261011152153` (`bom_line_items.quantity` to numeric) and
  `20261011153424` (`po_line_items`) rewrite tables under ACCESS EXCLUSIVE and
  reprice every draft BOM line. Dry-run against a production snapshot and apply in
  a maintenance window. Remote Postgres is 17.6, so `revoke ... maintain` is valid.
- MEDIUM, accepted for now: `service_role` keeps INSERT on
  `platform_role_assignments`, so the platform-owner bootstrap is exclusive only
  while the service-role key stays secret. That key is already root-equivalent.
  Revisit if the key is ever exposed beyond the Core API.
- LOW: `price_bom_line_exact` / `refresh_bom_aggregates_exact` look up `boms` by id
  without `tenant_id`; issuance guards do not cover a direct INSERT as `issued`;
  `withholding_bps default 200` is back-filled onto existing invoices; upload quota
  takes `FOR UPDATE` on the project row per upload.
