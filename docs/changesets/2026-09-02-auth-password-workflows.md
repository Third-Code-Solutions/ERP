# Auth password workflows

Date: 2026-09-02

## Outcome

Implemented a role-neutral password-recovery flow from sign-in and an
own-account password-change flow at `/settings/profile` for all thirteen
canonical roles. The application no longer relies on ordinary authenticated
sessions to enter the recovery page, and it does not trust callback redirect
input or a client-only recovery event.

Strict functional status: `PARTIAL`. Local implementation and non-mutating
browser coverage pass. Mailbox delivery/recovery-link completion and one live
persisted password rotation remain unverified.

## Changed areas

- Added `/auth/forgot-password` with email validation, one real Supabase
  `resetPasswordForEmail` operation, enumeration-safe success copy, and a
  visible generic provider-error state.
- Added `/auth/update-password` with password/confirmation validation and
  authenticated provider update.
- Restricted callback redirects to exact known paths. Recovery entry now
  requires the provider's recovery exchange plus recent recovery metadata.
- Added a ten-minute HttpOnly recovery marker bound to the verified user,
  session, access token, and recovery timestamp; middleware recomputes it and
  fails closed.
- Added `/settings/profile` for every authenticated role. Password change
  reauthenticates the same user with the current password, updates the provider,
  clears the recovery marker, and signs the local session out.
- Raised local Supabase password minimum length from 6 to 12 characters to
  match application validation. No hosted provider setting was changed.
- Added unit, middleware, callback, E2E contract, role-route, and opt-in guarded
  live-rotation coverage. The live harness keeps the service-role key out of
  Playwright and independently verifies or restores the original credential.
- Updated the functional RBAC inventory and work-state evidence.

No new package dependency or database/schema migration was introduced.

## Verification

| Gate | Result | Evidence |
| --- | --- | --- |
| Focused Vitest | PASSED | 6 files; 55 tests |
| Web TypeScript | PASSED | `pnpm --dir apps/web exec tsc --noEmit` |
| E2E TypeScript | PASSED | `pnpm --dir apps/web exec tsc --noEmit -p e2e/tsconfig.json` |
| Web source lint | PASSED | `pnpm --dir apps/web lint` |
| Production build | PASSED | Next.js 15.5.23; 89/89 static pages |
| Built-app auth E2E | PASSED | Chromium; 6/6 tests |
| Whitespace | PASSED | `git diff --check`; line-ending warnings only |
| Supplied-account browser matrix | PASSED | 11/11 accounts: real sign-in, dashboard, profile form, ordinary-session recovery denial, sign-out |
| Real reset request | PASSED | One provider request returned SDK success and enumeration-safe UI |
| Mailbox/recovery-link completion | BLOCKED | No mailbox access supplied |
| Live persisted password rotation | BLOCKED | Linux Chromium failed before initial login completed; the independent parent verified the original credential after each attempt |
| Production deployment | NOT RUN | ADR-020 requires reviewed `main` SHA and the protected production workflow |

The E2E files are outside the repository's flat ESLint configuration, so an
E2E ESLint result is `NOT RUN`; their dedicated TypeScript check passed.

## Browser coverage limits

The supplied identities cover eleven canonical roles. `estimator` and `pm`
have no supplied or seeded browser identity and remain blocked. The role-neutral
source path and automated policy tests include both role names, but that is not
reported as live browser evidence.

## Next handoff

Open a sequential Agent 05 → Agent 08 → Agent 12 remediation handoff for the
confirmed P1 legacy `/api/ai/chat` capability-scoping defect. Do not deploy this
feature branch directly; use the ADR-020 release path after the broader release
gates pass.
