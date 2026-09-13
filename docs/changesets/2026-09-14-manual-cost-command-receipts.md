# Manual cost command integrity

Preserves Core create/void/restore authority, manual-source restrictions, exact
total-cost semantics, immutable audit history, and existing receipt hashes.
No schema migration or dependency change.

## Changes

- Web validates decimal peso text without rounding fractional centavos, real
  calendar dates and canonical UUIDs before dispatch. Actor/tenant context is
  checked before new scoped UI commands reach Core.
- Creation and void return command-bound scoped receipts. Cache refresh failures
  remain committed successes with warnings. Transport, malformed-result and
  server failures remain unconfirmed; arbitrary infrastructure text is not
  reflected to users. Structured logs identify outcome without financial payloads.
- Cost form and table retain the exact command and request key after uncertain
  outcomes, prevent simultaneous commands and fence old actor/project responses.
  Imported and PO-derived entries remain system-managed; void is named honestly.
- Core locks and checks current active actor/tenant admission, binds replay to
  the original actor, and bounds lock waits. Receipt completion uses database
  time, preserving timestamp constraints despite application clock skew.
- CI includes the dedicated credential-free cost browser regression suite and
  its screenshots. Existing gates and production targets are unchanged.

## Verification

- PASSED: 48 Core cases (30 actual-Postgres integration, 18 unit), zero skips.
  Main independent verification caught three receipt timestamp failures after
  the initial agent green run; deterministic clock-skew regressions reproduced
  all three constraints before the database-time fix.
- PASSED: 49 Web action, transport and neighboring page cases, zero skips.
  RED evidence covers fractional cents, impossible dates, hidden committed
  success, raw exceptions, unconfirmed transport, scoped receipts and uppercase
  UUIDs; corrected behavior is covered by the final suite.
- PASSED: Web, E2E and dedicated integration TypeScript checks; source ESLint.
- PASSED: 8 Chromium browser cases, zero skips; rendered 320px form screenshot
  inspected with real application styles and keyboard focus. Independent review
  added a failing permission-loss regression, then preserved the original
  uncertain void command through temporary permission loss and recovery.
- PASSED: Actionlint and diff whitespace checks. Remote CI has not run for this
  commit yet; local verification is not a production deployment claim.

## Release status

Not deployed. Production backup/restore readiness and the coordinated release
gates in `docs/runbooks/database-release.md` remain unresolved. No production
data, migrations, feature flags or deployment state were changed by this slice.
