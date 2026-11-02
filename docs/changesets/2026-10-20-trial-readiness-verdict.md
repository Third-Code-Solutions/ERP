# Trial readiness verdict + gate flake fix — 2026-10-20

Scope: answer the commercial question "is the ERP ready for the client trial?"
with executed evidence, and fix the single failing release gate. No production
deploy, no real demo requests, no production users.

## Verdict

NO for an unsupervised client trial on the hosted build today; conditional YES
for a supervised pilot once five blockers are closed. Full reasoning, evidence
ledger and remediation plan: `docs/qa/2026-10-20-trial-readiness-verdict.md`.

Headline facts behind the verdict:

- Production web is revision `04b3ac5a6139` (2026-10-04); production API
  `/ready` reports `database: ok, redis: ok`. It is healthy, and it is stale.
- The hardening slice the client is paying for (server write authority on
  BOM/PO/tender tables, exact BOM pricing, reserved-stock integrity, upload
  quota, tenant invite provisioning) exists only as 11 untracked migrations and
  86 untracked files in this working tree. HEAD is 8 commits behind
  `origin/main`; the slice is on no remote.
- The client tenant, users, roles and opening data do not exist anywhere.
- No backup/PITR rehearsal, no error/uptime monitoring, no authenticated
  feature-level e2e gate.

## Changes

- `docs/qa/2026-10-20-trial-readiness-verdict.md` — the deliverable report:
  evidence ledger, blockers B1–B5 + secondary S1–S4, ordered remediation R1–R8
  with acceptance criteria, recommended trial scope, and the conditions under
  which a this-week start is a supervised demo instead of a trial.
- `apps/web/src/lib/document-intake/deterministic-extractor.test.ts` — the
  real-DOCX extraction test now declares a `30_000` ms budget, matching the
  other extraction tests in the same file. Rationale: it failed at 8392 ms only
  while `supabase db reset` was replaying 25 migrations and starting the Docker
  stack on the same box; in isolation it takes 239 ms and its whole file passes
  in 4.75 s. This is a wall-clock budget for a real OOXML unzip + parse under
  contention, not a fix that hides a defect: the assertion on extracted text is
  unchanged.

## Verification (2026-10-20, Node v22.23.0)

| Gate | Result |
|---|---|
| `pnpm lint` (`--max-warnings=0`, 7 packages) | exit 0, 286 s |
| `pnpm typecheck` | exit 0, 101 s |
| `supabase db reset` (25 migrations + seed, empty DB) | OK, 214 public tables |
| `pnpm --filter @third-code-erp/database test` (live DB) | 94 files / 318 tests passed, 0 failed, 240 env-gated skips |
| `pnpm --filter @third-code-erp/web test` after the fix | 320 files / 2,740 tests passed, exit 0 |
| `pnpm test` (root, turbo, after the fix) | 5/5 tasks, exit 0 — web 2,740 / api 1,582 / database 318 / operations 9, 0 failed |
| Playwright `e2e/auth.spec.ts` (live server) | 6 passed |
| Production `/api/health` and `/ready` | 200, healthy |

## Rollback

Both files are additive documentation/test-budget changes. Revert the test
timeout by restoring the bare `})` close; delete the report file. No schema,
runtime or production change is included, so no data rollback path is required.

## Follow-up owned by others

R1–R3 (commit, merge, deploy) require a human merge decision and production
authorization: not performed in this changeset.
