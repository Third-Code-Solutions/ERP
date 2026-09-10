# Tender / bid mode

## Added

- Opportunity-level tender package with TOR/BOQ evidence references, source
  mode, closing date, lifecycle status, optimistic versioning and idempotent
  create requests.
- Tenant-isolated deviation register for scope, quantity, unit, exclusion,
  schedule and commercial differences.
- Weighted evaluation criteria in basis points, internal vendor/subcontractor
  profiles linked to existing vendors, and score matrix with weighted summary.
- Nest Core API under `/v1/opportunities/:opportunityId/tender` with protected
  reads, mutations, status transitions, optional existing-BOM binding and
  optimistic conflict checks.
- Proposal workspace at
  `/crm/opportunities/:id/proposal/tender`, with role-aware intake, deviation,
  criteria, vendor profile and scoring controls.
- Direct proposal actions re-check the opportunity/tender relationship for
  every nested mutation, validate profile/criterion ownership before scoring,
  and block submission until every required criterion is scored for every
  vendor profile.
- Nullable document, BOM and user references use a single-column `SET NULL`
  constraint alongside a tenant-pair `NO ACTION` guard, so cleanup cannot
  null a non-nullable `tenant_id` or weaken cross-tenant integrity.
- Criteria inserts/updates serialize on the parent tender; score forms carry
  the rendered score version; request-token replays compare the full payload
  under the same tenant/request advisory lock in Core and Web; and direct Web
  mutations stamp the authenticated actor before trigger execution.
- Required criteria are configurable in the proposal form; Core nested routes
  bind the URL opportunity to the tender parent; and first-time score writes
  serialize on that parent lock so duplicate submissions return a normal
  optimistic conflict instead of a unique-key failure.
- Tender forms use action state with visible error and pending feedback rather
  than discarding server-action failures.
- Status transitions use an explicit any-of capability guard: managers control
  lifecycle states, while evaluator roles may submit only after the service's
  required-score gate passes.
- RLS/audit trigger migration `20260910190000_tender_bid_mode.sql` and shared
  Zod contracts.

## Deliberate boundaries

- Client BOQ stays document evidence before opportunity conversion; no second
  scope model or pre-award `bom_line_items` rows.
- No automatic commercial award, external vendor portal, SAP interface, or
  real ABI template importer.

## Verification

- Shared tender contract tests: PASS (3 tests).
- API tender service + protected controller tests: PASS (7 tests).
- API capability/controller regression tests: PASS (24 tests).
- Full API suite before the final Web hardening pass: PASS (235 files, 979
  tests). A final broad rerun had one unrelated 5-second Cortex controller
  timeout; the isolated file rerun passed (7 tests).
- Full shared-types suite: PASS (83 files, 445 tests).
- Full database suite: PASS (90 files, 297 tests; 9 integration files skipped
  because `DATABASE_URL` is not configured).
- Database typecheck and Drizzle schema check: PASS.
- Web typecheck, lint, and production build: PASS (86 routes generated).
- Tender proposal action tests: PASS (7 tests).
- Tender migration contract tests: PASS (3 tests).
- Root lint and `git diff --check`: PASS.
- Authenticated all-role Playwright matrix added, env-gated; live execution NOT
  RUN without demo credentials and an isolated opportunity.
