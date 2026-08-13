# WO-08 / WO-08a structured takeoff intake

## Scope

- Added the generic CSV/XLSX takeoff parser, column mapping, validation, preview, and commit contract.
- Added tenant-scoped BOQ divisions, drawing revisions, mapping profiles, takeoff imports, and unresolved-item queue tables.
- Added stable `(tenant_id, takeoff_import_id, source_row_key)` line identity with upsert behavior.
- Preserved vendor evidence and existing DUPA values during re-import.
- Added AI-drafted CAD disposition: `work_item`, zero rate, `unit_rate_source='manual'`, provenance, source model, extraction timestamp, and unresolved queue entries.
- Added the BOM approval hard gate for pending takeoff unresolved rows.
- Closed the legacy Togal preview and price-writing commit endpoints with HTTP 410; callers must use the generic importer.
- Added the responsive structured takeoff wizard and project-route browser coverage.

## Verification

- PASS: disposable PostgreSQL 17 / Redis 7.4.9 lane; 61/61 migrations; database schema hash `C57981526EFB6A185920666FD1409BB7A8B5EA4BE105D68E03DBF369AE9A1742`.
- PASS: database tests 242/242 with zero skips.
- PASS: API database integration 3/3 with rollback-backed probes.
- PASS: generic importer parser, API unit, migration contract, and legacy deprecation tests.
- PASS: generic importer PostgreSQL integration; changed-content re-import reused the same import identity and preserved vendor/DUPA state.
- PASS: CAD auto-draft PostgreSQL integration; rows remained unpriced AI work items and repeated extraction reused row identity.
- PASS: web and database TypeScript checks.
- PASS: public Chromium smoke at `http://127.0.0.1:3100`.
- FAIL / BLOCKED: authenticated Chromium project route walk could not authenticate because the configured default test account returned `Invalid login credentials`; no authenticated UI claim is made.

## Release boundary

The migration and application changes are locally verified only. No hosted Supabase DDL, data mutation, deployment, commit, or push was performed. Hosted promotion remains blocked by the provider/source ledger divergence and the open release blockers recorded under `docs/blockers/`.
