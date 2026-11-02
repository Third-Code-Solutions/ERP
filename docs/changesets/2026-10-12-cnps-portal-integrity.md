# CNPS portal integrity and company identity

Agent 03, under the independent-system remediation handoff and ADR-040.

- Public CNPS lookup and submission require an active company. The bearer-token lookup derives tenant identity, and submission holds a tenant lock through commit.
- Strict whole-number 0–10 validation replaces permissive integer parsing. Conditional response updates prevent duplicate overwrites. Account locking serializes concurrent survey averages while preserving the existing average × 10 contract.
- Response, account total and explicit audit event commit atomically. Notification failures are logged after commit without presenting the response as failed.
- Thank-you state depends on persisted response state, never `?ok=1`. Survey copy uses company legal name with workspace fallback. The shared portal shell uses ABI OPS and neutral project-team copy. Score controls expose keyboard focus.

Verification:

- PASSED: page rendering regression tests, 4/4; pre-fix run reproduced 3 failures (forged success state, missing workspace fallback, seller-specific shell).
- PASSED: scoped `git diff --check`.
- BLOCKED: focused ESLint produced no output under the machine's memory/paging pressure and was interrupted; retry in the sequential verification lane.
- NOT RUN yet: focused PostgreSQL regression suite `apps/web/src/app/portal/cnps/[token]/actions.database.test.ts` (7 cases); deferred to the coordinating agent's sequential database lane. Covers malformed scores, audit rollback, suspended/unknown links, duplicate/concurrent submissions, account-average serialization, caller-supplied identity isolation and notification failure.
- NOT RUN: browser flow and hosted/provider verification. No deployment, commit or provider writes.

Database suite requires `PORTAL_DATABASE_EXPECTED=1` and an explicitly allowed loopback disposable `DATABASE_URL`. Each case uses unique synthetic IDs; cleanup removes exact project/account fixtures while retaining append-only audit evidence and its tenant/actor references.

→ Handoff to coordinating agent: run focused database tests, finish aggregate type/lint and browser checks, record final verification evidence. No schema changes or dependencies added by this handoff.
