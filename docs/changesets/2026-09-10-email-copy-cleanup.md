# Email copy and delivery presentation

## Outcome

- Standardized ABI OPS transactional email markup in the web and Core API senders.
- Added a responsive, table-based layout with ABI OPS and Actuate Builders Inc. identity, readable hierarchy, visible calls to action, preheader text, and a plain-text alternative.
- Replaced generic or ambiguous wording with direct status, next-step, and expiry language.
- Escaped dynamic names, notes, subjects, and URLs before inserting them into HTML.
- Kept purchase order amounts in PHP with centavo precision.

## Provider configuration

In the Supabase Authentication email templates for project `aqqrtkmtcsfkbyyqxowv`, the following production templates were updated and reloaded to verify persistence:

- Confirm sign up
- Invite user
- Magic link or OTP
- Change email address
- Reset password
- Reauthentication

Security notification switches were left at their existing provider state. Their copy was not enabled or changed as part of this release.

## Verification

- `pnpm --filter @third-code-erp/web exec vitest run src/lib/operations/integrations/resend.test.ts` passed: 4 tests.
- `pnpm --filter @third-code-erp/api exec vitest run src/procurement/notification-email.service.spec.ts` passed: 6 tests.
- Web and API TypeScript checks passed.
- ESLint passed for the changed production source files.
- `git diff --check` passed.
- Supabase template reload checks confirmed the saved subjects and bodies listed above.

