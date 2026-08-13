# WO-10 RFQ quote, award, and price-history loop

## Outcome

Implemented the source-only RFQ pricing loop required by the BUILD OPS PRD:

- RFQ quote writes now create tenant-scoped `price_history` provenance and
  update `material_catalog` using PHP centavos.
- RFQ quote award is transactional, tenant-authorized, idempotent, and updates
  the awarded rate plus catalog current rate.
- Added strict API contracts, Nest route/service, legacy server-action path,
  exact feature-flagged Core API path, comparison-table award controls, and
  stale-rate metadata (`>90` days) in BOM supplier selection.
- Added additive migration `20260813110000_rfq_price_history_provenance.sql`,
  tenant-composite provenance FKs, quote identity uniqueness, schema contract
  tests, API/web/shared tests, and disposable-Postgres integration coverage.

## Verification

- PASS: shared-types 125 tests; API 51 tests; web 347 tests.
- PASS: API RFQ unit/controller contracts (15 tests) and web RFQ/core/action
  contracts (38 tests).
- PASS: disposable PostgreSQL 17 + Redis 7.4.9 lane: 62/62 migrations,
  database 245/245, API integration 3/3, no skips.
- PASS: BUILD OPS static and seeded data invariants, audit coverage 112/112,
  actionlint, gitleaks.
- PASS: API Nest build and Next production build (79 routes).
- PASS: local production-server Chromium E2E 5/5, including landing metadata,
  CSP, health/readiness, responsive interaction, and public portal states.

## Release boundary

- No hosted Supabase write or migration push was performed.
- No feature flag was enabled.
- Hosted promotion remains blocked by provider migration/source divergence,
  duplicate PO mapping, and hosted WO-02 audit/calendar gates.
- WO-09 remains blocked until ABI supplies the real PPRF/SI/BOE/BOQ/Schedule
  Excel templates; no synthetic workbook was used.
