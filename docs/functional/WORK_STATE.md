# ABI OPS functional-completeness work state

Last updated: 2026-09-02 (Asia/Singapore)

## Delivery contract

Goal: verify and repair existing ABI OPS functionality for the repository's
thirteen-role authorization vocabulary, one end-to-end workflow at a time.
The active slice is self-service password recovery and password change.

In scope now:

- authoritative role, route, API, navigation, and action inventory;
- account recovery from sign-in;
- self-service password change at `/settings/profile` for every role;
- automated and real-browser verification;
- evidence-backed RBAC and functional status.

Out of scope for this slice: schema changes, UI redesign, invented modules,
provider configuration mutations, and production deployment before the
repository's release gates pass.

## Verified inventory baseline

| Measure | Count | State |
| --- | ---: | --- |
| Authoritative persisted roles | 13 | VERIFIED from source and migrations |
| Supplied browser-test accounts | 11 | VERIFIED from the request and E2E helper |
| Missing browser identities | 2 | BLOCKED: `estimator`, `pm` |
| Next.js page routes | 118 | VERIFIED by source inventory and production build |
| Session/recovery-protected page routes | 104 | VERIFIED by route inventory + middleware policy |
| Explicit HTTP operations | 174 | VERIFIED by source inventory (133 Nest, 41 Next) |
| Protected role-route matrix records | 1,352 | VERIFIED as syntactically readable CSV records |
| Tested role-route combinations in this work order | 33 | Browser-tested on dashboard, profile, and ordinary-session recovery denial for 11 roles |
| Verified role-route combinations | 0 | Strict full-route definition not yet met; the 33 tested rows remain PARTIAL |
| Failed role-route combinations | 0 | No browser failure among the 33 tested combinations |
| Blocked role-route combinations | 6 | Three tested routes for each missing `estimator` and `pm` identity |
| Prioritized functional workflows | 1 | Password recovery/change is active |
| Verified workflows | 0 | NOT TESTED |
| Partial workflows | 1 | Implemented and locally tested; mailbox recovery and live persisted rotation remain blocked |
| Failed workflows | 0 | No known implementation failure after focused QA |
| Completed modules | 0 | NOT TESTED |
| Modules remaining | 13 user-facing modules | NOT TESTED |

## Authoritative role vocabulary

`owner`, `estimator`, `pm`, `admin`, `sales`, `commercial`, `design`,
`sd_pm_pe`, `finance`, `procurement`, `safety`, `cx`, `viewer`.

Runtime identity comes from `public.users.role`. The shared application policy
is `packages/shared-types/src/authorization.ts`; Web route visibility is also
influenced by legacy aliases in `apps/web/src/lib/operations/nav-config.ts`.

## Current workflow

Self-service password recovery and password change is implemented locally and
independently reviewed. The slice remains `PARTIAL` under the strict functional
definition of done because inbox delivery/recovery-link completion and one real
persisted password rotation could not be verified in the available browser
environment.

Implemented behavior:

- sign-in links to an enumeration-safe Supabase password-recovery request;
- the callback uses an exact redirect allowlist and accepts update-password only
  for a recent provider recovery exchange;
- middleware requires a short-lived HttpOnly recovery marker bound to the
  verified user, session, token, and recovery timestamp;
- recovery and Settings/Profile changes validate 12 to 128 characters and
  update through the authenticated Supabase client;
- Settings/Profile reauthenticates the same account with the current password
  before updating and signs the local session out afterward;
- all routes include loading and error surfaces; all thirteen roles use the
  same own-account flow without role-specific denial;
- no password, access token, or service-role value is written to repository
  evidence or browser artifacts.

Acceptance criteria and ordered agent handoffs are recorded in
`docs/handoffs/2026-09-02-functional-completeness.md`.

## Agent state

- Principal Agent 1: read-only route/RBAC cartography complete; no files changed.
- Principal Agent 2: auth functional audit complete; no files changed.
- Principal Agent 3: auth implementation complete; sole application-source
  editor for this slice.
- Principal Agent 4: independent code, test, build, and live-harness safety
  review complete; final verdict approved for the implemented source.
- Principal Agent 5: isolated real-browser verification complete for all eleven
  supplied identities; no application console errors in the fresh run.

## Git state

- Repository: `D:/thirdcode/ERP`
- Branch: `agent-03/auth-password-workflows`
- Pre-existing untracked files: five user-owned changeset/handoff documents
  dated 2026-08-27 and 2026-08-29; preserved and excluded from this work.
- Current work-order file: `docs/handoffs/2026-09-02-functional-completeness.md`.

## Checks executed

| Check | Result | Evidence |
| --- | --- | --- |
| Focused auth/middleware baseline under Node 22.23.2 | PASSED | 4 files, 10 tests |
| Final focused auth/middleware tests under Node 22.23.2 | PASSED | 6 files, 55 tests |
| Web TypeScript | PASSED | `pnpm --dir apps/web exec tsc --noEmit` |
| E2E TypeScript | PASSED | `pnpm --dir apps/web exec tsc --noEmit -p e2e/tsconfig.json` |
| Web source lint | PASSED | `pnpm --dir apps/web lint` |
| E2E ESLint | NOT RUN | Flat ESLint config has no matching E2E configuration; TypeScript gate passed |
| Production build | PASSED | Next.js 15.5.23; 89/89 static pages generated |
| Built-app auth browser suite | PASSED | Chromium; 6/6 tests |
| Git diff whitespace check | PASSED | `git diff --check`; line-ending warnings only |
| Browser account matrix | PASSED | 11/11 supplied identities logged in and rendered `/dashboard` plus `/settings/profile`; ordinary `/auth/update-password` access was denied safely |
| Live reset request | PASSED | One real Supabase SDK recovery request returned the enumeration-safe success state |
| Hosted reset email delivery and recovery link | BLOCKED | No mailbox access was supplied |
| Live persisted password rotation | BLOCKED | Guarded Linux Chromium lane could not complete its initial login; external parent verified the original credential after every attempt and no account remained changed |
| Deployment/live smoke | NOT RUN | ADR-020 requires reviewed `main` SHA and full protected release workflow |

## Confirmed high-priority RBAC findings outside the active slice

1. Legacy route aliases (`estimator` to `commercial`, `pm` to `sd_pm_pe`) do not
   match the shared capability grants, producing visible links that backend or
   page checks later deny.
2. Project Audit fallback can expose tenant-wide audit diffs to roles outside
   the central `audit.read` policy.
3. Legacy project chat reads BOM margin, invoices, and PO totals with only
   authentication/tenant checks and no capability-scoped data boundary.
4. Opportunity CSV export authorization is broader than Reports navigation.
5. Unknown dashboard paths currently default to allowed in `canViewPath`.

These are queued after the password slice and must be reproduced before repair.

## Exact next action

Commit the password slice without the five pre-existing user-owned documents,
then open the next sequential handoff for the confirmed P1 legacy project-chat
data-authorization leak (`/api/ai/chat`). Production deployment remains gated by
ADR-020 and is not authorized from this dirty feature branch.
