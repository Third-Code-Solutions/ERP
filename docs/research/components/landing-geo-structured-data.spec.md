# Landing GEO structured data

## Outcome

Make the public Third Code ERP landing page legible to search engines and AI
answer systems without changing its validated visual surface. The page exposes
one linked Schema.org graph for the company, site, page, product, and published
FAQ content.

## Contract

- `WebSite`, `WebPage`, and `SoftwareApplication` use stable IDs rooted at the
  canonical public origin.
- The page and product are connected to the publisher organization and the
  site; the product identifies construction and project-driven business users.
- `en-PH`, Philippines service area, product features, canonical image, and
  crawlable FAQ answers are explicit structured-data fields.
- The helper is pure and receives the already-published FAQ content; it does
  not fetch, mutate, or infer private ERP records.
- No `SearchAction` is emitted because search is authenticated and there is no
  public query endpoint to advertise.

## Evidence

Focused structured-data and landing tests pass 5/5. The Web suite passes
67 files/451 tests; workspace lint/typecheck, `git diff --check`, and the
79/79-route production build pass. A local production-server request returned
HTTP 200 with the Third Code ERP brand, `WebSite`, and `FAQPage` JSON-LD and
no ABI Ops, ERPNext, or Frappe identifiers.

## Boundaries

This is a source-only metadata slice. No database, migration, RLS, Storage,
Nest authority, Railway setting, or Vercel deployment changes. Vercel remains
Git-disconnected and spend-protected; Supabase remains blocked at its verified
duplicate-Purchase-Order migration preflight.
