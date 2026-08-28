# Production release handoff — fail-closed

> **Status: NO-GO.** This is a release-control handoff, not authorization to
> deploy. Production promotion may begin only at Stage 4 after every exit
> criterion in Stages 1–3 has current, target-specific evidence. A green local
> test or a prior production observation is not a substitute.

## Authority and scope

`docs/PRD.md` requires hosted targets and irreversible releases to have exact
target identity, rollback evidence, and a release gate. Its pre-flight also
requires a tested backup/restore path, CI that executes required tests, and
explicit ABI answers for commercial work. `AGENTS.md` requires CI/security gates
and forbids Agent 13 from bypassing CI or pushing directly to `main`.

This handoff covers the existing recovery PR
[`#14`](https://github.com/Third-Code-Solutions/ERP/pull/14), branch
`codex/release-candidate-trial-port`. The candidate is not a production artifact
until it has been normally merged and the exact resulting `origin/main` commit
has completed every gate below. No force push, branch-history rewrite, provider
setting change, database write, or deployment is authorized by Stages 1–3.

**In scope after each predecessor exits:** release preflight and rollback
inventory; security-gate restoration and review; read-only production
database/schema/migration parity; then the canonical Railway/Vercel/Supabase
production workflow and post-deployment verification.

**Out of scope:** bypassing a failed gate; using production service-role access
for parity; enabling commercial/BOM behavior that ABI has not approved;
changing the `buildops-e2e` allowlist; deploying a PR branch directly; and
manual production SQL, `db reset`, `migration repair`, or force-pushing a
release.

## Current evidence and hard blockers

| Gate | Current evidence | Status |
| --- | --- | --- |
| Candidate lineage | Recovery commits are on an `origin/main`-based port; PR #14 remains open and is not a `main` release artifact. | NOT PROMOTABLE |
| Hosted CI | PR run [`33083718479`](https://github.com/Third-Code-Solutions/ERP/actions/runs/33083718479) failed in `Actionlint`; all downstream CI/security jobs were skipped. The job produced no usable failed-step log. Earlier run evidence in `docs/blockers/2026-08-25-github-actions-billing.md` records the provider billing/spending-limit annotation. | BLOCKED |
| Self-hosted CI fallback | Selected group `erp-ci-isolated` is restricted to this ERP repository, but has zero runners. The local service/firewall plan is pending Agent 12 acceptance and one bounded UAC approval; no active runner can supply CI evidence. | BLOCKED |
| Security tools | Current source evidence has Actionlint and Gitleaks, but no current successful required Snyk, Semgrep, or Trivy gate evidence. `AGENTS.md` makes all four tools gating requirements for Agent 12. | BLOCKED |
| Production DB parity | There is no current, target-identified, explicitly read-only parity report for the final release commit. Historical reports and local 153-migration replay are not current production evidence. | BLOCKED |
| Commercial readiness | PRD O-01 (ABI VAT base) and O-14 (standing rate owner) remain unresolved. They block WO-06 sign-off and any claim that the DUPA/commercial workflow is ready. The fractional-quantity policy/ADR remains separately unresolved. | BLOCKED |

The correct current release status is therefore **NO-GO**. These blockers are
conjunctive: clearing one does not authorize the next stage when any other
required condition remains red, skipped, absent, stale, or target-ambiguous.

## Required sequence

The stages below are strict and sequential. Each receiving owner must re-read
`AGENTS.md`, this handoff, and the immediately preceding changeset; preserve
unrelated work; record non-secret evidence; and stop at the first failed exit
criterion.

### 1. Agent 13 — release preflight, exact targets, and rollback inventory

**Reason:** provider targets, deployment workflow, release identity, and
rollback coordination are Agent 13 responsibilities.

**Inputs:** PR #14; the final normal merge commit on `origin/main` once
available; `.github/workflows/ci.yml`, `.github/workflows/ci-self-hosted.yml`,
and `.github/workflows/deploy-production.yml`; `docs/DEPLOYMENT.md`;
`docs/handoffs/2026-08-27-release-control-recovery.md`; and
`docs/changesets/2026-08-27-runner-isolation-ops.md`.

**Required output:**

1. Record the immutable candidate SHA, its normal `main` ancestry, the exact
   PR/merge evidence, and a clean release worktree. The production workflow is
   `main`-only; do not dispatch it from the PR branch or a local working tree.
2. Re-run or obtain actual CI evidence for that exact SHA. Resolve the hosted
   Actions billing/capacity condition without weakening a workflow, **or** first
   complete the separately reviewed ERP-only runner containment plan and use a
   newly registered eligible runner. A missing runner or provider job log is a
   failed gate, not a successful substitution.
3. Inventory, without exposing secret values, the exact production Supabase
   project reference, Vercel team/project, Railway project/API/CAD service IDs,
   domains, release environment, migration target, and protected production
   credential *names*. Confirm they correspond to the intended ABI OPS
   production environment, rather than relying on prior IDs in documentation.
4. Inventory the exact rollback state before any mutable operation: a tested
   Supabase backup/PITR restore point and owner; the last known-good immutable
   Vercel deployment; last known-good Railway API and CAD deployment IDs; their
   health/revision evidence; and the forward-only database remediation plan.
   Do not treat `supabase db reset --linked` or an unreviewed down migration as
   rollback.
5. Verify that the production workflow remains manual-only, serialized,
   protected by the `production` environment, targets only the inventoried
   services, validates its migration target before SQL, and retains the
   production data-boundary and post-deploy E2E gates. A workflow revision that
   changes those protections requires a new Agent 12 review before continuation.
6. Write an Agent 13 changeset listing the exact candidate, CI run URLs and
   statuses, target/rollback inventory, unresolved gate(s), and explicit
   recommendation either to proceed to Agent 12 or remain NO-GO.

**Must not:** dispatch production promotion; apply a migration; alter an
environment secret; use Default runner-group access; use a PR/local SHA as a
production artifact; or reclassify a skipped/absent check as passed.

**Exit criteria:** an exact `main` candidate exists, every required CI check
has actual completed evidence for it, targets and rollback are uniquely
identified, and the preflight identifies no unresolved CI/target/rollback
ambiguity.

> → Handoff to Agent 12. Reason: deployment may not advance until the actual
> candidate's security controls and security-gate coverage are independently
> accepted. Inputs: Stage 1 inventory, candidate SHA, CI evidence, workflow
> revisions, runner evidence if used, and rollback plan. Expected output: a
> documented PASS or a specific release-blocking security finding.

### 2. Agent 12 — independent security release gate

**Reason:** security checks, runner trust, credential boundaries, RLS evidence,
and production-release control integrity are Agent 12 responsibilities.

**Required output:**

1. Confirm Actionlint, Gitleaks, Snyk, Semgrep, and Trivy are all required,
   correctly scoped, and have successful current evidence for the exact
   candidate. If Snyk/Semgrep/Trivy are absent, unavailable, unconfigured, or
   only historical, record the gap as a blocker and restore a real gate through
   the proper review path; do not relabel Gitleaks as an equivalent substitute.
2. Confirm no CI workflow disables or conditionally avoids test, dependency,
   SAST, container, secret, tenant-isolation, or database-reproducibility
   verification. A successful self-hosted run must additionally meet the
   selected-runner and cleanup controls in
   `docs/handoffs/2026-08-27-self-hosted-runner-isolation.md`.
3. Review the production workflow's least-privilege credential names and use:
   the read-only production boundary URL remains read-only; the migration URL
   is exact-project and write-scoped only within guarded promotion; provider
   credentials are protected environment secrets; and no provider or database
   secret appears in repository files, job output, artifacts, or release notes.
4. Confirm the deployment cannot bypass protected-environment approval, source
   identity, rollback inventory, pre-deploy data-boundary scan, mandatory
   database checks, or the post-deploy role matrix. Review the candidate for
   tenant/RLS and append-only-audit regressions relevant to this release.
5. Record an Agent 12 changeset stating PASS only with exact run IDs/revisions
   and coverage. Any failed, skipped, missing, unactionable, or untrusted-runner
   control is a NO-GO finding and stops this sequence.

**Exit criteria:** all required security gates are green for the exact `main`
candidate, the delivery controls are accepted, no credential/tenant boundary
is weakened, and Agent 12 issues a dated PASS. Existing Snyk/Semgrep/Trivy
evidence is presently insufficient for this criterion.

> → Handoff to Agent 04. Reason: security-green source evidence does not prove
> the live database state to which the candidate would be applied. Inputs:
> Stage 1 inventory, Agent 12 PASS, exact commit/migration manifest, and an
> explicitly read-only production credential. Expected output: a current
> target-specific schema/migration parity report or a release blocker.

### 3. Agent 04 — read-only production database schema and migration parity

**Reason:** migration ledger, schema, RLS, grants, indexes, and audit-log
integrity are Agent 04 responsibilities.

**Required output:**

1. Authenticate to the uniquely inventoried production Supabase target using a
   valid explicit read-only credential. Do not use a service-role key,
   migration connection, browser credential, or any credential whose effective
   privilege has not been proven read-only.
2. Produce a dated parity report for the exact `main` candidate. It must
   distinguish repository expectation from provider observation and include
   target identity; PostgreSQL/server identity; applied migration ledger versus
   the candidate's manifest; schema/extensions/functions/triggers relevant to
   the release; RLS enabled/forced state, policies and grants; tenant and
   audit immutability checks; and all divergence, inaccessible evidence, or
   uncertainty.
3. Verify the planned migration path is additive and compatible with the
   observed state. No `db push`, DDL, data write, `migration repair`, role
   change, seed, or hosted reset is permitted in this stage.
4. Retain non-secret hashes/identifiers and safe query results only. Never
   record credentials, production personal data, tokens, or full sensitive
   records in the report.
5. Write an Agent 04 changeset and dated parity report. If parity is anything
   other than proven for the exact target and candidate, stop and record the
   precise blocker; do not infer parity from old reports or local replays.

**Exit criteria:** current read-only evidence proves the migration/schema/RLS/
audit state required by the exact candidate, the target is unambiguous, and no
divergence or privilege uncertainty remains.

> → Handoff to Agent 13. Reason: only now can the canonical production workflow
> be considered for a controlled promotion. Inputs: Agent 04 parity report,
> Agent 12 PASS, Stage 1 rollback inventory, immutable `main` SHA, and ABI
> commercial gate status. Expected output: either a gated deployment with
> complete evidence or a documented NO-GO.

### 4. Agent 13 — controlled Railway/Vercel/Supabase promotion

**Entry condition: every Stage 1–3 exit criterion is green, and the ABI
commercial gate below is resolved. There is no partial deployment path.**

Before dispatch, Agent 13 must additionally verify that ABI O-01's VAT-base
authority and O-14's named rate owner are source-identified and that the
fractional-quantity/DUPA ADR path is accepted where commercial behavior is
affected. If this evidence is absent, commercial workflow readiness remains
NO-GO and production promotion must not be claimed or performed.

**Required output:**

1. Dispatch only `.github/workflows/deploy-production.yml` from the immutable,
   approved `main` SHA with a traceable reason. Do not use a manual provider
   console deploy, local CLI deploy, or an unreviewed workflow variant.
2. Preserve its order: protected credential validation; production
   data-boundary scan; release checks; exact migration target validation;
   migration dry run; reviewed additive migration application if and only if
   the parity report identifies it as pending; Railway API deployment; Railway
   CAD worker deployment; Vercel production deployment; and built-in health,
   surface, and authenticated E2E gates.
3. Stop on any failure. Roll back only using the Stage 1 recorded target and
   procedure: promote the known-good Vercel deployment, restore/redeploy the
   known-good Railway service revisions, and use a reviewed forward migration
   or the documented PITR path for a database-integrity incident. Never reset
   or repair the hosted migration ledger to force a pass.
4. Record deployment IDs, exact release SHA/revision, migration result,
   protected-environment approval, per-service status, health checks, E2E
   report, logs/metrics references, and rollback decision in an Agent 13
   changeset.

**Exit criteria:** every workflow step completed successfully for the exact
candidate, all in-scope services were deployed, no unapproved commercial
behavior was enabled, and the post-deploy stage below has begun with the
immutable release identity.

> → Handoff to post-deploy verification. Reason: deployment success does not
> prove the live system. Inputs: release SHA, provider deployment IDs, parity
> report, migration outcome, E2E report, and rollback inventory. Expected
> output: independent live evidence or an immediate rollback/escalation.

### 5. Post-deploy verification — Agent 13 with Agent 12/04 review as needed

**Required output:**

1. Verify the intended public Web URL, Web `/api/health` and `/api/ready`,
   Railway API `/health` and `/ready`, and CAD worker `/health` against the
   exact released revision. Confirm the services are the inventoried targets,
   not a preview, stale alias, or another environment.
2. Verify the workflow's authenticated, zero-skip 13-role matrix against only
   the controlled production E2E tenant/accounts and its explicit cleanup/data
   boundary. No ABI-customer account, tenant, or document is a test fixture.
3. Re-read the production migration ledger and targeted schema/RLS/audit
   invariants through the approved read-only path. Confirm no unexpected
   divergence from the Stage 3 report or release manifest.
4. Inspect service/provider logs, errors, queues/readiness, and release
   metrics for the defined observation window. Any authentication, tenant
   isolation, audit, migration, worker, or sustained-error regression is a
   deployment failure: follow the recorded rollback path and open an incident
   record instead of extending the observation window indefinitely.
5. Publish a final evidence-backed release report that distinguishes deployed,
   verified, unverified, and blocked areas. It may call the release **YES-GO**
   only after every prior gate and this live verification are green.

## Commercial readiness remains separate and mandatory

The deployed candidate must not be described as a commercially ready ABI
workflow while the following PRD authorities remain absent:

- **O-01:** ABI's written VAT-base decision (`direct_only` versus
  `direct_plus_indirect`), which blocks WO-06 default/sign-off.
- **O-14:** a named ABI standing owner for rate maintenance, which blocks
  WO-06 sign-off and mitigates stale pricing risk.
- **Fractional quantity/DUPA:** an accepted, source-backed ADR reconciling the
  PRD's decimal example with current integer quantity contracts, precision,
  rounding, migration, and end-to-end commercial regression evidence.

An application release cannot silently substitute a default or historical
workbook for those decisions. Until they are resolved, commercial status is
**NO-GO** even if non-commercial technical services are otherwise healthy.

## Fail-closed rule

If any gate is failed, skipped, missing, stale, tied to a different commit or
provider target, based on a credential with excess privilege, or cannot supply
durable non-secret evidence, stop. Do not deploy, merge to claim success,
weaken the control, create a temporary exception, or reinterpret a local pass
as production proof. Record the blocker, preserve the last known-good
production artifact, and resume at the earliest failed stage only after the
underlying condition changes.
