# Third Code ERP live landing audit - 2026-08-01

Target: https://thirdcode-erp.vercel.app/

## Browser evidence

- Page title: Construction ERP with a permission-aware AI brain
- Desktop viewport: 1440 x 900.
- Mobile viewport: 390 x 844.
- Desktop hero H1: three measured lines; computed line height 65.52px.
- Mobile hero H1: three measured lines; computed line height 40.0608px.
- Desktop bento: 12 equal columns, 2 rows, grid-auto-flow: dense.
- Desktop bento occupancy: 7 x 2 AI card plus 5 x 1 operations card plus
  5 x 1 compliance card = 24 of 24 cells.
- Desktop document width: 1425 CSS pixels; scroll width 1425. No horizontal
  overflow.
- Mobile document width: 375 CSS pixels after scrollbar; scroll width 375. No
  horizontal overflow.
- Visible mobile controls are 44px or 54px high, including navigation,
  CTAs, carousel controls, and footer links.

## Interaction sweep

- Accordion: clicking Understand context changes only its aria-expanded state
  to true; other panels remain collapsed.
- Carousel: next control changes quote position from 1 / 4 to 2 / 4.
- FAQ: opening What does Third Code ERP connect? sets only its native details
  element open.
- Console: zero errors and zero warnings after navigation and interaction
  sweep.

## SEO and trust evidence

- Canonical: https://thirdcode-erp.vercel.app.
- Open Graph image: /images/third-code-erp-hero.png.
- JSON-LD graph contains Organization, SoftwareApplication, and FAQPage.
- No ERPNext/Frappe branding or copied source identifiers appear in landing
  output.

## Artifacts

- Desktop screenshot: docs/design-references/live-landing-desktop.png.
- Accessibility snapshot: docs/research/live-landing-snapshot.md.
- Existing responsive references remain
  docs/design-references/third-code-landing-{desktop,mobile,tablet}-2026-07-29.png.

Conclusion: current landing architecture is visually and behaviorally sound.
Do not rewrite it as part of backend migration. Protect its three-line hero,
dense bento, progressive disclosure, and permission-aware copy with the
source regression contract in
apps/web/src/components/marketing/third-code-landing.test.ts.
