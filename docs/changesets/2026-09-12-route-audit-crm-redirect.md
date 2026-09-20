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
- Production run `34696282451` succeeded for merged commit
  `81393e10a36ab4e2c322d6ec77c0f0bafef4282d`: 15/15 authenticated E2E tests,
  zero skipped, unexpected or flaky results. This includes the 11-role access
  matrix; it is not exhaustive visual or mutation coverage for every role.
- Real password recovery request passed 1/1. Password rotation/restoration
  passed 1/1, and the harness independently verified the original credential
  during cleanup. No credential value is retained in this changeset.
- Vercel production `dpl_3xdxedjE91CzU7ck4a4sbRyFTUue` is READY at that exact
  commit. Live Web health/readiness returned revision `81393e10a36a`; API,
  database, Redis and CAD health checks passed.
- Railway API candidate `d9c82c57-30bd-4768-b138-1d55960798d7` was SKIPPED
  with verified retained-identical source; active API remains
  `72b23828-37e4-42ee-b0a9-80221b511771` from `e45c1efc0464`.
  CAD deployment `cc0ff7b3-9f79-4fba-89b3-46887711792a` succeeded.
- Runtime error/fatal logs inspected from 13:35:24 to 13:44:14 UTC contained
  four Finance capability denials matching negative role probes, one unsigned
  Inngest GET rejection, and two profile authentication errors during password
  rotation/restoration. The profile action signs out the local session after
  password changes; login, restoration and cleanup verification passed. These
  entries are reported rather than described as a zero-error log window.
- This release includes the schedule changes from PR 65 and route-audit repair
  from PR 66. Claim-document changes in draft PR 67 are not deployed; their
  migration recovery and rehearsal gates remain separate.
