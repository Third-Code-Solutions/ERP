# ABI OS landing page

Date: 2026-08-12

## Summary

- Reworked the public landing page into a complete ABI OS marketing surface with an actuate-inspired editorial layout: sticky navigation, full-bleed hero, proof rail, operating-record statement, Cortex feature bento, capability switcher, workflow stack, team-priority quote, FAQ, CTA, and footer.
- Replaced the landing-page brand presentation with ABI OS and the supplied ABI mark, including the favicon, manifest, page metadata, structured application name, and FAQ copy.
- Added responsive desktop, tablet, and mobile behavior with keyboard-visible interactive controls, explicit hero line geometry, reduced-motion handling, calibrated anchor offsets, and no horizontal overflow.
- Polished the visual rhythm across the page: simplified the hero to two readable lines, removed the workflow pinning dead zone, added a controlled sticky card stack, improved heading alignment, and introduced distinct operations and field imagery.
- Kept authentication routes and dashboard product surfaces outside the landing-page redesign scope.

## Verification

- PASS — `pnpm --filter @third-code-erp/web typecheck`
- PASS — `pnpm --filter @third-code-erp/web lint` (repository lint script is TypeScript-only)
- PASS — `pnpm --filter @third-code-erp/web test` (46 files, 278 tests)
- PASS — `pnpm --filter @third-code-erp/web build` (77 static pages)
- PASS — `pnpm --filter @third-code-erp/web exec playwright test e2e/frontend-release-local.spec.ts --project=chromium` using installed system Chrome
- PASS — production-style browser checks at 1440px, 1024px, 768px, 390px, and 320px: title, heading semantics, CTA target sizes, anchor placement below the sticky nav, capability switcher, priority carousel, image loading, zero horizontal overflow, no 4xx responses, and zero console errors/warnings
- PASS — reduced-motion browser check: hero and workflow transforms remain disabled with `prefers-reduced-motion: reduce`

## Deployment

Not deployed. No commit, push, or hosting change was requested.
