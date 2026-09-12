# Core-only Web user role workflow

## Changed

- Removed the Web role-update SQL fallback. Disabled Core rollout gates now reject without submitting a mutation; rollout scope is unchanged.
- Validate and forward the exact target, expected role and client request ID. Core remains responsible for current tenant authority, lifecycle admission, transaction, idempotency and atomic audit.
- Validate response binding and distinguish known rejection from an unknown commit outcome. Transport failures no longer claim that no role changed.
- Isolate the role editor by user, freeze uncertain commands across rejected retries, and require a matching confirmed success before releasing uncertainty. Explicit review permits a fresh intent after an initial known rejection.
- Preserve confirmed success when a client refresh fails. Add accessible role labels, pending/error/retry states and narrow-width wrapping using existing styles.
- Add the credential-free role browser suite and screenshots to the existing required CI browser job without changing its check identity.

## Verification

- PASSED: action and adapter regression suites, 230/230, independently checked for skips. This includes 17 action tests and 29 focused role adapter tests.
- PASSED: final combined credential-free Chromium gate, 32/32, one worker, zero retries and no skips (18.5 seconds). Role cases cover exact retries, sticky uncertainty, known rejection review, malformed responses, refresh failure, stale user scope and keyboard/overflow behavior.
- PASSED: Web TypeScript and E2E TypeScript checks; focused source ESLint; workflow actionlint; CI contract tests 10/10; whitespace checks; history secret scan (2010 commits, no findings).
- PASSED: main-agent visual inspection of final screenshots at 320, 768 and 1440 pixels, using production CSS and the Manage card/padding in a credential-free component harness.
- NOT RUN locally: full Next production build and complete repository CI suite for this commit; required PR CI will provide those gates. Local Node is 24.16.0, not CI's pinned Node 22.
- NOT RUN: live role mutations or all-demo-account role-changing journeys. The browser harness mocks the action boundary and is not production integration proof.

## Release and remaining work

Depends on PR #73 and the inherited draft stack. No hosted schema, Auth, role or deployment changes were made. Verify intended tenant Core role-write gates before promotion; disabled gates deliberately leave role editing unavailable.

Production remains held for verified database backup/PITR, separate Storage recovery and an authorized isolated restore rehearsal before pending claim/KYC migrations. This changeset does not resolve retained-history suspension, unsafe legacy physical deletion or the cross-writer last-active-admin invariant. Password and delete business behavior are unchanged.

Handoff: frontend and adapter work completed; main integrated CI and independently verified the combined slice. Next ownership is CI/Ops for PR gates, then the separately scoped retained-history lifecycle work.
