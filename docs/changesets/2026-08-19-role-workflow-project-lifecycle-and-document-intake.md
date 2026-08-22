# Role workflow, project lifecycle, and deterministic document intake — 2026-08-19

## Status

**PARTIALLY VERIFIED.** The source changes type-check and lint cleanly. The
web test suite passed before the managed sandbox began denying child-process
creation. The final pipeline-role control and delete-gate follow-up changes
received fresh typecheck/lint verification, but additional Vitest runs and the
production build now stop with `spawn EPERM`. No migration, deployment,
production write, or demo-account session was performed.

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
- Add deterministic, tenant-scoped cached intake for CSV, XLSX, text PDFs,
  DOCX, and images using local parsing/OCR. Normal file intake no longer
  invokes an AI provider or creates a BOM. Existing DXF/DWG routing remains a
  distinct construction-evidence workflow.
- Add ADR-025 and ADR-026 plus the cross-scope handoff and implementation
  plan/todo artifacts.

## Verification

- PASS — `pnpm --config.engine-strict=false --filter @third-code-erp/web test`
  before the final pipeline-role UI follow-up and before the managed sandbox
  transition: 958 passed, 2 guarded database integration tests skipped.
- PASS — focused API retirement, project, authorization, and CAD controller
  tests before the sandbox transition.
- PASS — full web and API TypeScript checks after the final source changes.
- PASS — repository lint after the final source changes.
- PASS — database TypeScript check.
- BLOCKED — further Vitest and Next production-build runs by sandbox
  `spawn EPERM`, not by a reported source compile error.
- NOT RUN — Supabase migration replay/RLS proof, authenticated demo-account
  browser journeys, CAD/DWG worker integration, scanned-PDF page rendering,
  deployment, and production smoke verification.

## Operational follow-up

- Apply the three additive migrations in a disposable Supabase target first,
  then enable `ERP_PROJECT_DELETE_WRITES_ENABLED` only with an exact approved
  tenant UUID in `ERP_PROJECT_DELETE_WRITES_TENANT_IDS`.
- Scanned PDFs currently return an explicit OCR-unavailable result because no
  local page renderer is bundled. Legacy `.xls` and `.doc` are also not yet
  deterministic-intake formats.
