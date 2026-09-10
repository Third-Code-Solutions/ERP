# Project submittal CDE document links

## Added

- Tenant-safe `project_submittal_documents` relationship table.
- Submission/plan/response document roles, replay-safe link command, and
  optimistic parent versioning.
- Core APIs for project document discovery, submittal document listing, link,
  and unlink.
- Web client wrappers, server actions, submittal evidence panel, and role-matrix
  E2E coverage.

## Safety

- Composite tenant/project/submittal/document foreign keys.
- Server-only RLS with explicit direct-client denial.
- Database scope trigger prevents cross-project links.
- Approved submittals cannot gain or lose links.
- Link/unlink and parent version changes emit audit events.

## Verification

- Shared, DB static, API, Web client/action tests: PASS.
- API typecheck and Web lint: PASS.
- Full Web typecheck: BLOCKED by pre-existing generated `.next/types`
  imports for unrelated routes.
- Live database and opt-in browser E2E: NOT RUN.
