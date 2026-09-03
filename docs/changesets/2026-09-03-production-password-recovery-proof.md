# Production password-recovery request proof

## Change

- Added an opt-in Playwright case that opens the approved ABI OPS production
  alias, submits exactly one unmocked Supabase password-recovery request for the
  configured E2E user, requires an HTTP-successful provider response, and verifies
  the enumeration-safe success state.
- The test does not inspect a mailbox, consume a recovery link, or expose the
  configured address or any credential in output.
- Default local and CI suites skip the delivery-producing case.

## Invocation contract

Set all of the following only in the explicit production proof step:

- `E2E_REAL_PASSWORD_RECOVERY=1`
- `PLAYWRIGHT_BASE_URL=https://thirdcode-erp.vercel.app`
- `E2E_USER_EMAIL` to the dedicated production E2E identity

No password is required for this proof.
