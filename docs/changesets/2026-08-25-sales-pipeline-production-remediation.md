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
- Browser access check: unauthenticated `/pipeline/board` redirects to the
  accessible sign-in form with no console warnings. No production or browser
  test identity was created.

## Provider execution status at recording time

Source changes are local in this changeset. The guarded cleanup, scanner,
Storage readback, monitor, history rewrite, protection configuration, canary,
and deployment procedures execute only from the committed release and record
their own provider evidence.
