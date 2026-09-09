# Production email configuration

Configured the verified Resend sender `ABI OPS <abi-ops@thirdcodesolutions.com>`
with a dedicated sending-only, domain-scoped key. Saved the key in Supabase
Auth custom SMTP and the production secret stores for Vercel Web and Railway
Core API. No credentials are included in this changeset, and no account
passwords were changed.

Corrected the environment reference from `RESEND_FROM_EMAIL` to the actual
`EMAIL_FROM` variable and documented the separate Auth SMTP setup and delivery
verification procedure.

## Verification

- **PASSED:** Supabase SMTP settings persisted after reload.
- **PASSED:** Direct Auth recovery email delivered; Resend message
  `58729364-4af6-42df-aae1-77650886a54d`.
- **PASSED:** Production ERP recovery Playwright test, one test in 7.6 seconds,
  against revision `58c5beda6041`. Matching Resend message
  `ca6ca9b9-ed64-4065-a219-26dd9f036742` was delivered.
- **PASSED:** Production application configuration is present, Web/API/CAD
  deployments and health checks in release `34374826432` succeeded.
- **FAILED:** That release's strict authenticated browser gate rejected one
  flaky dashboard hydration check (React 418, then a passing retry). Eleven
  other tests passed with no skips. Recovery was verified independently after
  the workflow stopped; the entire release is not marked green.
- **NOT RUN:** Every transactional procurement/notification email workflow;
  Auth email proof does not establish those business journeys.
- **EXCLUDED:** Demo-account password rotation, as explicitly requested.

The dashboard failure is tracked in the
[hydration handoff](../handoffs/2026-09-10-dashboard-hydration.md).
