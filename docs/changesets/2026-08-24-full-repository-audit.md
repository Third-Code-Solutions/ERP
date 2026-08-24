# Full repository audit and guarded remediation

- Date: 2026-08-24
- Baseline: `175eb35a5e40301e2dc82bd0414992633664c6fc`
- Branch: `agent-01/full-repository-audit`
- Delivery status: local candidate verified; production `NO-GO`

## Scope and decisions

- Used exactly five principal subagents for audit planning, architecture and
  connectivity, implementation, independent verification, and provider/release
  review. No principal spawned another agent.
- Generated an exhaustive 2,673-file current-worktree coverage ledger plus route,
  action, endpoint, schema, migration, environment and provider inventories.
- Recorded 21 evidence-backed findings and accepted ADR-027 for durable upload
  reservations. No schema/provider implementation was guessed from that ADR.
- Recorded separate owner/DPO blockers for the public business workbooks and for
  missing GitHub branch/environment protections.

## Implemented local remediations

- Registered the existing Process module at the Nest root and added a topology
  regression so its 13 routes cannot silently disappear again.
- Enforced canonical capabilities before project Scope mutations and hid
  mutation/upload controls from unauthorized roles.
- Replaced prefix-only embedding cache keys with SHA-256 over exact normalized
  input plus provider/model/protocol identity, and fail closed on non-canonical
  worker model or dimension responses.
- Made DocuSeal completion durable: retrieve fresh provider evidence through an
  exact-host, bounded and validated download; persist a private tenant-first PDF
  object before the atomic token/BOM/document/audit transaction; reject empty
  completions; skip known replays; retain ambiguous artifacts for reconciliation.
- Made partial e-sign configuration fail closed, required selected templates and
  real tenant-scoped primary project-account contacts, and enforced normalized
  expected signer-email equality before Core or Canvas mutation.
- Preserved DocuSeal's provider submission ID separately from its URL/display
  slug and persisted the ID used by completion callbacks for BOM, VO and COC.
- Reconciled README, architecture, deployment, environment and user-story
  documentation with the executable topology and current variable names.

## Verification

- `PASSED` — Node 22.23.2 / pnpm 10.33.0 frozen install.
- `PASSED` — root lint, typecheck and production build (Next 15.5.23 plus Nest;
  116 Next pages).
- `PARTIAL` — final runnable task totals: 2,468 passed; 162 database-backed cases skipped
  because no disposable `DATABASE_URL` was configured. Targeted DocuSeal/e-sign
  verification passed 100 Core tests (one DB case skipped), 36 Web tests and 8
  shared contract tests.
- `PASSED` — doc authority 16/16, type-safety scan of 1,467 files, App Router,
  Web/DB boundary, build/ops invariants, actionlint and pinned action references.
- `PASSED` — production and full dependency audits; no known vulnerabilities.
- `PASSED` — Gitleaks across 810 commits/~19.32 MB; no leaks detected.
- `PASSED` — AI worker 8/8 and CAD worker 21/21 tests plus both container/import
  smokes from the baseline audit.
- `BLOCKED` — disposable database/RLS/audit-coverage, authenticated browser E2E,
  and live DocuSeal provider verification.

## Production and remaining risk

- No push, PR, hosted mutation or deployment occurred. Current public Web/Core/
  CAD health and provider metadata were inspected read-only; the live Core still
  returns 404 for Process because this candidate is not deployed.
- `P0` AUD-007 remains active: the public repository tracks apparent business-
  confidential workbooks. Repository privacy, current-blob quarantine and any
  history rewrite require three separate owner/DPO authorizations.
- High blockers remain for upload reservation/object verification (AUD-004),
  exact fractional BOM representation (AUD-006), external e-sign templates and
  assurance proof (AUD-014), non-BOM DocuSeal completion authority (AUD-021),
  unprotected production controls (AUD-015), and fail-closed release identity/
  rollback (AUD-016).
- Required Snyk/Semgrep/Trivy gates and monitoring alert/SLO proof remain absent;
  linked Supabase reports 10 security warnings and 342 unindexed foreign keys.

The authoritative evidence, owner actions and rollback targets are in
`docs/audit/FULL_REPOSITORY_AUDIT.md`, `docs/audit/TEST_AND_VERIFICATION_EVIDENCE.md`,
`docs/audit/PRODUCTION_DEPLOYMENT_REPORT.md`, and the two 2026-08-24 blocker briefs.
