# Role workflow, project lifecycle, and deterministic document intake — 2026-08-19

## Status

**PARTIALLY VERIFIED.** All requested source changes have local build, test,
and isolated browser evidence. The three additive Supabase migrations were
applied to the linked ERP production database on 2026-08-22 after a dry-run
showed no migration-history divergence. Application promotion remains pending
the protected pull-request and production workflow; no production demo-account
session has been used as a test fixture.

## Change

- Make CRM accounts, the pipeline, and active projects readable to every ERP
  role; keep all write controls capability-gated. The read-only Viewer can
  inspect operational data but cannot obtain any mutation capability.
- Implement the supplied role workflow matrix across design, SD/PM/PE,
  commercial, finance, procurement, safety, CX, and viewer-specific pages.
  Pipeline controls now disappear for roles that can only read it.
- Replace active `mixed` project taxonomy with `structural_civil` and display
  it as **Structural and Civil**, while keeping legacy `mixed` reads
  compatible during a staged migration.
- Add owner/admin-only controlled project retirement. The UI requires an
  explicit name confirmation and reason; the Core API uses tenant gates,
  locks, idempotency, audit evidence, and logical deletion rather than a
  cascade. Retired projects are excluded from project and pipeline workflows.
- Add deterministic, tenant-scoped cached intake for CSV, XLS/XLSX/XLSB, text
  and scanned PDFs, DOCX, and images using local parsing/OCR. Normal file
  intake no longer invokes an AI provider or creates a BOM. Existing DXF/DWG
  routing remains a distinct construction-evidence workflow.
- Add ADR-025 and ADR-026 plus the cross-scope handoff and implementation
  plan/todo artifacts.

## Verification

- PASS — focused deterministic extractor tests: 8 passed.
- PASS — focused Web RBAC/project tests: 223 passed.
- PASS — full shared-types suite: 396 passed across 66 files.
- PASS — full API suite: 806 tests passed across 186 files.
- PASS — full Web suite: 960 tests passed across 152 files; 2 documented,
  environment-dependent integration suites skipped.
- PASS — Python CAD worker suite: 21 tests passed.
- PASS — repository lint, Turbo typecheck, and production build.
- PASS — local disposable Supabase replay, including the three new migrations,
  enum/backfill checks, and project-retirement RLS/grant checks.
- PASS — isolated local Playwright document-intake flow: Core intake,
  idempotent replay, and foreign-path rejection.
- PASS — Supabase production migration dry-run and apply. Remote migration
  history now includes `20260819100000`, `20260819100100`, and
  `20260819110000`.
- PASS — static brand, type-safety, App Router boundary, build invariant,
  actionlint, and workflow action-reference contracts.
- BLOCKED LOCALLY — production-data-boundary scan requires its protected
  production database URL and an explicit demo-tenant allowlist. The protected
  CI workflow supplies those inputs; no allowlist was guessed locally.
- NOT RUN — protected PR CI, application promotion, and post-deploy production
  role-matrix/smoke checks.

## Operational follow-up

- Keep `ERP_PROJECT_DELETE_WRITES_ENABLED` disabled until an exact approved
  tenant UUID is configured in `ERP_PROJECT_DELETE_WRITES_TENANT_IDS`; do not
  enable the deletion path tenant-wide or globally.
- The live Supabase security adviser reports existing warnings for the public
  `vector` extension, public callable `SECURITY DEFINER` helpers, and disabled
  leaked-password protection. These migrations add none of those objects, but
  the warnings require separate security remediation before declaring the
  platform fully hardened.
