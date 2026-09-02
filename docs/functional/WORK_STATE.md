# ABI OPS functional-completeness work state

Last updated: 2026-09-02 (Asia/Singapore)

## Delivery contract

Goal: verify and repair existing ABI OPS functionality for the repository's
thirteen-role authorization vocabulary, one end-to-end workflow at a time.
Password management and legacy project-chat authorization are the two completed
local implementation slices; both remain `PARTIAL` under the strict live-data
definition of done.

Current work-order scope:

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
| Protected role/resource matrix records | 1,365 | VERIFIED as syntactically readable CSV records |
| Tested role/resource combinations in this work order | 46 | 33 auth browser observations plus 13 automated AI-domain policy cases |
| Verified role/resource combinations | 0 | Strict full-route definition not yet met; tested rows remain PARTIAL or BLOCKED |
| Failed role/resource combinations | 0 | No failed combination in the two repaired slices |
| Blocked role/resource combinations | 8 | Four tested resources for each missing `estimator` and `pm` identity |
| Prioritized functional workflows | 2 | Password management and project-chat data boundaries |
| Verified workflows | 0 | Strict live-data definition not yet met |
| Partial workflows | 2 | Both implemented and locally tested with explicit live-evidence limits |
| Failed workflows | 0 | No known implementation failure after focused QA |
| Completed modules | 0 | NOT TESTED |
| Modules remaining | 13 user-facing modules | NOT TESTED |

## Authoritative role vocabulary

`owner`, `estimator`, `pm`, `admin`, `sales`, `commercial`, `design`,
`sd_pm_pe`, `finance`, `procurement`, `safety`, `cx`, `viewer`.

Runtime identity comes from `public.users.role`. The shared application policy
is `packages/shared-types/src/authorization.ts`; Web route visibility is also
influenced by legacy aliases in `apps/web/src/lib/operations/nav-config.ts`.

## Completed local implementation slices

### Self-service password recovery and password change

Implemented locally and independently reviewed. The slice remains `PARTIAL`
because inbox delivery/recovery-link completion and one real persisted password
rotation could not be verified in the available browser environment.

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

### Legacy project-chat data boundaries

Implemented on the stacked `agent-05/ai-chat-data-boundaries` branch and
independently reviewed. The slice remains `PARTIAL` because the AI provider was
deliberately disabled during browser verification; no data-bearing live model
response was requested.

Implemented behavior:

- strict bounded Zod validation runs before quota, database, audit, or provider
  work;
- project, BOM, invoice, and PO context uses the existing central policy for
  every one of the thirteen roles;
- denied-domain branches issue no query and cannot enter the system prompt;
- every query remains tenant/project scoped and context row/field counts are
  bounded;
- responses are private/no-store and internal failures remain generic;
- audit attempts contain actor/tenant/project/message-count/granted-domain
  metadata before provider work;
- viewer, finance, and commercial passed safe production-build browser/API
  checks with the provider disabled; the assistant UI advertises only generic
  project questions.

Acceptance criteria and ordered agent handoffs are recorded in
`docs/handoffs/2026-09-02-functional-completeness.md` and
`docs/handoffs/2026-09-02-ai-chat-data-boundaries.md`.

## Agent state

- Principal Agent 1: read-only route/RBAC cartography complete; no files changed.
- Principal Agent 2: auth functional audit complete; no files changed.
- Principal Agent 3: sole application-source editor for both slices; auth and
  AI chat implementations complete.
- Principal Agent 4: independent code/test/security review complete; `GO` for
  both implemented source slices.
- Principal Agent 5: auth verification complete for all eleven supplied
  identities; AI chat safe browser/API smoke complete for viewer, finance, and
  commercial with no provider call.

## Git state

- Primary repository: `D:/thirdcode/ERP`; stacked PR worktree:
  `D:/thirdcode/ERP-ai-chat-pr-20260902`.
- Current stacked branch: `agent-05/ai-chat-data-boundaries`.
- Auth PR branch: `agent-03/auth-password-workflows-20260902`; PR #15 at
  commit `dfa190ba`.
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
| AI chat focused route tests | PASSED | 21/21 tests including all 13 roles and domain policies |
| AI chat independent type/lint/secret scan | PASSED | Web TypeScript; source lint; gitleaks 8.30.1 |
| AI chat production build | PASSED | Next.js 15.5.23; 85/85 static pages |
| AI chat safe browser/API smoke | PASSED | Viewer/Finance/Commercial project UI; private 401/400/503; no external provider request |
| AI chat live provider response | NOT RUN | Provider deliberately disabled to avoid sending data/cost before release |
| Auth PR CI | FAILED (pre-existing release gate) | Unit/type/lint/security/invariants pass; database reproducibility repeatedly fails existing Finance payables/receivables assertions and skips CI build/E2E |
| Deployment/live smoke | NOT RUN | ADR-020 requires reviewed `main` SHA and all protected release gates; current CI is not green |

## Confirmed high-priority RBAC findings outside the completed slices

1. Legacy route aliases (`estimator` to `commercial`, `pm` to `sd_pm_pe`) do not
   match the shared capability grants, producing visible links that backend or
   page checks later deny.
2. Project Audit fallback can expose tenant-wide audit diffs to roles outside
   the central `audit.read` policy.
3. Project detail itself queries and renders BOM, margin, invoice, and PO
   summaries without applying independent domain-read gates. The legacy chat
   endpoint is repaired on the current stacked branch.
4. Opportunity CSV export authorization is broader than Reports navigation.
5. Unknown dashboard paths currently default to allowed in `canViewPath`.

These are queued sequentially after the completed local slices and must be
reproduced before repair.

## Exact next action

Complete the next sequential project-detail authorization workflow: gate its
BOM/margin, invoice, PO, tabs, and queries by existing central policy and prove
all thirteen role outcomes. In parallel, treat the repeatable Finance
payables/receivables database-reproducibility failures as a separate release-
gate workflow. Production deployment remains blocked by ADR-020 until every
required check is green on a reviewed `main` SHA.
