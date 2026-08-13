# Canvas signing production contract

Date: 2026-08-13

## Changed

- Corrected unified signing metadata: in-app canvas signatures are real
  persisted one-shot signing sessions, not DocuSeal development stubs.
- Kept direct unconfigured DocuSeal submissions explicitly marked as stubs for
  legacy callers.
- Added routing tests covering both paths.

## Verification

- PASS: signing integration tests, 2/2.
- NOT RUN: live DocuSeal submission. No DocuSeal production credentials were
  available; canvas signing remains the configured zero-infrastructure path.
