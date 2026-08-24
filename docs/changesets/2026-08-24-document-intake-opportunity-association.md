# Document intake opportunity association

## Scope

- Extended the existing Core document-intake request with an optional
  `opportunityId` so a project-linked site-inspection report can retain its CRM
  association when Web stops writing document metadata directly.
- Kept the change additive: existing document-intake requests and results are
  unchanged.
- Verified the opportunity belongs to the authenticated tenant and the already
  verified project before claiming idempotency, locking quota, or inserting a
  document.
- Persisted the verified association on `documents.opportunity_id` and in the
  semantic audit diff.

## Security and compatibility

- Invalid opportunity identifiers are rejected by the strict Zod boundary.
- Missing, foreign-tenant, or different-project opportunities return a
  concealed not-found response before any mutation.
- No database migration or dependency was added.

## Verification

- PASSED: shared-types focused Vitest, 5 tests.
- PASSED: API document-intake controller/protected/service Vitest, 11 tests.
- PASSED: shared-types and API TypeScript checks under Node 22.
- PASSED: scoped ESLint for the two production files. Test files are excluded
  by the repository ESLint configuration.

## Handoff

→ Handoff to Agent 03. Reason: remove the remaining project-linked direct Web
report writers. Inputs: the optional `opportunityId` Core intake contract and
tenant/project validation. Expected output: weekly reports and project-linked
site-inspection reports upload unique objects and commit metadata through Core,
with exact-object cleanup on a rejected Core commit.
