# Remove the Finance tab bar

## Scope and implementation

At the user's explicit request, remove the horizontal Finance / Receivables /
Payables / Cash / Reconciliation strip from the shared Finance layout. The layout
now returns its page content directly, without a navigation wrapper, spacing,
or an unnecessary request-header read. Agent 03 layout scope only.

Finance pages, sidebar destinations, breadcrumbs, permissions, loading/error
boundaries, and accounting behavior are unchanged. No dependency, schema,
provider configuration, or product capability changes are required.

## Verification

- PASS: regression test first reproduced the unwanted navigation markup and
  passes after removal, asserting that only page content renders.
- PASS: 61 targeted layout, journal, sidebar-policy, and destination tests.
- PASS: web lint and all application/E2E TypeScript checks.
- PASS: both web database integration tests against existing local PostgreSQL.
- PASS: full web suite, 1,742 passed, zero failures. The two database tests
  skipped in the default suite both passed in the separate local database run.
- Production build and live browser verification are not performed for this
  local change; it is not yet deployed.

## Rollback

Revert this layout change to restore the strip. No data recovery is needed.
