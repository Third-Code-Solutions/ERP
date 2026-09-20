# Tenant administrator lifecycle lock

## Outcome

Retained-history suspension and administrator-role demotion now share a
transaction-scoped PostgreSQL advisory lock keyed by tenant. Platform-admin
status changes, Core role assignment, and the legacy Web suspension action all
evaluate the last active `admin`/`owner` inside the write transaction before
calling Auth or committing a mutation.

## Safety behavior

- Suspending or demoting the last active workspace administrator is rejected
  with a conflict response and no Auth, row, or audit mutation.
- Platform-admin status updates re-read and lock the target after fresh support
  context admission, then write the user row and platform audit event
  atomically.
- Auth suspension is compensated when a later database or audit write fails.
- Existing platform-owner, self-action, tenant-scope, and retained-history
  restrictions remain enforced.

## Verification

- `pnpm --dir apps/api typecheck` — passed.
- `pnpm --dir apps/api exec vitest run src/admin/user-role-assignment.service.spec.ts src/platform-admin/platform-administration.service.spec.ts` — 25 passed.
- `pnpm --dir apps/api exec vitest run integration/platform-administration.database.integration.spec.ts` with the synthetic Postgres fixture — 1 passed.
- `pnpm --dir apps/api exec vitest run integration/user-role-lifecycle-admission.database.integration.spec.ts` with the synthetic Postgres fixture — 12 passed.
- `pnpm --dir apps/web exec vitest run 'src/app/(dashboard)/admin/users/actions.test.ts'` — 21 passed.
- Targeted ESLint — passed.
- Web typecheck — not run locally because the workspace requires Node 22 and this host exposes Node 24; hosted CI remains the authoritative check.

No migration or dependency was added. Production deployment remains held by the
documented database/Storage backup and isolated restore-rehearsal gate.
