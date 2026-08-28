# Agent 13 — Node 22 pre-production local release matrix

**Date:** 2026-08-28T18:06:53+08:00  
**Owner:** Agent 13 — CI/CD & Ops  
**Candidate exercised:** `3781d037a2bef4faf1fe1aba50859e19a6d62a95`  
**Decision:** **LOCAL PARTIAL PASS; RELEASE NO-GO.** The source, raw PostgreSQL,
and local security/workflow controls passed. The required real local Supabase
Auth Admin API proof was blocked before execution by verified non-loopback
Docker publication, so it has no fresh zero-skip report.

## Scope and boundary

This is Stage 5 of
`docs/handoffs/2026-08-28-preproduction-release-gate-repairs.md`. All commands
used the repository-local Node `v22.23.2` and pnpm `10.33.0`. No production
database/provider/billing/runner/deployment operation, UAC prompt, Docker
setting, firewall rule, ACL, permission change, or application/workflow source
change was made.

The tracked worktree was clean before recording this changeset. The Node 22
runtime archive/directory under untracked `.tools/` was preserved and not
committed. `apps/web/.next` and `tmp/self-hosted-ci/` are ignored; `git
ls-files` returned no tracked generated artifacts.

## Passed Node 22 gates

| Command or evidence | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **PASS** — lockfile was current. |
| `pnpm verify:abi-ops-brand` | **PASS** — 2,641 text files scanned; no legacy-brand violation. |
| `pnpm test` | **PASS** — Turbo 4/4 tasks, exit 0. The generic database suite retains its declared environment-bound skips and is not used as Auth-lane evidence. |
| `pnpm lint` | **PASS**. |
| `pnpm typecheck` | **PASS** — Turbo 5/5 tasks. |
| `pnpm build` with non-secret workflow placeholder variables | **PASS** — Nest build and Next production build; 87 Web routes generated. |
| `pnpm ci:actionlint` | **PASS** — Actionlint 1.7.12. |
| `pnpm verify:workflow-action-refs` | **PASS** — all four currently referenced action versions resolved. |
| `pnpm ci:gitleaks` | **PASS** — 1,586 commits / approximately 38.38 MB scanned; no leaks found. |
| Vitest and Playwright no-skip helper contracts | **PASS** — 2/2 each. |
| CI release-plan additions: database release, project cutover, PO duplicate, controlled release, release identity, and Web DB boundary contracts | **PASS** — 9/9, 6/6, 4/4, 5/5, 5/5, and 6/6 respectively. |

The first `pnpm test` terminal invocation lost its parent transport while test
children continued. Its command-line/PID tree was read-only verified as a
duplicate task-owned root-test tree and then terminated. A single attributable
Node 22 rerun completed **PASS** (exit 0) in 7m25.941s. No repository file,
runtime setting, or user process outside that verified duplicate tree was
terminated.

## Raw PostgreSQL lane — PASS

`scripts/ci/run-wsl1-database-lane.ps1` completed with exit 0 against the
disposable WSL PostgreSQL 17 and Redis 7.4.9 lane:

- 153 repository migrations applied and the migration ledger matched exactly;
- raw database report: **444/444**, zero skips;
- database release coverage: **4/4**, zero skips and 100% coverage;
- API integration: **79/79**, zero skips;
- Web database integration: **5/5**, zero skips; and
- before/after schema hash matched:
  `EB3106E90CFC2213AF6BC28CFDD6E9EF9C6F934F78190DECF80DCA93EE18E52C`.

The narrowly scoped raw lane teardown passed and no listener remained on
54321 or 54322 before attempting local Supabase.

## Local Supabase Auth lane — BLOCKED fail-closed

Docker Desktop's API was available (server `29.7.2`). The exact disposable
preflight was clean: pinned `supabase@2.109.1`, zero matching
`supabase_.*_erp` containers/volumes, zero test networks, and zero listeners on
54321, 54322, 54323, 54324, and 54327.

Two uniquely named disposable test networks were created with Docker's
loopback host-binding option solely to test the required lane. In both cases,
effective container port metadata was not loopback-only. The second short-lived
reproduction captured these non-secret bindings:

| Container | Container port | Published host binding |
| --- | --- | --- |
| `supabase_kong_erp` | `8000/tcp` | `0.0.0.0:54321` and `[::]:54321` |
| `supabase_db_erp` | `5432/tcp` | `0.0.0.0:54322` and `[::]:54322` |
| `supabase_studio_erp` | `3000/tcp` | `0.0.0.0:54323` and `[::]:54323` |
| `supabase_inbucket_erp` | `8025/tcp` | `0.0.0.0:54324` and `[::]:54324` |
| `supabase_analytics_erp` | `4000/tcp` | `0.0.0.0:54327` and `[::]:54327` |

This contradicts the intended loopback-only test boundary. Agent 13 therefore
did **not** derive runtime credentials, invoke `test:auth-api`, or create an
Auth JSON report against that stack. The only no-runtime `test:auth-api`
invocation failed as designed (exit 1) with the explicit missing
`SUPABASE_AUTH_API_URL` error; its four test cases were skipped only because
the suite failed during required runtime resolution. It is evidence of the
fail-closed command, not a successful or zero-skip Auth run.

Each created test stack was immediately removed by its exact network name using
the local Supabase stop command and exact Docker network removal. Final
verification showed zero matching Supabase containers, volumes, named test
networks, and listeners on all five local Supabase ports. No broad Docker
cleanup, `prune`, UAC, firewall, ACL, or settings action was used.

## Release decision and handoff

The Stage 5 local-matrix exit criterion is **not met**: a current real,
loopback-contained, zero-skip Supabase Auth Admin API report for candidate
`3781d037` does not exist. The local Docker binding behavior must be resolved
through the separately accepted host-containment path or a dedicated disposable
CI host; it must not be bypassed with a placeholder, direct SQL, a generic test
pass, or an unsafe network publication.

All production blockers remain independently **NO-GO**: there is no approved
immutable `main` candidate with current hosted CI/security evidence; required
Snyk/Semgrep/Trivy evidence remains absent; the Actions capacity/billing and
runner-containment paths remain unresolved; production environment protection,
read-only production parity, tested recovery, and ABI O-01/O-14 plus the
fractional-quantity/DUPA authority are not cleared.

→ Return to **Stage 1** of
`docs/handoffs/2026-08-28-production-release.md`. Reason: Stage 1 requires an
exact `main` artifact and completed CI evidence; this PR-branch local matrix
cannot supply either, and the required Auth lane is blocked. Inputs: this
changeset, the raw-lane report counts/hash, the non-loopback binding table, and
targeted teardown proof. Expected output: remain NO-GO until the earliest
Stage 1 prerequisites and the safe Auth containment boundary are actually
resolved. This documentation commit also creates a later branch SHA, so none of
the candidate-specific local evidence may be carried forward as a green result
without re-execution for the eventual release artifact.
