# Runbook: Multi-Tenant Isolation

**Owner:** Platform / Security
**Severity if breached:** SEV-1 (cross-tenant data leak)
**Non-negotiable:** GOAL §1 — RLS on every table; isolation proven by automated tests.

---

## TL;DR

BuildOps isolates tenants at **two** independent layers. You must understand
which layer applies to which code path.

| Path | DB role | RLS applies? | Isolation mechanism |
|---|---|---|---|
| **Drizzle SSR** (`packages/database` `db`, via `DATABASE_URL` Supavisor pooler) | `postgres` (table owner) | **NO** — owner bypasses RLS | Explicit `WHERE tenant_id = …` in every query |
| **supabase-js / PostgREST** (`@buildops/auth` browser & server clients) | `authenticated` / `anon` | **YES** | RLS policies keyed on `auth_tenant_id()` |

> The `postgres` role bypasses RLS because no table has `FORCE ROW LEVEL
> SECURITY`. This is intentional: the SSR layer is trusted server code that
> resolves the caller's `tenant_id` from their session and filters explicitly.
> RLS is the **defense-in-depth** layer for any path that reaches the DB as
> `authenticated`/`anon` (client queries, PostgREST, Realtime).

## The two guarantees

1. **DB layer (RLS).** Every tenant-scoped table has RLS enabled and policies
   that compare `tenant_id` against `auth_tenant_id()` (the `tenant_id` of
   `auth.uid()`). `anon` (no JWT) sees nothing — deny by default.

2. **App layer (Drizzle).** Because the SSR pool connects as `postgres`, RLS
   does **not** protect it. Every Drizzle query that touches a tenant-scoped
   table MUST include `eq(table.tenant_id, tenantId)`, where `tenantId` comes
   from the authenticated session — never from request input.

## How isolation is proven (automated)

`packages/database/src/__tests__/rls-isolation.test.ts` (vitest):

- Seeds two probe tenants **inside a transaction that always rolls back** — it
  never mutates real data.
- Asserts (as the `authenticated` role): a user sees only its own tenant's
  rows; cannot INSERT into another tenant (WITH CHECK); cannot UPDATE another
  tenant's rows (USING filter).
- Asserts (as `anon`): sees nothing.
- Asserts every core table has `relrowsecurity = true`.

Run:

```bash
corepack pnpm --filter @buildops/database test
```

Requires `DATABASE_URL` (root `.env.local` or `apps/web/.env.local`). The suite
auto-skips with a warning if it is unset, so CI without DB creds won't false-fail.

## Reviewer checklist (every PR touching data access)

- [ ] New Drizzle query on a tenant-scoped table filters by `tenant_id` from session.
- [ ] `tenant_id` is never taken from user-supplied request body/query params.
- [ ] New table: RLS enabled + tenant policies added to the live DB.
- [ ] New table added to the `core` list in the RLS isolation test.

## If a cross-tenant leak is suspected (SEV-1)

1. Identify the leaking query. Grep the route/action for `db.select|query|insert|update`.
2. Confirm whether it filters by `tenant_id`. If not → that is the leak.
3. Patch: add `eq(<table>.tenant_id, session.tenantId)`. Deploy hotfix.
4. Quantify exposure via `audit_log` (who read what, when).
5. Add a regression test to the isolation suite. Postmortem (blameless) in `/docs/postmortems/`.

## Known gaps / follow-ups

- The repo's `packages/database/src/sql/rls-policies.sql` covers the original 13
  core tables. The live DB has policies on all 58 tables (added out-of-band).
  Regenerate a complete policy snapshot from the live DB to close the drift
  between source and reality.
- No static lint yet enforces "Drizzle query ⇒ tenant filter". The isolation
  test + reviewer checklist are the current controls; a custom ESLint rule or
  a `withTenant(db, tenantId)` wrapper would make it structural.
