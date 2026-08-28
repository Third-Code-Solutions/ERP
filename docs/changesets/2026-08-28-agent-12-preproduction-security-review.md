# Agent 12 pre-production security and workflow-contract revalidation

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Candidate reviewed:** `6a43ecc75e7c90a22d0fcd0b4d85eb88c42cd861`
**Decision:** **CONTRACT PASS; RELEASE NO-GO.** The scoped source changes do
not weaken the Auth, consent, or owner-route boundaries. A fresh Auth proof and
the hosted/production gates are still unsatisfied release requirements.

## Scope reviewed

- Agent 04 change `09fcde0d`: database Vitest selection only.
- Agent 15 change `2f843332`: two public `/book-demo` brand strings only.
- Agent 03 change `6a43ecc7`: one `/owner` brand string only.
- ADR-027 and ADR-030, the current Auth runtime/test files, the self-hosted
  workflow, security workflow, and relevant public/owner route boundaries.

No provider, production, database, runner, billing, deployment, migration,
workflow, or application source was changed by this review.

## Contract evidence

### Auth test topology and safety — PASS (static review)

- `packages/database/vitest.config.ts` and
  `vitest.raw-postgres.config.ts` include `src/**/*.test.ts` and exclude only
  `src/__tests__/tenant-invitation-auth-api.database.test.ts`. The new topology
  test asserts that exact selection. No conditional test body, skip, placeholder
  success, or broader database exclusion was introduced.
- `test:auth-api` remains an explicit command whose dedicated config selects
  only the ADR-030 real Supabase Auth Admin API proof. Its runtime resolver
  rejects absent values, placeholders, non-loopback API/database URLs, and
  malformed service credentials before tests can pass.
- `.github/workflows/ci-self-hosted.yml` requires the dedicated lane after the
  raw PostgreSQL rebuild. It derives the three runtime values only from the
  disposable `supabase status --output env` result, captures that output instead
  of printing it, masks each value before invoking the test process, removes the
  child-process environment variables in `finally`, and does not upload the JSON
  report as an artifact.
- Both raw PostgreSQL and Auth JSON reports are required and validated by
  `scripts/assert-vitest-no-skips.mjs`; zero tests, failures, pending/todo,
  missing reports, or unequal passed/total counts fail the job. The workflow has
  no Auth-lane `continue-on-error` or skip path. Its manual-dispatch job is also
  source-identity restricted to the named repository, owner, candidate ref, and
  authorized actor.
- Disposable network binding is checked for loopback-only publication. Cleanup
  runs with `always()`, removes the Supabase runtime/network and ignored local
  report paths, and fails if teardown verification fails.

### Public consent and owner boundary — PASS (static review)

- The book-demo wording change preserves the required checkbox. The server
  action still rejects any submission without `privacyConsent: 'on'` before a
  database transaction, validates public input, writes the platform audit entry
  atomically, and preserves the anti-spam acknowledgement path.
- `/owner` remains session-protected by middleware and has independent
  authorization in its layout, page, and every mutation through
  `requireOwnerAdmin`. That helper requires a confirmed identity and the fixed
  normalized owner allowlist; it does not accept tenant roles or user metadata
  as platform authority.
- The owner page retains `robots: { index: false, follow: false }`. The global
  `robots.ts` does not separately list `/owner`; the page-level noindex is the
  effective indexing boundary, while adding a robots disallow would be a
  non-security, route-owner hygiene improvement rather than an authorization
  control.

## Verification and unresolved gates

| Evidence | Status |
| --- | --- |
| `git diff --check 3c0f9224..6a43ecc7` | PASSED |
| Agent 04 Node 22 topology/type/default/raw-lane checks | PASSED as recorded; fresh Auth command correctly fail-closed without a runtime |
| Agent 15 Node 22 lint/type/build and focused source check | PASSED as recorded |
| Agent 03 Node 22 owner tests, type/build, and brand verifier | PASSED as recorded |
| Fresh disposable Auth Admin API proof for `6a43ecc7` | BLOCKED — Docker Desktop Linux engine is unavailable; no stale report, SQL substitute, or generic test pass is accepted |
| Current hosted security workflow for `6a43ecc7` | FAILED before scanner steps — all four required jobs are red |
| Snyk prerequisite | BLOCKED — no `SNYK_TOKEN` in accessible repository, Production-environment, or organization secret inventories |
| Semgrep and Trivy hosted evidence | BLOCKED — current jobs failed before scanners executed |
| Production environment protection | FAILED — no protection rules or deployment branch policy; administrator bypass remains enabled |

The current shell exposes Node 24, while this repository requires Node 22, so
this review did not rerun the Node-22 commands under an incompatible runtime.
That is not treated as a substitute for the predecessor's recorded Node-22
results or for Agent 13's required fresh matrix.

## Handoff to Agent 13

→ Handoff to Agent 13. Reason: Agent 12 has verified that the repair remains
explicit, mandatory, secret-safe, and fail-closed at source level. Inputs: this
changeset; `09fcde0d`, `2f843332`, and `6a43ecc7`; and the non-secret local
reports cited by their changesets. Expected output: on the exact candidate SHA,
with Node 22 and a functioning disposable Docker/Supabase runtime, run the full
local matrix including the zero-skip Auth Admin API proof. Do not represent a
Docker-blocked Auth rerun, failed/skipped hosted job, or missing Snyk token as a
pass. The existing hosted security, billing/Actions-availability, production
environment, runner-isolation, production-parity, and ABI commercial blockers
remain independently **NO-GO**.
