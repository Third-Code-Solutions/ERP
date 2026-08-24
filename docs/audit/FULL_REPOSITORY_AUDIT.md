# Full Repository Audit

- Audit date: 2026-08-24
- Source baseline: `175eb35a5e40301e2dc82bd0414992633664c6fc`
- Audit branch: `agent-01/full-repository-audit`
- Overall status: `COMPLETED WITH BLOCKERS`
- Production release status: `NO-GO — active P0 and P1 release gates remain`

## Scope and evidence model

The audit covers every tracked first-party application, package, worker,
migration, script, configuration, workflow, document, and deployable surface.
The coverage ledger inventories all 2,645 baseline files and the current 2,673
tracked or unignored files; the generated ledger records the byte snapshot.
Every non-binary file was opened in a scalable content pass; binary/generated
artifacts are explicitly excluded with reasons. Behavioral claims require direct
review, executable checks, runtime probes, or current provider evidence.

Status meanings: `VERIFIED` has direct evidence; `PARTIALLY VERIFIED` has clear
source evidence but a named runtime/provider gate remains; `BLOCKED` requires an
exact external decision, credential, or protected environment; `VERIFIED LOCALLY`
means the source fix and applicable local gates pass but no production claim is
made.

## Actual system architecture

```text
Browser
  -> Next.js 15 Web (Vercel)
       -> Server Components and 52 Server Action modules
       -> direct Drizzle/Postgres compatibility paths
       -> 34 Next route handlers
       -> selective Nest REST calls through erp-core-client.ts
       -> Supabase Auth/Storage/Realtime and external integrations
  -> NestJS 11 Core (Railway)
       -> 72 controllers / 133 endpoint decorators
       -> Drizzle/Postgres 17 and Redis/BullMQ
       -> CAD and optional AI FastAPI worker boundaries

Data plane: Supabase Postgres 17/Auth/Storage/Realtime/pgvector
Workers: Railway CAD; AI worker has config but no canonical production target
Promotion: manual, main-intended GitHub workflow (ADR-020); provider protections absent
```

The executable architecture is not the tRPC/TanStack Query/Zustand topology in
root `AGENTS.md`. Web remains a compatibility application layer with manual
tenant predicates; Nest REST is selectively authoritative.

## Consolidated register

| ID | Severity | Area | Status | Release impact |
| --- | --- | --- | --- | --- |
| AUD-001 | P1 / High | Governance/toolchain authority | BLOCKED | Owner sign-off required |
| AUD-002 | P1 / High | Process API connectivity | VERIFIED LOCALLY | Deploy verification blocked |
| AUD-003 | P1 / High | Scope broken access control | VERIFIED LOCALLY | Browser/deploy verification blocked |
| AUD-004 | P1 / High | Upload quota/object integrity | PARTIALLY REMEDIATED / VERIFIED LOCALLY | Blocks release |
| AUD-005 | P1 / High | DocuSeal durable signed evidence | VERIFIED LOCALLY | Provider/deploy verification blocked |
| AUD-006 | P1 / High | Fractional BOM quantities | BLOCKED | Product/schema ADR required |
| AUD-007 | P0 / Critical | Publicly exposed business-data workbooks | BLOCKED | Immediate owner/DPO action required |
| AUD-008 | P2 / Medium | Documentation/product copy drift | VERIFIED LOCALLY | None |
| AUD-009 | P2 / Medium | AI embedding cache collision | VERIFIED LOCALLY | None |
| AUD-010 | P2 / Medium | Environment contract drift | PARTIALLY REMEDIATED | Provider parity gate |
| AUD-011 | P2 / Medium-High | Required security CI absent | BLOCKED | Blocks policy-compliant release |
| AUD-012 | P2 / Medium | Python build reproducibility | OPEN | Supply-chain risk |
| AUD-013 | P2 / Medium | Monitoring evidence absent | BLOCKED | Provider ownership required |
| AUD-014 | P1 / High | E-sign config/signatory integrity | PARTIALLY REMEDIATED / BLOCKED | O-04/provider/assurance proof required |
| AUD-015 | P1 / High | Production change-control protections | BLOCKED | Blocks release/deployment |
| AUD-016 | P1 / High | Release identity and rollback are not fail-closed | OPEN | Blocks release/deployment |
| AUD-017 | P2 / Medium | AI embedding dimension contract | VERIFIED LOCALLY | None |
| AUD-018 | P2 / Medium | Hosted Supabase security advisors | BLOCKED/PARTIAL | Owner/provider hardening required |
| AUD-019 | P2 / Medium-High | Hosted Supabase index debt | OPEN | Performance/readiness gate failed |
| AUD-020 | P3 / Low | Trusted-PR CI duration objective | OPEN | 10 min exceeds 8 min objective |
| AUD-021 | P1 / High | Non-BOM DocuSeal completion authority | BLOCKED | VO/COC signing is incomplete |

AUD-007 is an active Critical/P0 confidentiality risk because provider inspection
confirmed the GitHub repository is public. No row-level data is reproduced here.

## AUD-001 — Repository policy contradicts executable architecture

- Severity/status: `P1 / High governance risk — BLOCKED`.
- Affected: `AGENTS.md`, manifests, runtime pins, workflows, actual source paths.
- Evidence/reproduction: policy specifies pnpm 9, PostgreSQL 16, Python 3.12,
  tRPC/TanStack/Zustand, and paths such as `apps/web/app`; executable source uses
  pnpm 10.33, PostgreSQL 17, Python 3.11 worker images, Nest REST, and
  `apps/web/src/app`. The named client-state/API packages are absent.
- Expected/actual: one authoritative stack and ownership map; policy currently
  directs agents to nonexistent paths and technologies.
- Root cause/impact: governance did not move with migrations, so routing and
  reproducibility decisions can be wrong before implementation starts.
- Remediation/dependency: owner-approved reconciliation. The file footer requires
  project-owner sign-off, which this request does not explicitly identify.
- Verification/owner: version/path contract and frozen install; Repo Agent 01.

## AUD-002 — Process/SLA Core surface is absent in production

- Severity/status: `P1 / High — VERIFIED LOCALLY; DEPLOYMENT BLOCKED`.
- Affected: `apps/api/src/app.module.ts`, `apps/api/src/process/*`, Process page.
- Evidence: `ProcessModule` registers 13 endpoints but is the sole feature module
  absent from `AppModule`; current tests instantiate its controller directly.
- Reproduction: Core `/health` and `/ready` returned 200, `/v1/today` returned
  expected unauthenticated 401, and `/v1/process/health` returned 404.
- Expected/actual: a protected route should be registered and return 401 without
  auth; all 13 Process routes are unreachable.
- Root cause/impact: missing root-module wiring and a test topology that bypassed
  production registration; the Process page can only show unavailable.
- Remediation implemented: `ProcessModule` is imported by `AppModule`; an
  AppModule metadata regression prevents the module from being dropped again.
- Verification/owner/deploy: targeted and full Core gates, then live 401 plus
  authenticated inventory; Repo Agent 05 / Principal 3; deployment pending.

## AUD-003 — Viewer can mutate same-tenant project Scope and costs

- Severity/status: `P1 / High broken access control — VERIFIED LOCALLY; BROWSER/DEPLOYMENT BLOCKED`.
- Affected: project Scope actions/page and mutation controls including CAD upload.
- Evidence/reproduction: actions authenticate and tenant-filter but have no
  capability check; page controls render for every role. Viewer is contractually
  read-only and can reach projects.
- Expected/actual: authorization fails before data access and UI hides mutations;
  same-tenant Viewer currently reaches direct Drizzle writes.
- Root cause/impact: compatibility actions predate the shared capability matrix;
  low privilege can alter quantities/cost evidence or delete scope.
- Remediation implemented: every mutation checks canonical `bom.edit` before a
  query; manual controls use `bom.edit`, CAD upload uses `document.manage`, and
  Viewer negative tests prove fail-before-query behavior.
- Verification/owner/deploy: action tests, page/static and browser coverage; Repo
  Agent 03 with shared authorization contract; deployment pending.

## AUD-004 — Upload quota and object metadata are bypassable

- Severity/status: `P1 / High — source VERIFIED; provider settings PARTIAL`.
- Affected: sign/complete routes, CAD upload hook, Core intake service, Storage.
- Evidence/reproduction: signing trusts caller size, quota counts only completed
  documents, no reservation exists, completion trusts path/size/MIME, client
  leaves an object after completion failure, and the migration encodes no bucket
  limit. Repeated sign/upload-without-complete never advances quota; completion
  can register a nonexistent or mis-sized object.
- Expected/actual: pending and completed bytes count atomically and completion
  verifies actual tenant-scoped object metadata.
- Root cause/impact: multi-step intake lacks reservation/reconciliation/provider
  enforcement, permitting storage exhaustion and corrupt evidence.
- Remediation: additive expiring reservations, atomic accounting, object metadata
  verification, bucket policy, orphan cleanup, idempotency, isolation tests.
- Remediation implemented locally: ADR-027, the additive reservation ledger and
  shared exact bigint quota lock, strict shared contracts, private-bucket
  Storage adapter, and authenticated Core reserve/complete/release authority.
  The service verifies active membership/project/capability, serializes quota,
  derives immutable paths and completion metadata, calls Storage outside final
  transactions, handles exact replay/terminal races, and records sanitized
  reserve/sign/complete/release outcomes. Signing failure remains active for
  retry/expiry so one concurrent provider failure cannot invalidate another
  caller's valid credential. The separately gated cleanup lane now expires a
  global oldest-first batch under deterministic project locks, claims one
  terminal row at a time, deletes only the immutable ledger path outside the
  transaction, applies bounded retry/exhaustion, recovers indeterminate stale
  claims, and emits redacted trace-correlated evidence. Storage requests have a
  30-second abort deadline and disabling the lane removes its scheduler on a
  bounded best-effort path.
- Local verification: reservation schema/migration/contracts, 186 focused Core
  tests, and the 20-file/125-test document-domain suite pass with API typecheck,
  scoped lint, diff checks, inactive-role/project negatives, mixed signing
  outcomes, cleanup fairness/retry/deadline cases, and final independent
  implementation/verification/operations review PASS.
- Remaining dependency/verification: deterministic reconciliation, Web adapter
  cutover, every quota-affecting document writer adopting the shared
  project lock, browser/direct-Storage denial, disposable database concurrency/
  RLS replay, and provider bucket setting readback/canary; Agents 03 -> 12/13.

## AUD-005 — DocuSeal completion can lock without durable signed evidence

- Severity/status: `P1 / High — VERIFIED LOCALLY; PROVIDER/DEPLOYMENT BLOCKED`.
- Evidence/reproduction: webhook writes a remote DocuSeal URL into
  `documents.storage_path` with size zero; normal download treats it as a private
  bucket object key. `documents: []` is accepted while the token is consumed and
  the BOM locked.
- Expected/actual: state lock follows durable downloadable evidence; current
  evidence can be unusable or absent.
- Root cause/impact: remote URLs were modeled as internal keys and transition was
  not coupled to durable ingestion.
- Remediation implemented: Core retrieves a fresh completed PDF, enforces exact
  host, timeout, response-size, MIME and PDF-signature checks, persists the bytes
  under the private tenant-first Storage path, then consumes/locks atomically.
  Empty completions fail before work; known replays skip provider work; ambiguous
  post-upload failures retain the deterministic object for safe reconciliation
  instead of deleting evidence that a concurrent delivery may own.
- Verification/owner: 100 targeted Core tests passed with the database case
  skipped for missing disposable DB; full Core/Web/shared suites, typecheck,
  lint and builds passed. Live provider/E2E proof remains blocked; Agents 05/12.

## AUD-006 — Commercial BOM rejects fractional construction quantities

- Severity/status: `P1 / High product gap — BLOCKED`.
- Evidence: DB column and boundary schemas require integer quantity; generic
  takeoff rejects `0.1`. PRD canonical DUPA uses `0.10`.
- Root cause/impact: commercial spine cannot represent common measurements.
- Remediation/dependency: existing blocker
  `docs/blockers/2026-08-17-bom-fractional-quantity-schema.md` requires an exact
  scale/precision ADR, additive migration/backfill/rollback, and coordinated
  contract/calculation/import/procurement work. No lossy cast is safe.
- Verification/owner: exact fractional end-to-end and migration/RLS tests; Agents
  01 -> 04 -> 05 -> 03.

## AUD-007 — Public repository exposes apparent business-confidential workbooks

- Severity/status: `P0 / Critical active confidentiality risk — BLOCKED`.
- Affected: `source_data.xlsx`, `executive-dashboard.xlsx`, `build_dashboard.py`.
- Evidence: read-only artifact-tool inspection found six sales source sheets,
  108 populated business rows, 85 distinct hashed account identifiers, 66 remarks
  cells, and TCV/GP values. No email/phone-shaped cells or displayed formula
  errors were detected. All three artifacts first appear in generic preservation
  commit `38af6cdc`; no provenance/consent/retention note exists. The generator
  hard-codes `/Users/hoon` and uses undeclared `openpyxl` outside scripts/CI.
- Expected/actual: fixtures are synthetic or documented; these appear to contain
  named account/rep pipeline and remarks data. Current GitHub provider evidence
  confirms `Third-Code-Solutions/ERP` is public, so the files and history are
  accessible without repository membership.
- Root cause/impact: legacy artifacts were preserved wholesale; repo readers and
  clones may receive confidential information.
- Remediation/dependency: DPO/owner classification and authorization to
  quarantine/replace; separate explicit approval for history rewrite. No
  destructive action is authorized.
- Verification/owner: sanitized fixture, privacy record, history/reference/access
  scan; project owner/DPO with Agent 12.

## AUD-008 — Documentation and product copy contradict source

- Severity/status: `P2 / Medium — VERIFIED`.
- Evidence: README says ESLint is absent; architecture omits Nest/Redis/BullMQ and
  names nonexistent worker/Inngest functions; user-story index points to a
  nonexistent BOM route and stale table; `price-catalog.ts` is unreferenced.
- Impact: operators/users get an incorrect routing, authority and automation
  model. A separate search did not reproduce the proposed “RAG-priced drawings”
  copy issue; current upload UI explicitly labels extracted candidates unpriced,
  so that seed was rejected rather than reported as a finding.
- Remediation/verification: README, architecture and user-story authority now
  match executable source; doc authority, App Router, lint, typecheck and build
  gates pass.
- Owner: Repo Agent 01 plus relevant Web owner.

## AUD-009 — Embedding cache returns vectors for different inputs

- Severity/status: `P2 / Medium correctness — VERIFIED LOCALLY`.
- Evidence: key uses first 1,000 normalized characters, OpenAI embeds up to 8,000,
  and provider/model identity is absent. Equal prefixes collide.
- Impact: retrieval/Cortex/similar-items can silently use a wrong vector.
- Remediation implemented: SHA-256 covers exact normalized 8,000-character input,
  provider, model, protocol version and normalized worker endpoint; worker model
  responses are fail-closed.
- Verification/owner: exact-input hit, late-character miss, provider separation;
  Repo Agent 08 / Principal 3.

## AUD-010 — Environment contract is not an executable provider matrix

- Severity/status: `P2 / Medium-High operations — VERIFIED statically`.
- Evidence: the application-only audit found 212 runtime names, including 97
  absent from the root example and 88 from the Web example. The broader generated
  matrix includes source, operations scripts and workflows: 456 distinct names,
  158 classified as undocumented runtime/operations references. These scopes are
  intentionally reported separately; some are platform or one-shot script inputs.
- Impact: partial/misnamed config can silently select fallbacks or drift services.
- Remediation: `docs/audit/ENVIRONMENT_MATRIX.md` now supplies the exhaustive
  name/source/sensitivity inventory without values. Required/optional/default
  ownership and provider-name parity remain; paired integrations must fail closed.
- Verification/owner: static contract plus read-only provider-name parity; Agents
  12/13.

## AUD-011 — Declared security scanners are not release gates

- Severity/status: `P2 / Medium-High policy gap — VERIFIED / BLOCKED`.
- Evidence: AGENTS requires gitleaks, Snyk, Semgrep and Trivy; CI runs gitleaks and
  pnpm audits only. Those present gates passed, but are not equivalent coverage.
  GitHub secret-name inspection found no `SNYK_TOKEN`, and CI run `32583431563`
  confirms the Security Scan job contains only audits and Gitleaks.
- Impact: source/container/SAST issues can bypass a policy-described merge gate.
- Remediation: inspect token availability and add pinned fail-closed scanner jobs,
  or obtain owner approval to revise policy. Do not create a knowingly red gate.
- Verification/owner: real PR scanner artifacts and provider alerts; Agents 12/13.

## AUD-012 — Python workers are not reproducibly built

- Severity/status: `P2 / Medium supply chain — VERIFIED`.
- Evidence: Dockerfiles use floating Python 3.11 slim tags; dependencies have open
  lower bounds and no lock; root policy says Python 3.12. Current images build and
  import, proving current compatibility but not reproducibility.
- Remediation: runtime reconciliation, digest-pinned base, dependency lock/update
  workflow, SBOM/container scan.
- Verification/owner: clean builds, worker tests/imports, CVE/SBOM; Agents 06/08/13.

## AUD-013 — Monitoring stack has no repository/provider proof

- Severity/status: `P2 / Medium — BLOCKED`.
- Evidence: Vercel Analytics/Speed Insights exist, and read-only 24-hour Vercel,
  Core and CAD log checks found no 5xx/error-level events. No verified Sentry,
  Axiom or Better Stack integration, alert receipt, SLO dashboard, or named
  on-call route exists in source/provider evidence. Quiet logs are not an alert
  delivery test.
- Impact: error/log/alert/SLO/rollback signals cannot be proven for promotion.
- Remediation/dependency: identify provider projects/owners/retention/alerts; add
  minimal instrumentation/runbooks without exposing keys.
- Verification/owner: synthetic event and alert receipt; Agent 13/project owner.

## AUD-014 — E-sign configuration and signatory identity diverge

- Severity/status: `P1 / High integrity/compliance — PARTIALLY REMEDIATED / BLOCKED`.
- Evidence: docs use `DOCUSEAL_API_KEY`; runtime reads `DOCUSEAL_API_TOKEN`;
  examples omit URL/token/templates. Following docs silently selects Canvas.
  Missing templates use placeholder identifiers; VO/COC uses creator or
  placeholder emails; Canvas submission does not bind entered to expected email.
- Expected/actual: partial provider config fails closed and signatory assurance is
  explicit; behavior can silently change provider or misattribute assent.
- Remediation implemented: URL/token pairs fail closed, Core additionally
  requires exact document hosts, production URLs require HTTPS, selected entity
  templates and valid primary project-account contacts are mandatory, and both
  Core and Canvas enforce normalized expected-email equality before mutation.
  Examples and deployment docs now use the runtime names.
- Remaining dependency: real O-04 templates/provider configuration and a formal
  assurance decision for sessions intentionally minted without an expected
  email. Provider/browser proof was not available.
- Verification/owner: config/provider/contact/template/mismatch tests passed;
  Agents 05/14/12.

## AUD-015 — Production workflow is not protected at the provider boundary

- Severity/status: `P1 / High change-control risk — BLOCKED`.
- Evidence: ADR-020 and repository docs describe a protected `main`-only
  production environment. Current GitHub API evidence reports `main` is not
  branch-protected. The workflow targets environment `production`; current
  environment metadata shows no protection rules or deployment branch policy.
  Production credential names are present, so the job is operational, and the
  last promotion of baseline `175eb35a` succeeded end-to-end.
- Expected/actual: required reviews/status checks and environment approvers gate
  releases; an authorized writer can currently push/dispatch without those
  provider protections.
- Root cause/impact: control intent exists only in workflow conditions/docs, not
  GitHub settings. This prevents calling the workflow protected and weakens
  separation of duties for production credentials.
- Remediation/dependency: project owner must approve exact branch protection,
  required CI checks, force/delete restrictions, environment reviewers and
  deployment branch rules. These are material external access-control changes
  and are not inferred from generic deployment authorization.
- Verification/owner: read back rules through GitHub API, negative direct-push and
  unauthorized-dispatch tests, then a reviewed promotion; Agent 13/project owner.

## AUD-016 — Promotion does not prove deployed identity or roll back partial releases

- Severity/status: `P1 / High release-integrity risk — VERIFIED / OPEN`.
- Affected: `.github/workflows/deploy-production.yml`, Railway Core/CAD, Vercel,
  migration and production-E2E sequencing.
- Evidence/reproduction: promotion run `32583433713` passed while Railway marked
  the Core deployment `SKIPPED`; this was a legitimate watched-path no-op for
  that source change, but `railway up --ci` still exited success and the workflow
  never read back deployment status or candidate revision. Live Core deployment
  `9d5f7c2f-d33f-4a4c-84be-18d4bcfb3af3` identifies source `044e09bf`, while
  Core/CAD health payloads expose no revision. Failure run `32581336124` applied
  migrations/deployed providers, then failed authenticated E2E and left the
  partial release in place. The workflow has no automatic rollback.
- Expected/actual: each changed service proves candidate identity and successful
  provider state; an unapproved skip fails; a post-migration/deploy regression
  restores or forward-repairs every affected component. Current success proves
  health, not source convergence, and failure can leave mixed versions.
- Root cause/impact: provider CLI exit status is treated as deployment evidence;
  release identity helpers are not called, health payloads omit revision, and
  rollback targets are not captured/executed. A workflow can report green while
  services remain on different source or after a partial failed promotion.
- Remediation: expose safe service revisions, compare Web/Core/CAD identity to
  the candidate, read Railway terminal status with explicit approved-skip rules,
  capture prior provider IDs, and add a tested forward-repair/rollback lane.
- Verification/owner: changed/no-op/mismatch/failed-E2E workflow tests plus a
  controlled rollback drill; Agent 13 with provider owners.

## AUD-017 — Python worker accepts an invalid embedding dimension

- Severity/status: `P2 / Medium correctness — VERIFIED LOCALLY`.
- Evidence/reproduction: the TypeScript boundary verifies vector length equals
  the worker-reported dimension but does not require the canonical 1,536
  dimensions for `text-embedding-3-small`; existing tests accept dimension 2.
- Impact: a misconfigured worker can cache vectors that later fail pgvector
  writes or corrupt retrieval behavior despite a correct model label.
- Remediation/verification: the boundary now requires the canonical model and
  exported 1,536 dimensions before cache/write; exact and mismatch tests plus the
  full Web suite pass; Agent 08.

## AUD-018 — Hosted Supabase security controls require review/hardening

- Severity/status: `P2 / Medium security posture — PARTIALLY VERIFIED / BLOCKED`.
- Evidence: authenticated linked-project advisors report 10 WARN security items:
  `vector` in `public`, eight authenticated-callable `SECURITY DEFINER`
  authorization helpers, and leaked-password protection disabled. Source shows
  the helper grants are deliberately used by authenticated RLS policies, so the
  advisor output alone is not proof of exploit. The sole INFO is an intentional
  forced-RLS, privilege-revoked server-only table.
- Impact: password reuse exposure is not screened, and privileged helper/public
  extension placement expands review surface. Provider behavior must not be
  silently changed without user-impact and RLS regression evidence.
- Remediation/dependency: owner approval for leaked-password protection; review
  helper placement/grants/search paths and extension relocation against current
  Supabase guidance; preserve functional RLS and Data API access boundaries.
- Verification/owner: advisor readback, auth UX regression and cross-tenant RLS
  suite; Agents 04/12 and provider owner.

## AUD-019 — Hosted database violates the foreign-key indexing gate

- Severity/status: `P2 / Medium-High performance/operations — VERIFIED / OPEN`.
- Evidence: linked Supabase performance advisors report 466 items: 342 unindexed
  foreign keys, 122 unused indexes, one duplicate-index warning and one Auth
  connection info. `project_budgets` and `bom_line_item_location_reviews` have
  seven unindexed FKs each; `award_handoffs` and `progress_claims` have six.
  This directly contradicts Agent 04's “every foreign key has an index” gate.
- Impact: deletes/updates and common joins can scan child tables and increase
  lock duration as data grows. Advisor “unused” does not authorize bulk removal
  without workload history.
- Remediation: prioritize high-write/high-cardinality FK paths from query plans,
  add indexes in bounded additive migrations, remove only proven duplicate/dead
  indexes, and rerun advisors/representative `EXPLAIN ANALYZE`.
- Verification/owner: disposable migration replay, hosted canary/query plans and
  advisor delta; Agent 04 with Agent 13. No bulk hosted mutation is authorized.

## AUD-020 — Trusted-PR CI exceeds the repository duration objective

- Severity/status: `P3 / Low efficiency — VERIFIED / OPEN`.
- Evidence: trusted-PR run `32582890004` took approximately 10 minutes against
  Agent 13's typical-PR objective of under 8 minutes.
- Impact/remediation: slower feedback increases queue/iteration time; profile
  jobs and improve caching/parallelism without weakening any gate.

## AUD-021 — VO and COC DocuSeal completions have no authority

- Severity/status: `P1 / High functional/integrity — VERIFIED / BLOCKED`.
- Evidence: VO and COC initiation stores DocuSeal submission IDs on their own
  tables, but the sole webhook route forwards every completion to a Core service
  that only queries `bom_portal_tokens`. No source caller invokes the existing
  `recordVoSigned` or `recordCocSigned` transitions.
- Reproduction/impact: a real non-BOM completion is returned as unhandled, so no
  durable artifact is attached and neither entity reaches `signed`; COC warranty
  and CX notification side effects also never begin.
- Root cause: a BOM-specific result, transaction, notification and audit contract
  was presented as a generic DocuSeal integration. Final review also found that
  initiation persisted the provider slug as `docuseal_submission_id` while
  callbacks are modeled with the provider ID; that independent correlation bug
  is repaired and tested locally but does not connect VO/COC transitions.
- Remediation/dependency: define entity-neutral Core authority, unambiguous
  tenant-scoped submission lookup, exact VO/COC business transitions and
  concurrent replay behavior. COC warranty semantics and real O-04 templates
  require product/compliance evidence; schema uniqueness may require an additive
  migration. See `docs/blockers/2026-08-24-non-bom-docuseal-completion-authority.md`.
- Verification/owner: disposable-DB BOM/VO/COC isolation and replay tests plus
  real provider/browser journeys; Agents 01/14 -> 04 -> 05 -> 12.

## External product/provider blockers

- PRD O-01 VAT base, O-03 Delegation of Authority, O-04 real templates, O-05
  Togal export/sample, and O-14 approved rate owner.
- Fractional quantity exact representation ADR.
- Supabase advisors are now current; advisor remediation, bucket settings,
  monitoring targets and protected authenticated E2E credentials remain.
- Exact authorization for repository visibility/history response and GitHub
  branch/environment protection changes.
- Non-BOM DocuSeal completion authority and COC warranty semantics (AUD-021).

These blockers do not prevent safe local audit/remediation of independent
defects. They do prevent full production-readiness or deployment claims while
relevant P1 findings remain.
