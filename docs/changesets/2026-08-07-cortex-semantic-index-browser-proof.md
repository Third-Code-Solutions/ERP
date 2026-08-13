# M3.157 Cortex semantic-index browser proof

## Change

- Centralize server-owned visibility and exact-tenant enablement for the Cortex
  semantic-index control.
- Add a localhost-only Vite gallery and dedicated Playwright lane importing the
  real production component and CSS.
- Prove desktop/mobile confirmation, cancel, request, polling, success, and
  terminal failure without hosted Auth or provider traffic.

## Validation

- Focused role/control tests: 6/6.
- Local Playwright: 5/5.
- Web: 637/637.
- Workspace lint/typecheck: pass.
- Local NestJS/Next.js build: pass, 82 static pages.
- Provider-spend 4/4 and controlled-release 5/5: pass.
- Actionlint, Gitleaks across 540 commits, pinned workflow refs, diff checks,
  and clean-room scan: pass.
- External requests, hosted mutations, and provider calls: zero.

## Evidence boundary

This proves server access projection and real browser component behavior. It
does not prove a full authenticated `/cortex` route session. Production flags
remain closed.

## Rollback

Revert the access projection, gallery/config/test files, Vite dev dependency,
and documentation. Restore the inline page condition. No database, provider,
environment, hosted, or deployment rollback is required.
