# Authenticated workspace dark mode

## Outcome

- Added an accessible light/dark toggle to the tenant topbar and Platform Control header. The browser saves the choice in an `erp_theme` cookie, and authenticated layouts read it on navigation and reload. Missing or unsupported values use light mode.
- Added dark semantic colors for workspace surfaces, text, borders, controls, status badges, and key feature panels. Updated hard-coded light surfaces in dashboard routes and feature components to use those colors.
- Kept public marketing, customer portal, signing, and print presentation outside the authenticated theme scope.

## Verification

- Web unit suite: 2,637 passed, 6 skipped (312 files: 309 passed, 3 skipped).
- Web lint and TypeScript checks passed.
- Three focused Playwright theme checks passed against the local production build using the dedicated demo tenant. They covered toggle persistence, mobile layout, dashboard, projects, BOM, purchase orders, finance, and navigation through nine department/admin routes.
- Production build passed after the final embedded-form style sweep.

## Limits

- The browser checks sampled routes; they do not prove every authenticated route or Platform Control page visually correct.
- The theme change affects presentation only and does not change the ERP's ten-company readiness verdict or its authorization evidence.
