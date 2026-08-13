# M3.0 Change Request database evidence

## Scope

Add disposable PostgreSQL proof for the closed-by-default NestJS Change
Request command. No hosted database, provider, feature flag, queue, or UI
cutover is part of this changeset.

## Changed files

- `apps/api/integration/change-request.database.integration.spec.ts`
- Architecture and operations memory docs.

## Acceptance evidence

- Two tenants are seeded inside one transaction.
- A same-tenant Admin creates one Change Request and a replay returns the
  stored result without a second row or notification.
- Reusing the key with a different command conflicts.
- A Viewer is denied and a cross-tenant opportunity is not disclosed.
- One design-role in-app notification and one semantic audit row are present.
- The outer probe always rolls back.
- Local API typecheck passes; serial API validation passes 27 files / 126
  tests with the integration test explicitly skipped without disposable
  credentials.

## Remaining gate

Run the integration test in CI's disposable Postgres 17 lane. Keep hosted
Supabase at its current ledger until the controlled release planner is clear
and the owner supplies audit-recovery tenant and duplicate Purchase Order
remediation decisions.
