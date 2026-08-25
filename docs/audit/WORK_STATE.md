# Audit Work State

- Updated: 2026-08-25 Asia/Singapore
- Objective: repository audit, repair, independent verification, guarded
  production promotion, and live validation.
- Branch/baseline: `agent-04/upload-reservations`; audit baseline
  `175eb35a5e40301e2dc82bd0414992633664c6fc`.
- Phase: local remediation resumed; production decision remains `NO-GO`.

## Completed

- Completed bootstrap against PRD v1.4, root AGENTS, ADR-007 through ADR-026,
  relevant engineering skills, and current Supabase/DocuSeal primary guidance.
- Fast-forwarded clean `main`, created the audit branch and preserved user work.
- Generated current-worktree coverage, environment and system/connectivity
  inventories. Baseline was 2,645 tracked files/55,015,525 bytes; current ledger
  includes tracked plus unignored audit/remediation files.
- Reconstructed Web/Core/data/worker/deployment architecture and challenged it
  with independent planning, connectivity and verification principals.
- Ran Node 22 frozen install, lint, typecheck, build, static release gates,
  dependency audits, Gitleaks, worker tests and worker container/import smokes.
- Independently verified local AUD-002 Process registration, AUD-003 Scope
  authorization, and AUD-009 embedding-cache isolation. Production still serves
  the pre-fix Process 404; authenticated deployed Scope browser proof remains
  unavailable.
- Independently reviewed and verified AUD-005 durable DocuSeal evidence, the
  remediated portions of AUD-014 e-sign configuration/signatory integrity, and
  AUD-017's exact embedding dimension contract. Provider/browser/DB integration
  proof remains explicitly blocked.
- Inspected GitHub, Vercel, Railway and linked Supabase without reading secret
  values or mutating provider state. Exactly five distinct principal subagents
  were used; none spawned another agent.
- Recorded current Supabase advisors, release identity/rollback gaps, monitoring
  limits, CI scanner gaps, branch/environment protection and provider revisions.
- Inspected the tracked workbooks read-only without reproducing sensitive rows.
  The public-repository confidentiality response is awaiting exact owner/DPO
  authorization and the branch must not be pushed.
- Implemented the local AUD-004 foundation through the Core authority: additive
  ledger/migration, exact bigint project quota lock, strict contracts, private
  Storage boundary, separately gated issuance/lifecycle/cleanup flags, and
  authenticated reserve/complete/release endpoints. Signing concurrency was
  independently challenged and changed to retain failed reservations safely.
- Final focused Core evidence is 186/186 tests plus API typecheck, scoped lint,
  diff checks, and independent Agent 4/5 PASS verdicts. All flags remain off.
- Implemented the separately gated cleanup lane with global oldest-first expiry,
  deterministic project locks, just-in-time terminal claims, exact-path removal,
  bounded provider retries/exhaustion, recovery after indeterminate finalization,
  scheduler rollback convergence, a 30-second Storage deadline, and structured
  trace-correlated evidence. The document-domain suite passes 125/125 and final
  Principals 3/4/5 read-only reviews report PASS.
- Routed every current Core project-scoped document create/delete writer through
  the exact tenant/project quota lock: intake, public signing, DocuSeal
  completion, project-linked inspection photos, reservation lifecycle, and
  deletion. Pre-project inspection evidence remains outside project quota.
- Completed the default-off Web reservation sign/complete/release cutover.
  Selected issuance fails before Core, database, Storage, or audit side effects
  unless lifecycle, public-signing, and deletion authorities are all selected
  for the same exact tenant. Wildcards cannot satisfy those selectors.
- Moved weekly-report and project-linked inspection-report document metadata to
  Core intake. The 19-case report matrix verifies malformed, thrown, rejected,
  and tenant/project/path-mismatched Core results, exact-object cleanup, redacted
  diagnostics, and no direct document mutation. Pre-project inspection reports
  remain opportunity-scoped and quota-exempt.
- Added the no-skip PostgreSQL 16 cross-session matrix. It observes real database
  lock waits and proves no oversubscription at 500 MiB for
  reservation-versus-reservation and reservation-versus-intake in both winner
  orders, plus terminal release/replay behavior and tenant isolation.
- Added the durable document opportunity/project invariant: the retained
  tenant/opportunity FK preserves pre-project documents, while the new nullable
  composite FK rejects cross-project association and later opportunity
  reparenting. Its fail-closed migration, exact catalogs, collision cases, and
  two-session lock schedule pass the pinned PostgreSQL 16 verifier.
- Added bounded report-only upload reconciliation with a durable BullMQ rollover
  checkpoint and partial terminal/completed indexes. The API matrix passes 133
  tests across 5 files; the database suite passes 8/8; API/database typechecks
  and the pinned PostgreSQL 16 query-plan verifier pass. No legacy deletion was
  inferred and no cleanup authority was broadened.
- Completed the local AUD-012 worker artifact slice under ADR-028: both workers
  now use Python 3.12 on one immutable Alpine base, exact uv/LibreDWG/system
  package provenance, uv locks, hashed exports, non-root runtime images, a
  controlled update/rollback runbook, and immutable-action-pinned CI SBOM/CVE
  gates.
- AI tests pass 8/8 and CAD tests pass 22/22. Two clean builds and smokes per
  worker pass; independent SPDX comparisons have zero dependency differences
  across 75 AI and 81 CAD packages; fail-closed high/critical scans report no
  vulnerable package. Static workflow gates and independent release review pass.

## Principal completion

- `/root`: integrated the audit, reviewed all implementation diffs, and ran the
  recorded scoped gates; repository-wide suite results remain timestamped
  snapshots.
- Principal 1: completed inventory/planning, ADR-027 and exact blocker briefs.
- Principal 2: completed architecture/connectivity audit, read-only.
- Principal 3: completed the reservation, Web/report, selector,
  contention-fixture, reconciliation, and schema implementation/repair slices;
  no push/deploy.
- Principal 4: independently verified reservation lifecycle/cleanup,
  writer/quota behavior, Web/report boundaries, cross-session contention, and
  the opportunity/project migration plus reconciliation, read-only.
- Principal 5: completed provider/release review with a `NO-GO` and independently
  verified the final worker SBOM/SARIF artifacts with no P0-P2 finding, read-only.

## Current failures and blockers

- AUD-007 P0: public repository contains apparent account-level business
  workbooks. Making private, current-file quarantine/removal, and history rewrite
  are three separately authorized owner/DPO actions; none was inferred.
- AUD-004 P1 remains partial only for hosted documents-bucket size/MIME
  enforcement and readback, authenticated direct-browser Storage
  INSERT/UPDATE/DELETE denial and readback, and an exact-tenant hosted canary
  with release/drain evidence. No provider setting was changed and no AUD-004
  selector was enabled.
- AUD-006 P1: fractional construction quantity requires the existing exact
  representation product/schema decision.
- AUD-015 P1: `main` and GitHub `production` environment are unprotected.
- AUD-016 P1: promotion does not prove Web/Core/CAD source convergence and has no
  automatic rollback; failure run `32581336124` left a partial release.
- AUD-021 P1: DocuSeal submission creation supports VO/COC, but the only
  completion authority is BOM-specific; exact transition/warranty/API/schema
  ownership is recorded in a blocker brief.
- AUD-001 governance reconciliation and remaining external PRD sources need owner
  decisions. A controlled authenticated local reservation browser passed 5/5;
  authenticated hosted/provider verification credentials remain unavailable.
- Current Supabase advisors report 10 security WARN and 466 performance items,
  including 342 unindexed foreign keys; leaked-password protection needs owner
  approval and index changes require workload/additive-migration evidence.
- Snyk/Semgrep/Trivy are absent; no `SNYK_TOKEN` name is configured. Monitoring
  alert/SLO receipt is unproven despite quiet 24-hour Vercel/Railway log checks.

## Modified areas

- `tasks/plan.md`, `tasks/todo.md`
- `docs/audit/*`, `docs/handoffs/*`, `docs/changesets/*`
- `scripts/audit/generate-{repository-coverage,environment-matrix,system-inventory}.mjs`
- Architecture/README/user-story documentation corrections
- Principal 3 source/test changes for AUD-002/003/005/009/014/017
- Upload reconciliation API/database source, tests, migration, and runbook/config
- AI/CAD worker manifests, locks, hashed exports, Dockerfiles, tests and docs
- CI worker artifact matrix and static artifact/action verification scripts

## Provider state and rollback

- Web: Ready `dpl_piz7EeuKvsV5XFkqW5UfZWVK6DkB`; prior Ready
  `dpl_6BnVcioDqZ93Ep5NYKwR5heTheqU`.
- Core: healthy `9d5f7c2f-d33f-4a4c-84be-18d4bcfb3af3`, source `044e09bf`.
- CAD: healthy `d59ebaf1-00ec-42b1-ad4f-c97a26cc9cc5`, source SHA absent.
- Supabase: linked project active/healthy on PostgreSQL 17.6.1.121.
- No current audit deployment occurred. Rollback IDs are recorded but no recent
  provider/database rollback drill proves restoration.

## Next exact action

## 2026-08-25 release-candidate checkpoint (supersedes conflicting status above)

- The release candidate was committed locally, history-scrubbed in an isolated
  mirror, and published as GitHub PR #13. The repository is now private.
- Fresh GitHub mirror verification proves `executive-dashboard.xlsx` and
  `source_data.xlsx` are absent from every published branch and tag. Twelve
  historic merged pull-request refs still retain prior objects; GitHub Support's
  sensitive-data purge is required before server-side object reclamation can be
  evidenced.
- Sales can create a tenant-account-backed Lead opportunity with a required
  prospective project name. A delivery project is created only through the Core
  atomic Won handoff, which prefers that Sales-authored name. The legacy
  best-effort conversion path is no longer used by the board action.
- DocuSeal completion now fails closed on multi-source IDs. The PostgreSQL 17
  migration applies partial unique indexes and an advisory-locking cross-table
  trigger for BOM, VO, and COC provider submission IDs.
- Local evidence: lint, typecheck, full `pnpm test` (2,718 passing / 162
  environment-skipped), build, actionlint, storage/boundary/purge helper tests,
  and the isolated PostgreSQL 17 migration proof passed.
- Hosted GitHub CI did not execute: PR #13 runs `32825026450` and `32825026609`
  were denied before runner allocation because the organization has a failed
  payment or insufficient Actions spending limit. This also prevents the manual
  purge and promotion workflows. The private Free plan also rejects branch
  protections/rulesets; the production environment has no protection policy.
- No production E2E tenant, Storage bucket, provider template, canary selector,
  migration, deployment, or rollback drill was changed in this checkpoint.

## Next exact action

Restore GitHub Actions billing/spend capacity; then obtain a real green PR run,
complete the GitHub Support sensitive-data purge, apply governed production
protections, merge, execute the exact-scope E2E cleanup, and dispatch the
promotion workflow with its provider readbacks and release-identity checks.
