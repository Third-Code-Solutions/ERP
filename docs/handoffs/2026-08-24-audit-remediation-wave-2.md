# Audit remediation wave 2 — ordered handoff

- Date: 2026-08-24
- Coordinator: Agent 01 — Product/PRD Guardian
- Status: authorized for safe, reversible local implementation
- Production status: blocked; this handoff authorizes no push, PR, provider
  mutation, deployment, data change, or history rewrite
- Evidence baseline: `docs/audit/FULL_REPOSITORY_AUDIT.md` and
  `docs/audit/REMEDIATION_TRACKER.md`

## Goal and delivery boundary

Remediate the locally actionable audit findings in this strict order:

```text
AUD-004 upload reservations
  -> AUD-021 non-BOM DocuSeal completion
  -> AUD-016 release identity and compensation
  -> AUD-012 reproducible Python workers
  -> AUD-019 foreign-key index coverage
  -> AUD-011 security gates + AUD-020 CI duration
```

The order is a correctness dependency, not a priority suggestion. Document
authority is stabilized before a second signing workflow is connected; service
identity is defined before worker artifacts are made reproducible; migrations
settle before CI is changed; CI is optimized only after all required gates are
present.

Local completion means source, tests, additive migrations, and reversible
configuration are verified in disposable/local environments. Hosted/provider
completion remains separately gated wherever named below.

## Universal execution contract

1. Agents execute sequentially. Do not edit the same file or subsystem in
   parallel. The receiving agent re-reads `AGENTS.md`, `docs/PRD.md`, its Agent
   Registry section, and every cited ADR/blocker before acting.
2. Each agent stays inside its registered paths, writes a dated changeset, and
   ends with an explicit handoff containing changed files, commands/results,
   failures, remaining uncertainty, and the next expected output.
3. Migrations are additive, created only through
   `supabase migration new <descriptive-name>`, replayed from zero, and never
   applied to hosted Supabase under this authorization. No existing migration
   filename or history entry is rewritten.
4. Tenant identity comes only from verified server authority. RLS, direct-client
   denials, append-only audit behavior, typed validation, idempotency, structured
   observability, and negative cross-tenant tests are merge gates.
5. No secret value, signed URL/token, workbook row, document content, provider
   payload, or raw unbounded provider error enters source, fixtures, logs, or
   artifacts.
6. No gate is disabled, made advisory, skipped, mocked green, or replaced by a
   weaker check. No dependency is added without an applicable accepted ADR.
7. A slice cannot be marked complete from a diff. Run focused tests, affected
   workspace lint/typecheck/tests/build, relevant static release gates, and the
   full repository gates proportionate to the change. Report `PASSED`, `FAILED`,
   `BLOCKED`, or `NOT RUN` exactly.
8. Stop on a material product/provider/owner decision. Preserve the local work,
   record the exact boundary, and continue only with an independent safe slice;
   do not fill missing business values with a convenient default.

## 1. AUD-004 — durable signed-upload reservations

**Authority:** accepted
`docs/adrs/ADR-027-durable-signed-upload-reservations.md`.

### Ordered ownership

1. **Agent 04 — schema and transaction foundation.** Add the tenant/project/
   actor-scoped reservation model, exact state constraints, idempotency and
   lookup indexes, tenant-composite foreign keys, server-only grants/RLS, Drizzle
   exports, and disposable database tests. Project-row locking must serialize
   committed document bytes plus unexpired active reservation bytes.
2. **Agent 05 — Core and shared contracts.** Make Core authoritative for reserve,
   release, expiry, completion, and reconciliation. Require `reservationId`;
   derive stored metadata from the reservation; call Storage `info(path)` outside
   transactions; atomically insert document, complete reservation, and append
   audit evidence. Add fail-closed provider error mapping and idempotent cleanup.
3. **Agent 03 — Web adapter and user flow.** Replace caller-authoritative sign/
   complete behavior with the strict Core contract, preserve upload progress and
   actionable retry/cancel states, and ensure failed completion does not silently
   strand an object or report success.
4. **Agent 12 — security verification.** Prove direct browser reservation and
   `documents` bucket mutation denial, exact signed-path scope, token/log
   redaction, tenant isolation, expiry/replay behavior, and cleanup safety.
5. **Agent 13 — release packet only.** Add a read-only/readback plan for the
   private `documents` bucket's exact 104,857,600-byte limit and global-limit
   preflight. Do not change the hosted bucket in this wave.

### Local acceptance criteria

- [ ] The 100 MiB file and 500 MiB project limits are enforced with a locked
  project row against committed documents plus active reservations.
- [ ] Parallel reserve/complete/release/expiry tests prove no oversubscription,
  double completion, terminal-state reopening, or idempotency-key aliasing.
- [ ] Missing object, actual-size mismatch, normalized-content-type mismatch,
  Storage timeout, expired reservation, revoked membership, foreign actor,
  foreign project, and foreign tenant all fail before document mutation.
- [ ] Provider metadata inspection occurs outside the database transaction;
  document, reservation, and audit changes commit or roll back together.
- [ ] Deterministic cleanup retries only reservation-owned paths and never
  infers deletion of legacy/unmapped objects.
- [ ] Zero-to-current migration replay, RLS/grant catalog checks, affected
  workspaces, and relevant browser/route tests pass without new skips.

### Held release evidence

Hosted bucket mutation/readback, managed migration parity, one controlled real
upload, and protected browser evidence remain blocked until the exact provider
change is separately approved. Local completion does not close those gates.

**Handoff:** Agent 12 -> Agent 01. Expected output: a local AUD-004 verdict and
an exact list of provider-only evidence still required before AUD-021 starts.

## 2. AUD-021 — entity-neutral DocuSeal completion authority

**Authority boundary:** connect only behavior already present in the repository.
The safe local slice may route DocuSeal completion to the existing VO and COC
signed transitions, but it must not invent a warranty duration, notification
recipient, template identifier, credential, provider payload, or assurance rule.
The current 365-day behavior may be preserved for compatibility; PRD O-10 still
blocks presenting it as an approved ABI warranty term.

### Ordered ownership

1. **Agents 01 then 14 — semantic freeze.** Produce a concise implementation
   contract identifying the existing BOM, VO, and COC transition behavior that
   may be reused unchanged. Explicitly separate local compatibility behavior
   from O-04/O-10 and provider/compliance evidence. Stop if implementation would
   require a new warranty, retention, recipient, or assurance decision.
2. **Agent 04 — correlation integrity.** Review provider submission identity and
   add only the smallest tenant-scoped uniqueness/lookup migration required to
   correlate one provider ID to one entity type and entity ID. Prove cross-tenant
   collision and concurrent-delivery behavior in a disposable database.
3. **Agent 05 — entity-neutral Core authority.** Replace BOM-only dispatch with a
   strict discriminated BOM/VO/COC result. Resolve the entity server-side, fetch
   and persist the bounded signed artifact, transition the correct entity, append
   audit evidence, and enqueue only existing notifications atomically. Duplicate
   delivery returns the saved result; conflicting correlation fails closed.
4. **Agent 03 — Web compatibility.** Remove any remaining Web-only completion
   authority, preserve initiation and visible states, and ensure unhandled or
   configuration-required results are explicit rather than false success.
5. **Agent 12 — provider/security review.** Verify webhook authentication,
   tenant isolation, payload bounds, artifact retention, SSRF controls, replay,
   concurrency, audit semantics, and redaction across all three entity types.

### Local acceptance criteria

- [ ] Exact provider IDs, not slugs, correlate uniquely to BOM, VO, or COC.
- [ ] BOM behavior remains regression-equivalent; VO and COC completion each
  attach one durable document and perform one atomic existing transition.
- [ ] Wrong-tenant, unknown, ambiguous, mismatched-type, duplicate, concurrent,
  missing-artifact, provider-timeout, and transaction-failure tests fail closed.
- [ ] A COC completion does not introduce or silently change warranty policy;
  compatibility behavior and unresolved O-10 approval are visible in evidence.
- [ ] Shared contracts contain no BOM-specific result fields masquerading as a
  generic webhook response, and all mutations write semantic audit evidence.
- [ ] Disposable database, Core/shared/Web focused suites, affected full suites,
  and static provider-boundary checks pass.

### Held release evidence

Real O-04 DocuSeal templates, credentials, provider webhook/artifact behavior,
approved warranty terms, and authenticated browser journeys remain blocked.

**Handoff:** Agent 12 -> Agent 13. Expected output: locally verified BOM/VO/COC
source behavior plus the exact provider/product evidence excluded from release.

## 3. AUD-016 — release identity, convergence, and compensation

**Authority:** extend ADR-020 without weakening its main-only, exact-target,
additive-migration, secret-isolation, or authenticated-E2E requirements.

### Ordered ownership

1. **Agent 05 — Core revision surface.** Expose a bounded non-secret build
   revision in health/readiness and tests; startup fails or readiness degrades
   when a production artifact has no valid revision.
2. **Agent 06 — CAD revision surface.** Add the same provider-neutral revision
   contract to CAD health without changing parse behavior.
3. **Agent 03 — Web revision surface.** Make Web health/readiness report the
   immutable build revision used by the deployed artifact.
4. **Agent 13 — promotion orchestration.** Before mutation, capture prior Web,
   Core, and CAD deployment IDs and the migration baseline. Define a release
   manifest for changed components and explicitly retained no-op components.
   Read Railway/Vercel terminal state and live revision; fail an unapproved skip
   or mismatch. On post-deploy failure, compensate application artifacts to the
   captured IDs and verify them. Database rollback remains an additive forward
   repair, never destructive reversal.
5. **Agent 12 — workflow threat review.** Verify secrets cannot reach health,
   logs, summaries, artifacts, or untrusted PRs and that rollback authority is no
   broader than promotion authority.

### Local acceptance criteria

- [ ] Web/Core/CAD expose the same strict revision schema with invalid/missing
  production-revision negative tests.
- [ ] Workflow tests cover changed deployment, approved watched-path no-op,
  unapproved skip, provider terminal failure, live mismatch, failed E2E,
  compensation success, compensation failure, and additive DB forward repair.
- [ ] A green plan requires every changed service to match the candidate release
  manifest and every retained service to match an explicitly recorded artifact.
- [ ] Rollback inputs are captured before mutation and cannot be supplied by an
  untrusted caller; post-compensation health and revision are rechecked.
- [ ] Actionlint, pinned-action verification, release-plan tests, affected
  application gates, and production workflow static tests pass.

### Held release evidence

No provider deployment or rollback drill is authorized. AUD-015 protection must
be resolved before a live ADR-020 exercise; current provider IDs are evidence,
not permission to mutate them.

**Handoff:** Agent 12 -> Agent 06. Expected output: a source-verified release and
compensation contract ready to identify reproducible worker artifacts.

## 4. AUD-012 — reproducible Python worker artifacts

The safe slice must not silently resolve AUD-001's Python 3.11-versus-3.12
governance conflict. First make the currently verified worker runtime immutable
and reproducible. A runtime-version change requires explicit reconciliation or
complete compatibility evidence and does not ride inside dependency locking.

### Ordered ownership

1. **Agent 06 — CAD worker.** Pin the official base image by immutable digest,
   lock exact Python dependencies with hashes, preserve LibreDWG/system-package
   provenance, add a controlled update procedure, and prove clean build, import,
   parser tests, and deterministic fixture output.
2. **Agent 08 — AI worker.** Apply the same digest and hash-lock discipline,
   preserve model/embedding contracts, and prove clean build, import, tests, and
   fail-closed provider configuration.
3. **Agent 13 — artifact/SBOM CI.** Build both images from clean state, generate
   machine-readable SBOMs with pinned tooling, verify expected base/dependency
   identities, and retain bounded artifacts. Do not publish or deploy images.
4. **Agent 12 — supply-chain review.** Check digest provenance, hashes, licenses,
   CVE output, secret absence, non-root/runtime controls, and update/rollback
   documentation.

### Local acceptance criteria

- [ ] No worker Dockerfile uses a floating base tag and no Python requirement
  uses an open range or unhashed transitive resolution.
- [ ] Two clean builds from the same source resolve the same base and dependency
  identities; worker tests/import smokes and CAD deterministic fixtures pass.
- [ ] SBOMs identify OS and Python packages without secrets or local paths, and
  the vulnerability scan is fail-closed with documented triage for any finding.
- [ ] Updating a base/dependency requires an explicit lock refresh, diff, tests,
  SBOM, and rollback artifact; no application dependency is added implicitly.
- [ ] The unresolved runtime-policy discrepancy remains attached to AUD-001 and
  is not falsely reported as reconciled.

**Handoff:** Agent 12 -> Agent 04. Expected output: reproducible local worker
artifacts and evidence, with runtime-policy reconciliation still correctly
separated.

## 5. AUD-019 — foreign-key index coverage

### Ordered ownership

1. **Agent 04 — inventory and bounded migrations.** Generate an exact catalog
   of foreign keys not covered by a leading-column index, rank high-write and
   high-cardinality paths first, and split additions into reviewable additive
   batches. Cover all foreign keys or stop for a specific accepted ADR exception;
   advisor “unused” output never authorizes an index removal.
2. **Agent 13 — operational review.** Review migration lock/time/storage risk,
   batch ordering, statement timeouts, abort criteria, and rollback/forward-fix
   procedure. Build a hosted readback/canary plan only; do not apply it.
3. **Agent 04 — verification closeout.** Replay every batch from zero, assert
   catalog coverage, compare representative plans on deterministic fixtures,
   and prove no table/RLS/constraint/data drift.

### Local acceptance criteria

- [ ] A deterministic test fails for each foreign key lacking an exact usable
  leading-column index and passes after the ordered migration series.
- [ ] Migrations contain index additions only; no bulk drop of duplicate or
  unused indexes and no direct hosted SQL is included.
- [ ] High-risk tables named by AUD-019 are covered in the first batch and each
  later batch is independently replayable and reviewable.
- [ ] Representative `EXPLAIN (ANALYZE, BUFFERS)` on disposable fixtures shows
  expected index availability without claiming hosted latency improvement.
- [ ] Zero-to-current replay, empty-schema-diff, database tests with no skips,
  build-ops invariants, and migration release planner pass.

### Held release evidence

Hosted index creation, production query plans, advisor delta, storage/write
overhead, and canary monitoring require a separate database/provider approval.

**Handoff:** Agent 13 -> Agent 12. Expected output: locally complete, bounded FK
index migrations and an unexecuted hosted rollout/abort packet.

## 6. AUD-011 and AUD-020 — complete security gates, then optimize CI

Security coverage is added before performance work. The under-eight-minute goal
never authorizes conditional skips, reduced scan scope, unpinned actions, or
weaker test commands.

### Ordered ownership

1. **Agent 12 — scanner policy and implementation.** Preserve Gitleaks and both
   pnpm audits; add pinned fail-closed Semgrep SAST and Trivy filesystem/image/
   IaC coverage with bounded SARIF/artifacts. Define Snyk's exact job, scope, and
   secret contract without embedding credentials or creating a knowingly red
   default branch.
2. **Agent 13 — CI integration.** Give every scanner a stable required-check
   identity, least permissions, timeouts, artifact retention, and trusted-PR
   secret boundary. Add workflow contract tests and keep all action references
   immutable.
3. **Agent 13 — profile and optimize.** Measure job and install/build/test phases,
   then improve safe caching, dependency reuse, and job parallelism. Preserve
   clean-build/database reproducibility and ensure cache keys include lockfile,
   runtime, platform, and relevant configuration identity.
4. **Agent 12 — independent gate review.** Prove malicious source, dependency,
   secret, container, and IaC fixtures fail their intended gates and that cache
   hits cannot bypass a scan.

### Local acceptance criteria

- [ ] Actionlint and pinned-reference checks pass; Semgrep and Trivy execute
  real fail-closed scans locally/CI-fixture tests and produce bounded evidence.
- [ ] Known-bad test fixtures fail each scanner while clean source passes; no
  scanner is `continue-on-error`, advisory-only, or excluded from required jobs.
- [ ] Missing `SNYK_TOKEN` fails only an explicitly protected Snyk activation
  preflight; it is never substituted, printed, or silently treated as success.
- [ ] Profiling evidence identifies the optimized critical path, and cached and
  cold runs execute equivalent lint/type/test/database/build/security gates.
- [ ] No-skip assertions, database reproducibility, authenticated trusted-PR E2E
  contract, artifacts, and full repository gates remain intact.
- [ ] A real trusted PR completes the required typical path in under eight
  minutes before AUD-020 closes; local estimates alone are insufficient.

### Held release evidence

Snyk activation remains blocked until the provider secret exists and its owner/
scope is approved. Required-check enforcement and real trusted-PR timing require
GitHub provider evidence; AUD-015 must be resolved before those rules are called
protected.

**Final handoff:** Agents 12/13 -> Agent 01. Expected output: consolidated local
verification, exact remaining external gates, and no production-readiness claim.

## Findings intentionally held outside this wave

| Finding | Status retained | Missing authority/evidence |
| --- | --- | --- |
| AUD-001 governance drift | BLOCKED | project-owner sign-off for `AGENTS.md` stack/path/toolchain reconciliation |
| AUD-006 fractional quantity | BLOCKED | exact representation ADR and product/schema approval |
| AUD-007 public workbooks | BLOCKED / P0 | three separate owner/DPO actions: visibility, current-file quarantine, coordinated history decision |
| AUD-010 environment matrix | PARTIAL/BLOCKED | owners for required/optional/default semantics and exact external provider values |
| AUD-013 monitoring | BLOCKED | provider projects, owners, retention, SLO/alert targets, and receipt evidence |
| AUD-014 external e-sign evidence | PARTIAL/BLOCKED | real O-04 templates, credentials/provider configuration, assurance decision, and browser journey |
| AUD-015 production controls | BLOCKED | owner-approved GitHub `main` rules and `Production` environment reviewers/policy, then negative readback tests |
| AUD-018 Supabase advisor actions | PARTIAL/BLOCKED | owner/provider approval for leaked-password protection and evidence-backed helper/extension/RLS changes |

These boundaries do not block the ordered local slices above. They do block a
push/PR where confidentiality is unresolved, any provider mutation, production
promotion, and any statement that the repository is fully remediated or
production-ready.

## Wave closeout evidence

Agent 01 may close wave 2 locally only when every active slice has its changeset,
ordered handoff chain, focused and full verification evidence, explicit skipped/
blocked checks, and a clean separation between local implementation and provider
activation. Any remaining P0/P1 product or provider boundary stays visible in
the audit tracker; this handoff does not edit or reclassify audit findings.
