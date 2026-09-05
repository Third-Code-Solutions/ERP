# Settings: project finance, integration status and notification preferences

## Implemented scope

- Settings links authorized users to the existing project invoices, outstanding
  receivables, payment records and cash-entry workflows. No duplicate payment
  processor, subscription billing, direct paid-status mutation or GL expansion.
- Owners/admins can inspect Web configuration presence for Inngest, Resend,
  DocuSeal and Semaphore. Missing variable names are explicit. Values, sender
  addresses and configured URLs are never returned. Presence is not connectivity
  or delivery proof. Railway configuration is explicitly outside this panel.
- Own-account notification presentation preferences (all/unread, automatic
  refresh) are validated, audited and saved through Supabase's signed-in user
  client. User metadata is never used for authorization or mandatory delivery.
- The real bell applies saved preferences, retains manual refresh, and describes
  its 25-item recent window accurately. Approval/security/email/SMS generation
  and delivery remain unchanged.

Supabase persistence reference:
https://supabase.com/docs/reference/javascript/auth-updateuser
No migration, new dependency, paid plan, provider credential mutation or database
restoration. Missing email/SMS credentials remain provider setup requirements.

## Verification

- PASS: 31 focused tests (13-role Settings matrix, safe metadata parsing,
  presentation filtering, authenticated saves, audit/provider failure behavior,
  integration presence and secret redaction).
- PASS: Web lint and application/E2E types; Core API build.
- Expanded the local notification browser proof with preference save/reload,
  filtered/unfiltered bell and actual Settings controls. PASS with no browser
  errors or external requests; cross-tenant notification stayed unread.
- PASS: 1,773 web tests; two default-suite database skips passed separately.
- PASS: 10 targeted Core invoice/receivable/cash service tests.
- PASS: layout and panel bounds at 320, 390, 768, 1024 and 1440 pixels.
  Visual review caught and fixed the pre-existing mobile panel left-edge clipping.
- Local cold startup initially exceeded fixture boot limits; the notification
  harness now allows a bounded four-minute boot without changing assertion
  timeouts. Final unchanged browser run passed in 36.3 seconds.

## Release and rollback

Prerequisites: normal green PR merge; guarded production promotion; exact
database-ledger/dry-run checks (no migration expected); Vercel/Railway health and
revision checks; live Settings and finance reads. Do not send real payments,
emails or SMS as smoke tests. Prefer a dedicated test account for preference
save/revert verification.

Rollback: promote the preceding verified Web artifact. Additional Auth metadata
is presentation-only and ignored by the preceding version. Existing notification
history and accounting data are preserved. No schema rollback or data restore.
