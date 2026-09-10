# Project submittal CDE document links — 2026-09-10

## Scope

Add the missing document-control evidence relationship for project submittals
without replacing the existing Documents/upload spine.

## Inputs

- Existing `documents` rows remain the binary/storage authority.
- Existing Core `project_submittals` lifecycle and version are authoritative.
- Tenant membership, capability guard, RLS, and append-only audit rules apply.

## Outputs

1. `project_submittal_documents` schema and migration with composite tenant FKs,
   replay identity, role (`submission`, `plan`, `response`), RLS denial, scope
   trigger, approved-parent immutability, and audit trigger.
2. Core project-document list and submittal link/unlink routes.
3. Strict shared Zod contracts and Web Core client wrappers/server actions.
4. Submittal UI evidence panel with project-document picker and role-aware
   link/unlink controls.
5. Static DB, shared, API, client, and opt-in all-role E2E coverage.

## Explicit limits

- This slice does not upload binary files; it reuses existing Documents intake
  and storage routes.
- Plan pinning is metadata plus a tenant/project-checked document link; a CAD/PDF
  viewer, page/region annotations, and transmittal bundles remain separate work.
- Existing punchlist photo links are preserved and not migrated.

## Verification

- Shared contract test: PASS.
- Database migration static test: PASS.
- API service/controller/protected tests: PASS (7 tests).
- Web Core client tests: PASS (2 tests).
- Existing submittal action tests: PASS (3 tests).
- API typecheck: PASS.
- Web lint: PASS.
- Web full typecheck: BLOCKED by pre-existing generated `.next/types` imports
  for unrelated routes; no new source diagnostic was observed.
- Live PostgreSQL/RLS/ACL and browser E2E: NOT RUN (requires configured demo
  tenant/database and explicit E2E environment variables).

→ Handoff to the next construction-ERP slice. Reason: CDE relationship is now
  Core-authoritative; binary upload/viewer and punchlist plan conversion remain
  independent contracts.
