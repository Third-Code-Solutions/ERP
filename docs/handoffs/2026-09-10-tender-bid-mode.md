# Tender / bid mode handoff — 2026-09-10

Scope: implement the next unblocked post-MVP vertical slice from PRD §7:
opportunity-level client-issued TOR + BOQ evidence, deviation register,
weighted evaluation criteria, internal vendor/subcontractor profiles and
scoring, with a later optional binding to an existing project BOM.

Order:

1. Agent 04/schema: additive tender tables, composite tenant foreign keys,
   RLS, audit trigger, and migration.
2. Agent 05/API: validated Core API list/create/update/status and nested
   deviation/criterion/profile/evaluation commands with optimistic versions.
3. Agent 02/03/UI: proposal tender workspace, navigation, loading/error and
   role-aware controls using the shared contracts.
4. Verification: shared/API/Web tests, build/typecheck/lint, and role-matrix
   E2E coverage. No external vendor portal or award automation is in scope.

Boundary decisions:

- `boms.project_id` is required, so pre-award client BOQ remains a document
  reference on the opportunity. Binding is allowed only to an existing BOM
  whose opportunity matches; no new scope model or pre-award BOM rows.
- Vendor profiles reference existing tenant vendors. No external portal,
  SAP integration, real ABI template importer, or automatic commercial award.
- Every mutation is tenant-scoped, version-checked, idempotent where a client
  request identity is supplied, and semantically audited in the same
  transaction.

→ Handoff to Agent 04/schema first. Inputs: PRD §7 post-MVP list, PRD §4.2
client BOQ source mode, existing opportunities/documents/vendors/BOM tables.
Expected output: migration and Drizzle schema consumed by API contracts.

Hardening follow-up completed:

- Astra review findings were addressed: parent-row locking closes criteria
  weight races; score forms reject stale versions; all action errors are
  visible; replay tokens compare payloads under a shared Core/Web advisory
  lock; nullable tenant references use PostgreSQL column-specific cleanup
  actions; and Web transactions stamp the authenticated actor before audited
  mutations.
- Verification: database 90 files / 297 tests passed (9 integration files
  skipped without `DATABASE_URL`); Web 187 files / 1,068 tests passed (2
  disposable-database integrations skipped); API tender/protected/guard tests
  26 passed plus the isolated Cortex timeout file 7 passed. The full API run
  had one unrelated 5-second Cortex test timeout and was not treated as a
  clean full-suite pass.
