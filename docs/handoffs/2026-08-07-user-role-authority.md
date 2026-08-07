# User-role authority migration handoff

## Milestone

M3.149 moves role assignment from an unaudited, non-atomic Next.js write into
the NestJS modular monolith. The route stays disabled by default and can be
enabled only for explicit tenant UUIDs. User creation, password reset, and
deletion remain on their existing server paths; owner hierarchy guards are
tightened, but their authority migration remains later work.

## Sequence

1. **Supabase / PostgreSQL workstream**
   - Add a server-only role-assignment idempotency ledger.
   - Revoke `INSERT`, `UPDATE`, and `DELETE` on `public.users` from `public`,
     `anon`, and `authenticated`.
   - Remove tenant-only browser write policies while preserving tenant-scoped
     reads.
2. **NestJS Core API workstream**
   - Add `PATCH /v1/admin/users/:userId/role` behind `admin.users`.
   - Lock actor membership and target user in one database transaction.
   - Enforce tenant scope, owner hierarchy, stale-state protection,
     idempotency, and atomic semantic audit.
3. **Next.js compatibility-adapter workstream**
   - Add a fail-closed tenant canary selector and authenticated Core client.
   - Route role assignment through Core only when both gates match.
   - Preserve the existing server-side database path while the canary is off;
     never fall back after a Core failure.
4. **Security / QA workstream**
   - Prove browser roles have no user-table DML.
   - Prove role hierarchy, tenant isolation, replay, stale command rejection,
     disabled flags, audit atomicity, and invalid payload behavior.
5. **Architecture-memory workstream**
   - Record changed files, validation evidence, remaining risks, rollback, and
     the exact next action.

## State and authorization rules

- Assignable roles remain the original Third Code ERP role vocabulary.
- Only locked tenant members with `admin.users` may call the command.
- An admin may not assign `owner` or change an existing owner.
- An owner may assign or remove `owner`.
- An owner may remove another owner's role but cannot remove their own owner
  role; this prevents the workspace from losing its last owner.
- Admins cannot create, reset the password of, or delete an owner through the
  compatibility actions.
- An actor may not demote their own role below `admin`.
- `expectedRole` must match the locked target row or the command returns a
  conflict without mutation.
- Repeating one idempotency key with the same command replays the stored result.
- Reusing one idempotency key for another command returns a conflict.
- A no-op role assignment records the replay result but emits no mutation audit.

## Acceptance criteria

- Migration replays from an empty PostgreSQL database.
- `authenticated` keeps tenant-scoped `SELECT` on `public.users` but has no
  direct `INSERT`, `UPDATE`, or `DELETE` privilege.
- The idempotency ledger has forced RLS, no browser policies, and service-only
  grants.
- Core route is disabled by default and restricted to UUID tenant allowlists.
- Role mutation and semantic audit commit in one transaction.
- Web compatibility path remains operational while the canary is disabled.
- Focused tests, full tests, lint, typecheck, production build, security gates,
  and provider-spend gates pass locally.
- No hosted database mutation or deployment occurs during development.

## Rollback

1. Keep both Core and Web canary flags `false`.
2. Revert application commits if needed; the legacy server path remains.
3. Do not restore browser DML. If an emergency compatibility rollback truly
   requires it, apply a reviewed forward migration that restores the exact
   prior grants and policies, then remove it after the server path is repaired.
