# Production release-control handoff

## Outcome

Added `docs/handoffs/2026-08-28-production-release.md`, a strict Agent 13 →
Agent 12 → Agent 04 → Agent 13 → post-deploy release sequence for PR #14's
normal-merge candidate.

## Current decision

Production remains **NO-GO**. The record preserves these current blockers:

- hosted CI run `33083718479` failed and skipped dependent jobs; earlier
  evidence identifies a GitHub Actions billing/spending condition;
- the selected ERP-only self-hosted runner group has zero runners pending the
  separate security/UAC containment decision;
- Snyk, Semgrep, and Trivy do not have current required-gate evidence;
- the final candidate has no current target-specific read-only production
  schema/migration parity report; and
- ABI O-01/O-14 plus the fractional-quantity/DUPA decision remain unresolved,
  so commercial workflow readiness cannot be claimed.

## Boundaries and verification

- PASSED: documentation-only release-control work; no code, PRD, provider,
  production, billing, runner, credential, migration, or deployment setting
  changed.
- NOT RUN: CI remediation, security scans, production parity access, provider
  preflight, promotion, rollback, and live verification. Each is deliberately
  assigned to a later owner with a fail-closed exit criterion.

## Agent 13 production preflight — 2026-08-28T17:02:54+08:00

### Scope and boundary

Read-only preflight only. No deployment, merge, database query or migration,
provider configuration change, billing change, runner registration, service,
Docker, firewall, or ACL change was performed. Secret and variable **names**
were enumerated where the provider allowed it; no values were read, emitted,
or verified.

### Release identity and source lineage

- PR: [#14](https://github.com/Third-Code-Solutions/ERP/pull/14), open and
  non-draft; its GitHub mergeability state is `unstable` and it is not merged.
- Snapshot candidate head: `0e32578f103d6475e9624d347b69df5f647fd0b8` on
  `codex/release-candidate-trial-port`.
- `main` at snapshot: `a444ca91e8cc9673f754421541a476e29b85351d`.
  The main SHA is the merge base and an ancestor of the candidate; the
  candidate is 11 commits ahead and 0 behind.
- The provisional GitHub `merge_commit_sha` is not a release artifact because
  the PR remains open. `deploy-production.yml` has the same blob
  (`14bef6e0a81e95d666780a15bc2e89213be90c98`) on the candidate and `main`.
- This preflight record itself creates a later documentation-only candidate
  commit. All CI and approval evidence must be collected again for that actual
  head before any promotion; no SHA in this section authorizes deployment.

### GitHub checks, budget, and environment control

- Current candidate workflow run:
  [33157202840](https://github.com/Third-Code-Solutions/ERP/actions/runs/33157202840)
  (`CI`, `pull_request`) is **failed**. `Actionlint` is failed and its failed
  job log was unavailable; Unit Tests, Security Scan, Type Check, Lint,
  Database Reproducibility, Build OPS Invariants, Build, E2E Tests, and
  Supabase Preview were skipped. CodeRabbit is pending. This is not current
  passing release-gate evidence.
- The organization Actions budget is `amount: 0` with
  `prevent_further_usage: true`. August usage was present, but the net spend
  was zero. No spend or budget was changed. This configured stop condition
  prevents hosted Actions usage; the unavailable Actionlint log means the
  exact cause of that individual failure is not asserted here.
- Required production secret names from the workflow are present:
  `VERCEL_TOKEN`, `RAILWAY_API_TOKEN`, `SUPABASE_MIGRATION_DATABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and
  `PRODUCTION_DATABASE_URL`. `vars.E2E_PROJECT_ID` exists at repository scope.
  Environment variables are empty. This is name-completeness only: target,
  value, expiration, role, and least-privilege correctness remain unverified.
- The GitHub `production` environment has no protection rules and no
  deployment branch policy. It therefore does not meet this handoff's required
  protected-approval boundary.

### Canonical target inventory and live read-only status

The workflow names these targets: Supabase `aqqrtkmtcsfkbyyqxowv`; Railway
project `a21fd382-80b2-4218-8025-11f420a062e3`, API service
`c45b3d01-036a-4663-a524-0713d782fce3`, CAD service
`328c6650-306e-4a3c-80dc-7566e80ba86a`; and Vercel scope
`team_n60dl3ccO8BFGFeUKQdqPhp3`, project `thirdcode-erp`.

- Vercel resolves that scope/project to project ID
  `prj_5yZX5MTJdXZYWRIeS50jVhmjqzdb`. Its current production alias resolves
  to Ready deployment `dpl_piz7EeuKvsV5XFkqW5UfZWVK6DkB`; `/`, `/api/health`,
  and `/api/ready` returned HTTP 200. The deployment reports source revision
  `175eb35a5e40301e2dc82bd0414992633664c6fc`, not this release candidate.
- Railway production resolves the exact project and service IDs. The latest
  successful API deployment is `9d5f7c2f-d33f-4a4c-84be-18d4bcfb3af3`
  (source `044e09bfe4b36512b6e91c493df65b1bfa2be709`); the CAD deployment is
  `d59ebaf1-00ec-42b1-ad4f-c97a26cc9cc5` (source SHA unavailable). API
  `/health` and `/ready`, plus CAD `/health`, returned HTTP 200. Later API
  deployment attempts for current main were skipped for unchanged watched
  files, so current runtime identity does not prove candidate delivery.
- Supabase project `aqqrtkmtcsfkbyyqxowv` (ERP, `ap-northeast-2`) is
  `ACTIVE_HEALTHY`, using Postgres `17.6.1.121`. No database connection was
  made. This is provider inventory only, not migration/schema parity evidence.

### Rollback and recovery candidates

- Vercel has a prior Ready production deployment
  `dpl_6BnVcioDqZ93Ep5NYKwR5heTheqU` (2026-08-22). It is an immutable rollback
  candidate; no alias promotion or rollback was executed or tested.
- Railway's current known successful immutable deployment IDs are
  `9d5f7c2f-d33f-4a4c-84be-18d4bcfb3af3` (API) and
  `d59ebaf1-00ec-42b1-ad4f-c97a26cc9cc5` (CAD). A prior stable deployment,
  rollback authority, and restore procedure must be confirmed before release.
- Supabase's newest completed physical backup is `1497983327`
  (2026-08-27T17:24:20Z). Point-in-time recovery is disabled; restore testing,
  restore authorization, and a target-specific recovery point are not proven.

### Deployment workflow inspection (no changes)

`deploy-production.yml` is manually dispatched, serialized, main-ref gated,
and invokes the named production environment. It checks required secret names,
runs the data-boundary script before migrations, performs a migration dry run,
and finishes with health/surface/authenticated-E2E steps. Those are positive
controls but are insufficient for this release:

- it does not assert an approved exact main SHA or a successful required CI and
  security-gate run for `$GITHUB_SHA`;
- it does not require Agent 12 acceptance, Agent 04 parity evidence, recovery
  readiness, or resolution of the commercial ABI decisions before applying a
  migration;
- its migration target check only validates the expected username and port, not
  the host, TLS, or connected project identity; and its read-only boundary
  script does not prove the database role's effective privileges;
- the release-gate step does not establish current gitleaks, Snyk, Semgrep, or
  Trivy evidence; and
- the Vercel step resolves a project by name/scope and then force-updates the
  production `DATABASE_URL`, which is a provider configuration mutation during
  a release and has no immutable project-ID assertion.

### Decision and handoff

**NO-GO. Do not merge, dispatch, or deploy.** Stage 1 exit criteria are not
met: the release is not an approved main SHA; CI/security evidence is missing;
the Actions spend stop remains active; GitHub production protection is absent;
current production artifacts do not match the candidate; DB parity and tested
recovery are unproven; and ABI O-01/O-14 plus the fractional-quantity/DUPA
decision remain unresolved.

→ Handoff to Agent 12. Reason: assess and restore the required security/release
approval boundary, including production environment protection, current
gitleaks/Snyk/Semgrep/Trivy evidence, runner acceptance prerequisites, and the
workflow's provider-credential/target controls. Inputs: this record, run
`33157202840`, the protected-environment readback, and the fail-closed findings
above. Expected output: an evidence-backed Agent 12 acceptance or a documented
NO-GO with remediation; no deployment.

## Latest release-control checkpoint — 2026-08-28

The top-level decision remains **NO-GO; no item is deployed, production-ready,
or approved for promotion.** This checkpoint incorporates the later local
containment contract (`761abf7e`) and repository-only harness repair
(`a28e163b`), without treating either as an exact-`main` release artifact.

| Evidence | Current status | Release effect |
| --- | --- | --- |
| Prior Node 22 local matrix (`3781d037`) | **PARTIAL LOCAL PASS** — generic test/lint/type/build, local Actionlint/action-reference/Gitleaks/no-skip helpers, and raw PostgreSQL `444/444` zero-skip lane passed. | Prior branch-local evidence only; it does not include the required real Auth proof and cannot carry forward to a later commit or `main`. |
| Latest containment-harness repair | **LOCAL PASS** — `pnpm test:supabase-containment` **7/7**, local Actionlint/action-reference, PowerShell parsing, and diff check passed. | Confirms the repository now fails closed and cleans run-owned resources; it is not a successful local Supabase/Auth execution. |
| One bounded containment runtime attempt | **BLOCKED** — before reset/status/credentials/Auth, run-owned port 54322 had `::1` and wildcard IPv6 `::`; earlier evidence has matching wildcard IPv4/IPv6 Docker publication. | Agent 13 correctly performed targeted teardown with zero residue and did **not** hand off to Agent 04. No `test:auth-api` zero-skip report exists. |
| Candidate/migration lineage | **BLOCKED** — `origin/main` is an ancestor, but PR #14 is open and `a28e163b` is not a normally merged immutable `main` candidate. No current read-only production migration/schema parity report exists for a final release SHA. | Stage 1 cannot exit. Local 153-migration replay/hash is not production parity. |
| Hosted CI/security and production environment | **BLOCKED** — documented PR Actionlint failures skipped downstream work; Actions spend stop remains configured; Snyk/Semgrep/Trivy lack current required evidence; zero-runner fallback and unprotected `production` environment remain unresolved. | No green CI/security gate, runner authorization, or protected production promotion path exists. |
| Recovery and commercial authority | **BLOCKED** — tested target-specific recovery/PITR authority is absent; PRD O-01/O-14 and the fractional-quantity/DUPA decision are unresolved. | Do not claim commercial readiness or proceed to deployment. |

The handoff remains at its earliest unsatisfied prerequisite: an eventual
immutable normal `main` candidate must first complete Stage 1 with actual CI,
exact target/rollback, and all containment/security prerequisites. A separate
authorized host-security decision or containment-capable host is required
before the local Auth lane may be retried. No provider, database, billing,
runner, migration, or deployment mutation occurred in this checkpoint.
