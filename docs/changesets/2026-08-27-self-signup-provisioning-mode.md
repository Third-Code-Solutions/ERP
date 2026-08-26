# Explicit browser self-signup provisioning mode

## Scope

- Send `provisioning_mode: 'self_signup_v1'` in the browser Supabase signup
  metadata alongside only the existing non-authoritative profile fields.
- Preserve existing confirmation, immediate-session, and user-safe error
  handling.
- Add focused route-contract tests that reject tenant, role, inviter, legacy
  marker, and invitation-token metadata.

## Verification

- `pnpm --filter @third-code-erp/web exec vitest run 'src/app/(auth)/auth/signup/signup-form.test.ts' 'src/app/(auth)/auth/signup/signup-validation.test.ts' 'src/app/(auth)/auth/signup/signup-options.test.ts'` — passed (8 tests).
- `pnpm --filter @third-code-erp/web typecheck` — passed.
- Disposable local Supabase Auth Admin API proof — passed (4 tests), including
  the explicit self-signup branch and all invitation hardening cases.

## Handoff

→ Handoff to Agent 05. Reason: invitation callers must create and validate the
server-side intent before their Auth Admin create-user call. Inputs: ADR-030,
the accepted database trigger contract, and the browser's explicit
`self_signup_v1` metadata contract. Expected output: server-only invitation
creation that sends only `tenant_invitation_v1` plus an opaque one-use token in
user metadata.
