# Functional completeness and RBAC handoff

## Objective

Make the existing ABI OPS routes, actions, and workflows function end to end
for the repository's authoritative thirteen-role vocabulary. The first vertical
slice is account recovery and password management:

- unauthenticated users can request a password-reset email from sign-in;
- recovery links establish a valid session and open a password-update form;
- every authenticated role can change its own password from Settings/Profile;
- auth feedback does not disclose whether an email address exists;
- password updates survive sign-out and a fresh sign-in;
- no credential or auth token is persisted in repository evidence.

Broad module remediation follows one verified workflow at a time. Existing
working product surfaces remain in place; this work does not authorize a UI
redesign, schema rewrite, hosted database mutation, or production release.

## Ordered agent handoff

1. **Principal Agent 1 — Route and RBAC cartographer (read-only)**
   - Establish the exact role vocabulary and authoritative policy sources.
   - Inventory frontend routes, protected routes, APIs, navigation, and actions.
   - Supply evidence for the route matrix; do not edit source.
   - Output: counts, conflicts, and route/action evidence.
   - → Handoff to Principal Agent 3 after Principal Agent 2 reports.

2. **Principal Agent 2 — Functional integration auditor (read-only, parallel
   with Agent 1)**
   - Trace the password-recovery and authenticated password-change flows.
   - Inventory disconnected and broken workflows without editing source.
   - Output: root-cause evidence and prioritized failed workflows.
   - → Handoff to Principal Agent 3. Inputs: auth-flow failures and affected
     files. Expected output: one complete tested vertical slice.

3. **Principal Agent 3 — Implementation engineer (only application-source
   editor)**
   - Implement one vertical workflow at a time.
   - Add focused unit/integration/E2E coverage and update functional evidence.
   - First output: working reset-password and change-password flows.
   - → Handoff to Principal Agent 4. Inputs: changed files and exact test
     commands. Expected output: independent pass/fail reproductions.

4. **Principal Agent 4 — Independent QA and RBAC reviewer (read-only)**
   - Re-run positive and negative route/action tests.
   - Return exact failed cases to Agent 3 until the slice passes or is blocked.
   - → Handoff to Principal Agent 5 after local QA is green.

5. **Principal Agent 5 — Browser and deployment verifier**
   - Verify all supplied demo accounts in an isolated browser.
   - Inspect rendering, console, requests, refresh, direct URLs, and persistence.
   - Production deployment and live mutation require the existing release gate;
     local browser evidence does not imply a hosted release.

## First-slice acceptance criteria

1. Sign-in contains a keyboard-accessible **Forgot password?** link.
2. A valid email submission calls Supabase Auth's supported recovery API with a
   same-origin allowlisted callback; the success response is enumeration-safe.
3. The callback exchanges the recovery code, rejects unsafe `next` targets, and
   routes the authenticated recovery session to the password-update page.
4. New-password and confirmation fields enforce the repository's password
   policy and expose usable validation/error/success states.
5. Settings/Profile includes a password-change control for every role, requires
   the current password, and updates through the authenticated Supabase client.
6. Unit tests cover validation, error mapping, callback redirect safety, and
   rendering contracts; E2E coverage checks the critical browser flow.
7. Focused tests, lint, type-check, build, and browser console/network checks are
   recorded as PASSED, FAILED, BLOCKED, or NOT RUN.

## Known starting state

- Branch: `agent-03/auth-password-workflows`.
- The working tree already contained five unrelated untracked handoff/changeset
  documents dated 2026-08-27 and 2026-08-29. They belong to the user and must
  remain untouched.
- The repository requires Node.js 22, while the currently discovered shell and
  bundled runtime report Node.js 24. Supported-runtime verification remains an
  explicit gate; preliminary read-only inspection continues meanwhile.
- Eleven demo account addresses were supplied for browser testing. The other
  two canonical roles require repository evidence and usable demo identities;
  do not invent credentials.

## Password-slice closeout

- Principal Agent 3 implemented the application source and regression tests.
- Principal Agent 4 independently approved the callback, middleware, password
  operations, production build, and fail-safe live-test harness.
- Principal Agent 5 verified all eleven supplied accounts in an isolated real
  browser: sign-in, dashboard, Settings/Profile, ordinary-session recovery
  denial, and sign-out passed without fresh-console errors.
- One real recovery request returned the enumeration-safe success state.
- Mailbox completion and a live persisted password rotation remain blocked;
  guarded rotation attempts stopped before mutation and the external parent
  independently verified the original credential afterward.

→ Handoff to Agent 05. Reason: `/api/ai/chat` is the next confirmed P1 data-
authorization defect. Inputs: the RBAC summary and route matrix. Expected
output: capability-scoped domain contract without cross-capability financial
or commercial disclosure, followed sequentially by Agent 08 retrieval/prompt
review and Agent 12 security verification.
