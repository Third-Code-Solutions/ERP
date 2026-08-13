# Notification delivery evidence hardening

## Outcome

External email notifications now create pending evidence before provider
delivery and set `sent_at` only after a real provider response. Development
stubs and provider failures remain pending. In-app notifications are preserved
when optional email delivery fails; the failure is emitted as structured server
logging instead of aborting the unrelated business mutation.

CNPS survey dispatch follows the same contract: survey `sent_at` is written
after successful provider delivery, so failed sends remain eligible for retry.
Purchase Order supplier-email evidence now uses the returned delivery status,
so development stubs and failed sends cannot stamp `supplier_email_sent_at`.

## Verification

- PASS — notification evidence tests (3/3).
- PASS — procurement action regression tests (6/6).
- PASS — CNPS delivery evidence tests (3/3).
- PASS — web typecheck.
- NOT RUN — live Resend delivery; credentials and provider acceptance were not
  available in this environment.
- NOT RUN — hosted database mutation; migration/data gates remain open.
