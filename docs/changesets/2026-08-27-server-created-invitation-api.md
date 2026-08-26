# Server-created invitation API and disposable role seed — 2026-08-27

## Scope

Agent 05 completed the ADR-030 application-caller handoff. The admin user
server action and the local-only role-account seed script now create a
database-backed invitation intent before asking Supabase Auth to create an
identity.

## Changed areas

- `apps/web/src/app/(dashboard)/admin/users/actions.ts`
  - derives tenant and inviter only from the authenticated server profile;
  - normalizes the email and validates the canonical role before writing an
    intent;
  - uses a 256-bit CSPRNG token, persists only its SHA-256 hash, and sets a
    24-hour expiry;
  - sends Auth exactly `provisioning_mode: 'tenant_invitation_v1'`, the opaque
    `tenant_invitation_token_v1`, and the optional full name in user metadata;
  - never sends the legacy app-metadata authority or a tenant, role, or inviter
    in Auth metadata;
  - leaves a single intent pending for unknown Auth outcomes and revokes it
    only after a definite 4xx Auth rejection.
- `scripts/seed-role-accounts.mjs`
  - provisions the 13 role-matrix identities through the same hash-only intent
    and Auth Admin API contract;
  - refuses a second active capability and does not directly repair profiles
    or memberships.
- Focused tests cover every canonical role, email normalization, exact Auth
  metadata, duplicate/unknown/known-error recovery, and absence of the legacy
  metadata marker.

## Verification

- PASS — `pnpm --filter @third-code-erp/web exec vitest run src/app/(dashboard)/admin/users/actions.test.ts`
  - 26 tests passed.
- PASS — `node --test scripts/seed-role-accounts.test.mjs`
  - seed contract requires CSPRNG + hash-only intent and rejects legacy metadata.
- PASS — `pnpm --filter @third-code-erp/web typecheck`.
- PASS — focused ESLint on the changed server action.
- PASS — `pnpm --filter @third-code-erp/database exec vitest run src/__tests__/tenant-invitation-auth-api.database.test.ts`
  - real disposable Supabase Auth Admin API: 4 tests passed, including all 13
    roles and fail-closed cases.
- PASS — clean disposable local project `erp-e2e-disposable` (API `55321`,
  database `55322`) reset and seeded with the role fixture through Auth Admin
  API. The post-seed SQL evidence confirms 13 profiles, one tenant, all 13
  roles, 13 consumed/zero usable intents, 13 default active memberships, no
  raw invitation tokens, no legacy marker, and no leftover Auth test probes.

## Handoff

→ Handoff to the release captain / authenticated-role-matrix owner. Reason:
the isolated environment is clean and contains all 13 correct Auth identities.
Inputs: `tmp/local-e2e-supabase` project, its non-versioned Supabase status
environment, and `scripts/fixtures/role-matrix-accounts.json`. Expected output:
run the authenticated Playwright role matrix against `http://127.0.0.1:55321`
using the local service-role key without exposing it, then report YES-GO only
if every role and required release gate passes.
