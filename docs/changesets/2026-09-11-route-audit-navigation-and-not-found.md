# Production route-audit navigation and report not-found UX

## Change

- The authenticated route inventory now treats the document `load` event as
  the navigation boundary, so a healthy rendered route cannot fail solely
  because a long-lived realtime or analytics request prevents `networkidle`.
  It then waits for meaningful streamed body content before evaluating the
  response, so load can remain fast without racing Next.js rendering.
- Invalid dynamic routes are classified only after their user-visible guard
  response is verified; weekly reports now have a print-shell not-found
  boundary that keeps tenant-safe links and recovery actions clear.

## Verification

- Full typecheck, lint, unit, build, security, database reproducibility, and
  authenticated production E2E remain required by CI before promotion.
- The vendor-performance route still must render within the strict document
  load timeout, and invalid weekly-report parameters must show the dedicated
  not-found response.
