# Inspection draft ownership and durable retries

## Changes

- Bind inspection drafts to server-derived actor, tenant and opportunity. Preserve
  unscoped legacy records without silently reading, adopting or deleting them.
- Validate persisted fields, photo bytes and identifiers. Wait for IndexedDB
  transaction completion; use revisions and retained tombstones to reject stale
  writes from other tabs. Never report aborted or failed writes as saved.
- Persist confirmed photo receipts without overwriting them after partial upload
  failure. Removing a selected photo removes its receipt from the next report.
- Persist immutable pending report contents before dispatch. Unknown outcomes and
  mismatched acknowledgements retain the exact submission through reload/retry.
- Check optional expected-owner preconditions at existing Web upload and submit
  boundaries. The form always supplies them; they never replace authorization.
- Invalidate obsolete forms during unmount commit, before subsequent async effects.
- Preserve explicit online-only use when browser IndexedDB is missing, with clear
  unsaved warnings. This mode does not bypass corrupt data, blocked reads or CAS
  conflicts and does not claim reload recovery.
- Add the credential-free browser regression suite to the existing gated CI job.

## Verification

- PASSED: 142 focused Web tests, no skips, Node 22.
- PASSED: 34 real Chromium checks (15 new inspection cases, 19 adjacent RFI
  cases), no retries/skips; includes real IndexedDB and controlled server endpoints.
- PASSED: full Web/application/E2E type checks and source ESLint.
- PASSED: ten CI invariant tests and checksum-pinned Actionlint.
- PASSED: independent required-defect review and responsive/keyboard inspection
  at 320, 768, 1024 and 1440 pixels.
- Behavioral RED was reproduced for initial editable-before-hydration, missing
  owner guards, and absent explicit unsaved mode. Helper tests initially failed
  against the obsolete API; real transaction-failure behavior was verified after
  integration in Chromium.

## Release and limitations

### Contract-check follow-up

Hosted run 34719087575 exposed obsolete WO-12 structural expectations for the
old form. Reuse the existing strict owner schema at module scope; retain the
imported-helper write guard. Update structural checks for durable pending commands,
owner-bound acknowledgement, transaction-complete cleanup and immutable retries.
Add five negative mutation cases; all 88 WO-12 contract cases pass locally.
The broader script run also exposed daily-task mutation fixtures sensitive to
Windows line endings and a non-unique fetch target. Normalize fixture input and
target the daily-task endpoint explicitly, without changing application behavior.
The owner-schema refactor passes all 76 action tests, Web type checks and ESLint.

Hosted CI must run on the final commit. No production deployment or migration is
claimed. Current production ledger is 169/173; the four claim/KYC/WAR migrations
still require the database release runbook's recovery evidence. Available WSL
PostgreSQL 17 tools and protected credentials are not proof of a restorable backup.

Browser tests use controlled synthetic endpoints, not authenticated production
accounts. These checks do not prove Storage object existence/byte verification,
large-file production transport limits, full WO-12 acceptance or the full ERP.
Legacy unscoped device drafts remain retained but are not automatically attributed.

Recovery preserves scoped records, pending commands and revision tombstones. Do
not revert to opportunity-only draft keys or erase unknown submissions to unlock
editing. Roll forward; retain existing server authorization and audit controls.
