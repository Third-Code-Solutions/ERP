# Production integration fail-closed contract

Date: 2026-08-13

## Changed

- Resend email adapter now rejects missing production credentials instead of
  returning a fake success identifier.
- Semaphore SMS adapter now rejects missing production credentials instead of
  reporting a sent message.
- Development/test stubs remain explicit and observable outside production.
- DocuSeal direct helper already follows the same production fail-closed rule;
  canvas signing remains production-capable.

## Verification

- PASS: Resend adapter tests, 2/2.
- PASS: Semaphore adapter tests, 2/2.
- PASS: DocuSeal/canvas routing tests, 4/4.
- NOT RUN: live Resend/Semaphore delivery. Credentials unavailable; no
  external messages were sent.
