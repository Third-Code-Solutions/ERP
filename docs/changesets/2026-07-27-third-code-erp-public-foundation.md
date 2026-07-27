# Third Code ERP public foundation

## Added

- Public, indexable Third Code ERP landing page with original generated imagery.
- Responsive artistic-asymmetry hero, dense capability bento, AI accordion,
  workflow stack, team-priority carousel, CTA, and footer.
- GSAP motion with scoped cleanup and reduced-motion behavior.
- Canonical metadata, Open Graph, Twitter cards, robots, sitemap, and JSON-LD.
- Semantic FAQ content mirrored into `FAQPage` structured data for answer engines.
- Vercel page analytics and named guided-setup/workspace conversion events.
- Clean-room capability-expansion ADR and enterprise delivery roadmap.
- Separate process-liveness and database-readiness endpoints.
- Role-aware universal search for projects, commercial records, documents,
  assigned tasks, permits, punchlist, warranty, deliveries, and RFQs.
- Guided signup context for company and business type with correct
  email-confirmation handling.

## Changed

- Public application, auth, navigation, portal, print, email, report, and Cortex
  display branding now uses Third Code ERP / Third Code Solutions Inc.
- Cortex rejects unmapped node types for non-admin roles.
- BOM global-search results now route to their owning project.
- Invoice creation now verifies tenant ownership and finance authorization, then
  allocates the monthly invoice number inside a database transaction with a
  tenant/month advisory lock.

## Dependencies

- Added `gsap` and `@gsap/react`; decision recorded in ADR-008.
- Added `@vercel/analytics`; decision recorded in ADR-010.
- Satoshi is loaded from Fontshare under its published font license.

## Verification

- TypeScript check: pass.
- Web unit tests: 28/28 pass.
- Shared business-rule tests: 76/76 pass.
- Database-backed RLS, Cortex, and cost tests: 26/26 pass.
- Next production build: pass; 62 pages generated and all routes compiled.
- Playwright discovery: 56 end-to-end cases across 27 files.
- Browser: 1440, 768, and 390 widths; no horizontal overflow.
- Browser interactions: navigation, capability accordion, and priority carousel.
- Browser interactions: FAQ expansion and empty signup validation.
- Browser console: no errors or warnings in a fresh production-mode tab.
- `/api/health`: 200, process live, `Cache-Control: no-store`.
- `/api/ready`: 200, database up, `Cache-Control: no-store`.
- Provenance scan: no upstream ERP source/brand terms in the repository.

## Not included

- Production deployment.
- Full enterprise accounting, inventory, manufacturing, asset, or people
  modules.
- Completion of Cortex field-level authorization or approval-bound writes.
- Database migration execution. Production/Git ledger drift must be recovered
  per `docs/research/DATABASE_MIGRATION_RECOVERY.md` before any database push.
- Enabling or validating the Vercel Analytics project dashboard.
- Authenticated runtime exercise of every newly added universal-search query.
