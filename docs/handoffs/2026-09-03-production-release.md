# Production release handoff

- Date: 2026-09-03
- Status: PLANNED — deployment is not yet authorized by evidence
- Scope: integrate the two reviewed feature branches, close two known release-blocking
  authorization/audit defects, and promote one immutable release candidate through the
  protected production workflow
- Product authority: `docs/PRD.md` v1.4, especially §§0.1–0.4, ADR-07, I-02, I-11,
  WO-00, R-10, and §12
- Release authority: ADR-020 and `.github/workflows/deploy-production.yml`

## User story

As ABI's release owner, I need the atomic workflow work and finance database
reproducibility repair integrated into one reviewed commit, with AI auditing and Viewer
read-only behavior corrected, so that the exact ABI OPS production services can be
promoted without losing audit, tenant, data, or rollback guarantees.

This document plans a release. It does not assert that the current branches, browser
matrix, hosted database, or production deployment are already verified.

## Fixed source inputs

The integration owner must fetch and verify these immutable inputs before merging:

| Input | Required commit |
|---|---|
| Base | `origin/main` at `a444ca91e8cc9673f754421541a476e29b85351d` |
| Atomic workflow branch | `origin/agent-05/atomic-site-inspection` at `e06f15825c59c727057010f864036d09e935b5e1` |
| Finance reproducibility branch | `origin/agent-05/finance-database-reproducibility` at `4369a01a469572754865ec5118f6cd44a7382aff` |

The two feature branches share the listed base and have no changed-path overlap at this
checkpoint. That observation reduces expected merge conflict, but it is not a substitute
for reviewing the combined diff and testing the combined tree. If any remote tip has
moved, stop and obtain a newly reviewed immutable SHA rather than silently integrating
new commits.

## Exact production targets

The protected workflow must retain these repository-pinned identities:

| Surface | Exact target |
|---|---|
| Web | Vercel scope `team_n60dl3ccO8BFGFeUKQdqPhp3`, project `thirdcode-erp`, production alias `https://thirdcode-erp.vercel.app` |
| Railway project | `a21fd382-80b2-4218-8025-11f420a062e3`, environment `production` |
| Core API | Railway service `c45b3d01-036a-4663-a524-0713d782fce3`, `https://third-code-erp-api-production.up.railway.app` |
| CAD evidence worker | Railway service `328c6650-306e-4a3c-80dc-7566e80ba86a`, `https://abi-ops-cad-worker-production.up.railway.app` |
| Data plane | Supabase project `aqqrtkmtcsfkbyyqxowv` |

Provider credentials remain GitHub `production` environment secrets. Do not copy their
values into this record, logs, repository variables, or local environment files.

## Release acceptance contract

The release candidate is eligible for protected promotion only when all of the following
are evidenced against the same Git SHA:

1. The combined diff contains both fixed source inputs, no unexplained conflict
   resolutions, and no missing commits; the working tree is clean and the candidate is on
   a reviewed pull request to `main`.
2. AI chat fails closed on append-only audit failure: a valid provider-bound request cannot
   call the provider, start a stream, or return success unless the tenant/actor/project and
   granted-domain audit record succeeds. Tests prove audit rejection produces a typed
   non-success response and zero provider calls without leaking audit/storage details.
3. Viewer implements the explicit workspace policy: every tenant-safe application read
   available through normal business modules is reachable through central capability,
   navigation, route/page, and GET/read-API layers; every mutation control is absent or
   disabled and every direct mutation request remains denied. Secrets, auth tokens, raw
   credentials, and cross-tenant data are never exposed as “read-only data.”
4. The central policy suite covers all 13 persisted roles. Browser/API evidence exercises
   all 13 roles, including Estimator and PM, across representative allowed reads, denied
   writes, direct URLs, refresh, navigation visibility, and direct mutation attempts. No
   skip or missing identity may be reported as a pass.
5. The functional route/RBAC matrix is regenerated from the candidate. Every row required
   by the user's all-routes/all-features release objective is `VERIFIED`; any remaining
   `PARTIAL`, `BLOCKED`, `NOT TESTED`, `FAILED`, or unresolved permission decision keeps
   the production gate closed.
6. Locked install, formatting/lint, type safety, repository invariants, unit/integration/
   contract tests, security scans, PostgreSQL reproducibility, production build, and
   critical Playwright journeys all pass without disabled checks or unexpected skips.
7. The exact database target, backup/PITR checkpoint, migration dry-run, rollback targets,
   protected-environment approval, and provider identities below are recorded before the
   manual workflow is dispatched.

## Sequential ownership

Agents work in this order and do not edit the same files in parallel.

### 1. Agent 13 — construct the integration candidate

- Start from the fixed `origin/main` base and integrate the atomic branch first, followed by
  the finance reproducibility branch. Preserve their commit ancestry or record why the
  reviewed integration method changes it.
- Record both input SHAs, resulting integration commits, combined diff statistics, and any
  conflict resolution. A conflict is returned to the owning agent; Agent 13 does not invent
  product behavior to resolve it.
- Run a locked install and the smallest combined smoke needed to prove the tree is viable.
- Do not push to `main`, migrate, deploy, enable a provider/cutover flag, or mutate hosted
  data.

→ Handoff to Agent 05. Reason: the release candidate contains a known fail-open API audit
boundary and central Viewer capability work. Inputs: clean combined SHA and conflict log.
Expected output: tested backend/shared-policy commits with no schema change.

### 2. Agent 05 — repair AI fail-open auditing

- In the existing AI chat API boundary, make the append-only query audit mandatory before
  provider invocation. Preserve strict input bounds, tenant-scoped context, capability-
  gated domains, private/no-store responses, quota controls, and redacted errors/logs.
- Add regression tests for audit success metadata and audit failure: typed non-success,
  zero provider calls, zero stream, and no sensitive error disclosure.
- Do not enable an AI provider or change prompt/domain authority.

### 3. Agent 05 — implement central Viewer read-only authority

- Update the shared capability/API read contract so Viewer receives every tenant-safe
  business read required by the explicit role brief and no write capability.
- Add a complete 13-role capability table and representative read/write API tests. Prove
  tenant isolation independently of role and prove Viewer cannot create, update, delete,
  approve, issue, upload, submit, transition, or administer state.
- If a requested read would expose a secret, authentication artifact, or cross-tenant data,
  stop and document the exact boundary; do not weaken it.

→ Handoff to Agent 03. Reason: central policy alone does not mount routes/navigation.
Inputs: capability map and tested API contract. Expected output: Viewer-aligned Web routes,
navigation, controls, and browser tests.

### 4. Agent 03 — align Viewer navigation and mounted Web behavior

- Mount all Viewer-authorized tenant reads in the sidebar, command palette, direct routes,
  list/detail pages, and refresh path.
- Hide or disable every mutation affordance for Viewer while retaining server-side denial;
  include empty/loading/error states and desktop/mobile browser coverage.
- Add all 13 role browser identities in the dedicated `buildops-e2e` tenant or stop with an
  explicit missing-identity blocker. Never seed a customer tenant for test convenience.

→ Handoff to Agent 12. Reason: independent authorization, audit, tenant, and secret review
is mandatory. Inputs: candidate SHA and role/browser reports. Expected output: GO/BLOCK
security verdict with reproducible evidence.

### 5. Agent 12 — independent security and release review

- Verify AI audit fail-closed ordering, redaction, no provider call on audit failure, and
  append-only behavior.
- Verify Viewer read breadth and write denial at central policy, navigation, page/control,
  direct route, server action, API, service, and tenant/RLS layers for all 13 roles.
- Run gitleaks and the repository security gates. Any cross-tenant disclosure, audit bypass,
  exposed secret, or Viewer mutation is a release-blocking P0/P1.
- Reconcile `docs/functional/WORK_STATE.md` and its matrix to candidate evidence; do not
  upgrade a status from source tests alone when browser/live proof is required.

→ Handoff to Agent 04. Reason: provider deployment cannot begin without exact database
parity, backup, restore, and migration evidence. Inputs: security GO and immutable candidate
SHA. Expected output: signed database GO/BLOCK record; no application deploy.

### 6. Agent 04 — database, backup, PITR, and migration preflight

- Verify the session-pooler username/port resolve only to Supabase project
  `aqqrtkmtcsfkbyyqxowv`; keep the read-only production-boundary connection separate from
  the write-scoped migration connection.
- Record current provider migration count/checksums and the candidate's ordered migration
  count. Review every pending migration as additive: no destructive DDL, foreign-key
  repointing, monetary float, missing tenant/RLS/audit coverage, or ad hoc repair.
- Produce a dry-run against the exact target and replay from zero on PostgreSQL 17. Run the
  database reproducibility and tenant-isolation suites.
- Record a provider backup identifier and UTC timestamp, verify PITR coverage includes the
  release window, and prove restore into an isolated target. Record the restore check and
  recovery point; “backups enabled” alone is insufficient.
- Define the forward-fix owner for additive defects and the PITR decision authority for
  integrity/destructive failure. Never use hosted `db reset` or unreviewed migration repair.

→ Handoff to Agent 13. Reason: all application/security/database prerequisites are now
either evidenced or blocking. Inputs: immutable SHA, security verdict, database verdict,
backup/PITR/restore evidence, and prior provider deployment IDs. Expected output: protected
promotion and completed live release record.

### 7. Agent 13 — protected production promotion

- Confirm the candidate is merged to `main` through a reviewed PR and capture exact
  `main` SHA. The workflow cannot run from the release branch.
- Record the current known-good Vercel, Railway API, and Railway CAD deployment IDs before
  dispatch. Confirm GitHub `production` approval and every required secret/variable exists
  without printing values.
- Manually dispatch `Production promotion` once with the reviewed reason. Do not execute
  provider CLIs from a workstation or reconnect Vercel Git.
- Require the workflow's pre-mutation gates, exact-target migration validation/dry-run,
  additive migration apply, exact Railway/Vercel deploys, public health/readiness, production
  surface verification, and authenticated Chromium suite to pass.
- After deployment, prove `/api/health` and `/api/ready` revision equals the exact release
  SHA (or record the workflow-approved immutable deployment identity), all three target URLs
  are healthy, 13-role read/write boundaries hold, critical workflows persist across refresh,
  and error logs contain no new release-correlated P0/P1 failures.
- Append all evidence to `docs/changesets/2026-09-03-production-release.md`. A failed or
  partial workflow is not a successful release.

→ Handoff to Agent 01. Reason: reconcile delivered behavior and evidence with product truth.
Inputs: completed release record and provider identities. Expected output: final product
GO/BLOCK statement without changing the PRD unless behavior actually changed.

## No-deploy conditions

Do not dispatch, or stop before the first provider mutation, when any condition below is
true:

- An input branch tip differs from the fixed SHA without a fresh review, the candidate is
  dirty, the reviewed PR is not merged to `main`, or the workflow would deploy a different
  commit.
- Any required CI/security/database/build/browser gate fails, is skipped, times out, or is
  unavailable; any in-scope P0/P1 remains open; or the functional matrix is not release-
  complete for the user's stated all-feature/all-role objective.
- AI provider work can continue after an audit write fails, or audit/error data can leak raw
  prompts, credentials, tokens, request hashes, or provider payloads.
- Viewer lacks a required tenant-safe read, can reach any mutation, or tenant isolation is
  not proven for all 13 roles. Missing Estimator or PM browser identities are blockers, not
  acceptable skips.
- The production data-boundary scan is not clear, unexpected `E2E_`/foreign test data is
  reachable in an ABI tenant, or a customer tenant was added to the demo allowlist.
- The Supabase target is not exact; migration parity/checksums are unknown; dry-run or
  PostgreSQL 17 replay fails; pending SQL is destructive or unreviewed; or backup/PITR and
  isolated restore evidence are absent.
- Any protected credential/approval is missing, an exact Vercel/Railway identity mismatches,
  prior rollback deployment IDs are unknown, health/readiness is not green, or a required
  cutover/feature flag would need to be guessed or silently enabled.

## Rollback contract

1. Stop promotion immediately on migration, deploy, health, identity, browser, tenant, or
   audit failure. Preserve workflow logs and timestamps; do not retry blindly.
2. If database state is intact, promote the recorded prior Vercel deployment and redeploy
   the recorded prior Railway API/CAD deployments. Verify their health/readiness and
   revision before reopening traffic.
3. Do not roll migrations backward automatically. For an understood additive defect, ship a
   reviewed forward-only fix. For uncertain/destructive/integrity impact, freeze writes and
   restore the recorded backup/PITR point under Agent 04 authority; account separately for
   Storage objects because database restore does not restore them.
4. Rerun public health, authenticated role/RBAC smoke, tenant-isolation probes, critical
   persistence/refresh journeys, and release-correlated log review after rollback.
5. Record the incident, rollback IDs, data-recovery decision, and residual impact in the live
   release record. A rollback closes traffic risk, not the root-cause ticket.
