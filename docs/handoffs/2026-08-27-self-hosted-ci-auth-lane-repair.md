# Self-hosted CI Auth-lane repair handoff

## Trigger and verified scope

Self-hosted workflow run
[`33075859440`](https://github.com/Third-Code-Solutions/ERP/actions/runs/33075859440)
executed the checkout, Node/pnpm setup, dependency installation, workflow
validation, lint, typecheck, and unit-test stages successfully. Its raw
PostgreSQL database lane then failed in
`packages/database/src/__tests__/tenant-invitation-auth-api.database.test.ts`:

- the suite attempted to reach the local Supabase Auth Admin API at
  `127.0.0.1:54321`, which is intentionally absent from the raw PostgreSQL
  lane; and
- the raw database bootstrap does not reproduce Supabase's `extensions`
  schema placement required by the production migration trigger.

The database replay itself completed before that suite: 153 migrations,
protected-table/RLS assertions, and the database reproducibility checks passed.
This is therefore a CI harness topology defect. It is **not** evidence of a
production schema fault, and it does not invalidate the prior real disposable
Supabase Auth proof. It must nevertheless be corrected before this run can be
called a passing release gate.

## Delivery contract

- **Goal:** make both database environments explicit, disposable, required CI
  gates: a raw PostgreSQL reproducibility/RLS lane and a real local
  Supabase/Auth Admin API lane.
- **In scope:** database-test selection/configuration and bootstrap evidence;
  the self-hosted workflow and runner lifecycle; security review of the local
  service, credentials, and cleanup boundary.
- **Out of scope:** production database access or writes, provider changes,
  migrations authored only to accommodate CI, application authorization
  behavior, deployment, and changing the production CSP.
- **Required environment:** Docker must be available to the self-hosted runner
  for the local Supabase lane. Its absence is a failed required gate, never a
  reason to skip the Auth proof.

## Non-negotiable acceptance criteria

1. The raw PostgreSQL 17 lane remains required on every eligible self-hosted
   run. It continues to replay migrations and validate RLS, grants, audit
   immutability, and reproducibility against its intentionally bare database.
2. The real Auth suite is selected out of that raw lane by an explicit,
   reviewable test configuration—not by `describe.skip`, an environment-driven
   silent skip, a reduced assertion, or a disabled workflow step. The suite is
   required immediately afterward in the dedicated Supabase lane.
3. The dedicated lane starts an isolated local Supabase stack, resets the local
   database, obtains the local Auth endpoint/database URL/service credential
   from the running stack, and executes
   `tenant-invitation-auth-api.database.test.ts` through the actual Auth Admin
   API.
4. That dedicated proof has zero skipped or pending tests and verifies the
   explicit self-signup path, all 13 canonical invited roles, fail-closed
   invitation cases, tenant isolation, intent-table client denial, and
   token-free append-only audit evidence required by ADR-030.
5. Both lanes retain machine-readable reports and an aggregate no-skips check;
   a passing raw lane cannot mask a missing or failed Auth lane.
6. Local Supabase containers, volumes/state as applicable, ephemeral files,
   and process resources are cleaned up in an unconditional cleanup path. The
   workflow must stop the local stack with no backup even when setup or tests
   fail. No local service URL, service credential, database URL, or test data
   may be printed, uploaded as an artifact, committed, or carried into another
   run.
7. No production target, Vercel/Railway deployment, hosted Supabase project,
   provider credential, production CSP source, or GitHub billing setting is
   changed by this work. A local pass is CI evidence only, not production
   parity or deployment authorization.

## Sequential ownership and handoffs

Do not perform these stages in parallel. Each receiving agent re-reads
`AGENTS.md` and this handoff, preserves unrelated work, and records a dated
changeset before handing off.

### 1. Agent 04 — Supabase/Drizzle Schema Lead

**Reason:** test-environment selection, database bootstrap semantics, and the
real-Supabase migration proof are database responsibilities.

**Inputs:** ADR-030; the failed run report; `scripts/ci/run-wsl1-database-lane.ps1`;
the raw PostgreSQL bootstrap SQL; the package Vitest configurations; the
invitation Auth API test; and `supabase/config.toml`.

**Required output:**

1. Make raw-compatible test selection explicit and deterministic. The raw
   lane must run only tests whose declared dependencies are raw PostgreSQL;
   `tenant-invitation-auth-api.database.test.ts` must have an explicit real
   Supabase/Auth owner and must remain included in the required Supabase lane.
2. Provide a fail-closed real-Supabase test invocation contract that consumes
   only runtime values emitted by the disposable local stack. It must reject a
   placeholder/missing Auth endpoint or service credential rather than falling
   back to a guessed loopback endpoint.
3. Reproduce the relevant database state by the actual local Supabase reset so
   migrations execute in their supported `extensions` layout. Do not alter a
   historical/production migration merely to make the bare lane accept an
   extension function. If a raw-bootstrap improvement is separately needed for
   structural tests, make it a reviewed, additive harness change with a
   regression test.
4. Add/adjust test assertions so the dedicated suite proves the real Auth
   Admin API path for the existing 13-role contract and fails if any case is
   pending/skipped.

**Must not:** weaken ADR-030, replace Auth API proof with direct SQL, move
production credentials into CI, edit historical migrations, create a migration
solely for CI, or make application/production behavior conditional on the test
environment.

**Exit criteria:** raw tests are explicitly selected and pass with zero
skips; the dedicated test command is documented, fails closed without an
actual local Supabase/Auth runtime, and passes against an isolated local stack
with the real Auth API.

> → Handoff to Agent 13. Reason: the verified database test contracts need to
> become mandatory, cleaned-up self-hosted workflow stages. Inputs: Agent 04's
> selection/configuration changes, test commands, report locations, and local
> stack prerequisites. Expected output: an eligible self-hosted workflow that
> executes both lanes in order and cannot report success without both reports.

### 2. Agent 13 — CI/CD & Ops Agent

**Reason:** the workflow, runner prerequisites, test-report aggregation, and
cleanup lifecycle are CI/Ops responsibilities.

**Inputs:** Agent 04's completed contract; `.github/workflows/ci-self-hosted.yml`;
existing raw database lane script; `supabase/config.toml`; the ephemeral runner
constraints; and run `33075859440` evidence.

**Required output:**

1. Keep the raw PostgreSQL lane as a required gate and add a separate required
   disposable local-Supabase/Auth stage after it. The stage must first verify
   Docker readiness, start the local stack, reset the local database, collect
   local runtime values without echoing secrets, run the Agent 04 command, and
   validate its JSON/no-skips report.
2. Make the workflow fail if Docker/local Supabase startup, reset, status,
   credentials, the Auth test, report parsing, or cleanup verification fails.
   Do not use `continue-on-error`, a conditional fallback, a substitute
   placeholder key, or a test exclusion to turn any of those cases green.
3. Implement `always()`/equivalent cleanup that stops the disposable stack
   with no backup and removes per-run temporary state. Ensure a subsequent
   ephemeral self-hosted runner starts from a clean state.
4. Preserve the existing actor/label eligibility guard and use no production
   secret, hosted database endpoint, or provider deployment command. The
   service key must remain process-scoped and redacted by GitHub Actions.
5. Rerun the complete self-hosted CI workflow on the recovery PR, retaining
   the run URL, commit, per-step status, raw-lane report, Auth-lane report,
   cleanup status, build/smoke result, and security-scan result in the
   evidence ledger.

**Must not:** alter production deployment definitions, disable security
checks, grant the runner organization-wide production access, persist local
database/auth state, or treat a successful raw lane as a replacement for the
Auth lane.

**Exit criteria:** one fresh ephemeral self-hosted run shows both database
lanes passing with zero skips, followed by the existing build, smoke, secret
scan, and cleanup steps; each required stage has durable non-secret evidence.

> → Handoff to Agent 12. Reason: the local Auth runner now handles a privileged
> disposable service credential and Docker resources. Inputs: final Agent 04
> and Agent 13 diffs, the run URL/reports, and cleanup evidence. Expected
> output: an independent security review that either accepts the bounded local
> test surface or reports a release-blocking finding.

### 3. Agent 12 — Security / DevSecOps Agent

**Reason:** local Auth verification must not create a credential, secret,
network, or production-boundary bypass.

**Inputs:** ADR-030; Agent 04's test changes; Agent 13's workflow and report
handling; the self-hosted run evidence; and the current secret-scanning/
security workflow definitions.

**Required output:**

1. Verify the local Auth service credential and database URL are derived only
   from the running disposable stack, are process-scoped/redacted, and never
   reach source control, browser variables, logs, artifacts, caches, or error
   reports.
2. Verify Docker and local Supabase exposure is loopback/disposable only; the
   workflow does not use production hostnames, production secrets, or a
   broad/host-controlled CSP exception.
3. Verify the dual-lane no-skips design cannot silently omit the Auth proof and
   retains the raw PostgreSQL/RLS/reproducibility gate. Review negative paths
   for unavailable Docker, failed cleanup, missing stack status, and placeholder
   values.
4. Run the applicable static/secret/security checks and record the result.
   Any security-gate gap outside the self-hosted harness remains a separate
   release blocker and must not be labeled resolved by this work.

**Exit criteria:** security review reports PASS only with evidence for secret
containment, loopback-only disposable scope, mandatory dual lanes, successful
cleanup, and unchanged production boundaries. A finding blocks promotion until
remediated and independently rerun.

## Release boundary and reporting rule

This handoff repairs one self-hosted CI failure. It does **not** restore hosted
GitHub Actions billing, prove current production database/schema parity, obtain
ABI's fractional-quantity/DUPA decisions, merge PR #14, or authorize a
production deployment. Until those independent gates have current evidence,
the correct release status remains **NO-GO for production**.
