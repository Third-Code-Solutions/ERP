# Agent 04 database test topology repair

## Scope and outcome

The database package's generic Vitest configuration now excludes exactly
`src/__tests__/tenant-invitation-auth-api.database.test.ts`. That suite remains
the sole include of `vitest.auth-api.config.ts` and therefore remains a
separate, required proof against a disposable local Supabase Auth Admin API.

A configuration-level regression test asserts all three runtime selections:

- generic database matrix: all database tests except the Auth API proof;
- raw PostgreSQL matrix: all database tests except the Auth API proof; and
- dedicated Auth matrix: exactly the Auth API proof.

No schema, migration, RLS, invitation-intent, application authorization, or
production behavior changed.

## Changed files

- `packages/database/vitest.config.ts`
- `packages/database/src/__tests__/vitest-topology.config.test.ts`

## Node 22 verification

All commands used Node `v22.23.2` and pnpm `10.33.0`.

| Command | Result |
| --- | --- |
| `pnpm --filter @third-code-erp/database exec vitest run src/__tests__/vitest-topology.config.test.ts` | **PASS** — 1 file, 2/2 tests. |
| `pnpm --filter @third-code-erp/database run typecheck` | **PASS**. |
| `pnpm --filter @third-code-erp/database run test` | **PASS** — 83 files passed, 9 environment-bound suites skipped; 283 tests passed. The Auth API proof was not selected. |
| `pnpm --filter @third-code-erp/database run test:auth-api` with `DATABASE_URL`, `SUPABASE_AUTH_API_URL`, and `SUPABASE_SERVICE_ROLE_KEY` absent | **EXPECTED FAIL-CLOSED** — exit 1 with the explicit missing `SUPABASE_AUTH_API_URL` runtime error; the suite was not reported green. |
| `scripts/ci/run-wsl1-database-lane.ps1` | **PASS** — PostgreSQL 17, Redis 7.4.9, 153 migrations, database 444/444 with zero skips, release coverage 4/4 with 100% coverage, API integration 79/79 with zero skips, and Web database integration 5/5 with zero skips. |

The raw-lane machine-readable reports are under the gitignored
`tmp/self-hosted-ci/` evidence directory.

## Dedicated Auth runtime blocker

The current machine could not start Docker Desktop's Linux engine. A normal,
non-elevated hidden startup was attempted. Docker Desktop `4.86.0` started its
desktop/backend processes but crashed before the `docker-desktop` WSL
distribution or Docker API became available. The current Docker backend log
reports that the inference manager could not access its local
`AppData/Local/Docker/run/dockerInference` socket path. No host permission,
UAC, Docker setting, or filesystem deletion was attempted.

Consequently a fresh real-Supabase Auth report was **BLOCKED**, not replaced
with direct SQL or treated as optional. The dedicated command remains
fail-closed and its prior 2026-08-27 zero-skip Auth API evidence is not claimed
as a current rerun for this candidate.

## Handoff

→ Handoff to Agent 15. Reason: the database test topology repair and raw
PostgreSQL evidence are complete; the two public demo-brand source matches are
an independent GTM surface. Inputs: this diff, the zero-skip raw-lane reports,
and the explicit Docker/Auth rerun blocker. Expected output: only the verified
book-demo source branding repair and focused validation. Production remains
**NO-GO**; Agent 12/13 must retain the missing fresh real Auth proof as a local
release blocker until Docker can run the disposable Supabase lane.
