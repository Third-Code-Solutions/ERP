# Schedule form ownership and retry

- Plan edits submit the existing assigned owner instead of silently converting its absence to an unassignment. Core tenant and owner validation remain authoritative.
- Manual task creation resets its inputs and rotates its request identity only after a verified successful action result. Validation failures and uncertain outcomes retain the entered values and request identity for safe retry. Explicit React transition dispatch prevents automatic uncontrolled-form resets on unsuccessful action results.
- PASSED isolated Chromium with the real register component and mocked actions: first create succeeds and rotates identity; the next distinct create returns uncertainty; retry retains exactly that second payload and identity; verified retry success rotates identity again. A plan edit submits its original owner.
- Added action regressions for owner preservation and unsuccessful/retry result contracts. No selector redesign, database change or deployment is part of this changeset.
- PASSED: schedule action suite (4 tests), Web TypeScript, focused register ESLint and diff check.
- Browser proof used a temporary harness outside the repository. Node 24 local checks require the existing engine override; Node 22 CI remains authoritative.
