# Sales pipeline and production-remediation implementation

Date: 2026-08-25

## Delivered locally

- Sales now creates a manual pipeline opportunity from an existing tenant
  account plus a required prospective project name. The opportunity is always
  created in `lead`, is owned by the Sales actor, has audit evidence, and is
  not pre-linked to a delivery project. Closed-won conversion is the only path
  that creates the delivery project.
- Added the `prospective_project_name` schema migration and strict Core/Web
  contract coverage. Legacy project-page opportunity mutation controls now
  direct operators to the Sales Pipeline instead of bypassing that boundary.
- Removed the two tracked spreadsheet workbooks from the repository worktree
  and restored the general workbook ignore rule.
- Added an explicit, manually confirmed production E2E-data cleanup workflow.
  It creates a redacted exact-tenant manifest, retains a seven-day recovery
  artifact, deletes only the fixed historic E2E Storage/Auth/tenant data in
  dependency order, and proves a no-demo production boundary afterwards.
- Added the hosted-documents Storage migration and provider readback tool for a
  private 100 MiB, explicitly allowlisted-MIME bucket with no browser RLS DML.
- Accepted ADR-029 for fixed-scale fractional BOM quantities. The current
  importer continues to reject fractions until its complete vertical migration
  is implemented.
- Accepted ADR-030 and implemented tenant-safe, replay-safe DocuSeal completion
  for variation orders and certificates of completion, including signed evidence,
  audit, notifications, and COC warranty initialization.
- Made the actual Web award transition call the Core atomic handoff rather than
  attempting a best-effort post-transition conversion. The Core result now
  governs the delivery-project link, checklist, and revalidation.
- Added server-side 1–200-character validation for the Sales prospective project
  name and retained it as the preferred delivery-project name at award.
- Hardened DocuSeal source identity across BOM, VO, and COC with same-table
  unique indexes, an advisory-locking cross-table trigger, and fail-closed
  webhook collision detection.
- Reconciled the SQL Storage bootstrap with the server-only bucket policy, so a
  manual bootstrap cannot restore direct browser policies or omit MIME/size
  enforcement.
- Added independent Snyk, Semgrep, Trivy, and scheduled public synthetic-monitor
  workflows. Production deployment now sets and verifies a matching release
  revision across Web and Core, applies/reads back Storage hardening, and no
  longer relies on production E2E identities.

## Local verification

- `pnpm lint` — passed.
- `pnpm typecheck` — passed.
- `pnpm test` — passed after Docker Desktop was started for the repository's
  container-backed contention suite.
- `pnpm build` — passed (Nest API and Next.js production bundles).
- `pnpm test:production-e2e-purge`, `pnpm test:production-data-boundary`,
  `pnpm test:hosted-documents-storage`, `pnpm ci:actionlint` — passed.
- Disposable PostgreSQL 17 migration proof — passed: the DocuSeal submission-ID
  migration applies and rejects same-source and cross-source duplicates.
- Final candidate rerun: `pnpm lint`, `pnpm typecheck`, `pnpm test` (2,718
  passing / 162 environment-skipped tests), and `pnpm build` — passed.
- Browser access check: unauthenticated `/pipeline/board` redirects to the
  accessible sign-in form with no console warnings. No production or browser
  test identity was created.

## Provider execution status at recording time

The release branch was published as GitHub PR #13 after the repository was
made private and branch history was scrubbed. A fresh mirror confirms the
workbook paths are absent from all published branch and tag histories. GitHub's
immutable refs for twelve historic merged pull requests still retain the old
objects; GitHub Support's sensitive-data purge is required for server-side
garbage collection. Hosted Actions cannot currently start because the GitHub
organization reports failed payments or exhausted Actions spend. Therefore the
guarded cleanup, scanner execution, Storage readback, monitor, canary, and
production deployment have not run.

## Production execution update

- The exact historic E2E catalog was independently revalidated before cleanup:
  two tenants, 13 users, and 38 `documents` objects. A recovery dump was
  captured before removal; the approved test tenants, users, objects, and
  tenant-scoped audit rows are now absent from production, with the audit
  append-only rule, RLS, and foreign keys restored and read back afterwards.
- The six additive migrations in this release were applied through the linked
  ERP Supabase project. An immediate provider dry run reports the migration
  ledger current.
- Provider readback exposed that the project-wide Storage limit is below the
  ADR-027-required 100 MiB. The bucket API correctly refuses a 100 MiB bucket
  cap until that global setting is raised; the candidate does not silently
  lower the product limit. The verifier now recognizes both supported
  Supabase-client denial shapes (returned error and thrown error).
