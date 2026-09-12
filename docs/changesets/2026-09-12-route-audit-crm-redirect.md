# Changeset: canonical CRM redirect readiness

## Change

- Add `/crm` → `/crm/accounts` to the explicit route-audit redirect contract.
- Require each intentional redirect to reach its canonical pathname and show
  the target page's visible heading and identifying content within the existing
  bounded readiness budget.
- Keep redirect success strict: successful HTTP status, no access-denied or
  missing-page response, and no browser console/page errors. Add browser
  regressions for the real CRM target, a delayed streamed shell, and a wrong
  target that renders.

## Verification

- Focused TypeScript check for the changed audit spec: PASSED.
- Main-agent ESLint check under the repository's generic TypeScript rules via
  stdin: PASSED. Test files are excluded from the normal repository lint glob;
  a suppressed ignored-file warning is not lint coverage.
- Focused Chromium browser regressions using a local HTTP server (delayed
  streamed shell and wrong canonical target): 2 passed.
- Main-agent rerun: 2/2 Chromium regressions and focused strict TypeScript
  passed after replacing a wall-clock delay with a controlled shell-release
  action. Readiness still uses the existing 15-second budget.
- Production run `34693183232` (baseline `e45c1efc0464b2ce92fd01df7ed2b433b7cb9c7d`)
  recorded 11 expected, 0 unexpected, 0 skipped, and 1 flaky result. The
  `/crm` row failed on its first attempt with `FAILED response`, then passed
  on the Playwright test retry (route-local retries apply only to navigation
  timeouts, not `FAILED response`); this patch addresses the
  intermediate redirect readiness race without widening retries or timeouts.
- A new production release is not claimed by this changeset. Password recovery
  and rotation checks remain unverified, and the live audit must be rerun by
  the release owner.
