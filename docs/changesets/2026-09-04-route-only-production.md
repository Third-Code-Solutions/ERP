# Schema-compatible route release

Extracted the route fixes from draft PR32 onto the current production baseline.
The platform feature, new lifecycle schema, account settings, authentication
changes, new dependencies and provider configuration are explicitly excluded.
All 157 migration files, Core API, auth package and production workflow are
unchanged. Railway Core/CAD will be released from the same reviewed code-only
revision as Vercel through the existing guarded workflow.

## Changes

- Validate UUID parameters on all 47 detail-page templates before consumption.
- Use canonical pipeline board/list routes with query-preserving legacy redirects.
- Provide 11 project-entry selectors with existing tenant/role guards.
- Correct project headings, document permissions/feedback, report arithmetic/links,
  print layout nesting and the legacy portal's nonexistent signing iframe.
- Keep selector styling independent of the deferred platform console.
- Point the unchanged KYC projection assertions at the relocated canonical board.

## Verification and release

App Router boundary check passes for all 131 pages. Full isolated checks and
production promotion are pending; previous PR32 results are not proof of this
exact release. The unchanged migration gate must report 157/157 before release.
No production database restoration or migration is planned or authorized here.

Rollback: retain current Vercel and Railway releases before promotion; on a failed
critical flow, promote/redeploy the previous provider artifacts. Database rollback
is unnecessary because this release makes no schema or data transformation.
