# Third Code ERP landing page topology

## 2026-08-12 live topology recheck

The public route was rechecked with browser automation at 1440x900, 768x900,
and 390x844. It retained fixed navigation, hero, proof rail, platform bento,
Cortex capability accordion, workflow stack, priority carousel, FAQ, CTA, and
footer order. Scroll/client widths matched at every viewport and console errors
were absent. `/dashboard` redirected to login without a session.

Fresh evidence: `docs/research/LIVE_LANDING_AUDIT_20260812.md`.

## 2026-08-10 live topology recheck

Playwright reconfirmed the public route at 1440x900, 768x900, and 390x844.
The route retained the fixed nav, single-column tablet/mobile hero, dense
platform grid, capability accordion, workflow stack, priority carousel, FAQ,
CTA, and footer order. No horizontal overflow or console errors were
observed. The deployed snapshot predates the source-branch Cortex query
preview controls; this is documented drift, not a reason to bypass the spend
lock with a deployment.

Fresh captures: `docs/design-references/third-code-erp-live-desktop.png` and
`docs/design-references/third-code-erp-live-mobile.png`.

Observed order from the live page and source route. IDs and data attributes are recorded so future UI work can preserve deep links and behavior.

1. `header` / fixed navigation
   - Brand, section links, setup CTA.
2. `main#main-content`
   - `section[data-hero]`: eyebrow, headline, supporting copy, primary CTA, `[data-hero-media]` visual.
   - `section#platform`: product capability grid and selected capability detail.
   - `section#cortex`: Cortex explanation and permission/provenance framing.
   - `section#trust`: proof/coverage strip for CRM, estimating, BOM, procurement, projects, billing, compliance, warranty, Cortex AI.
   - `section#workflows`: four `[data-stack-card]` workflow cards in Win, Plan, Deliver, Close order.
   - `section#questions`: FAQ disclosures.
   - Team-priority carousel and final conversion CTA sit between workflow content and FAQ/footer in the rendered page.
3. `footer`
   - Product/coverage links, trust/legal copy, and company credit.

## Primary route

- `/` renders the public landing page.
- `/dashboard` is the authenticated application route and is outside this public-page topology.

## State and ownership

- Capability selection is local component state keyed by capability id.
- Priority carousel index is bounded local state.
- FAQ open/close state is native disclosure state.
- Scroll animation is owned by GSAP/ScrollTrigger and is disabled for reduced motion.

## Asset map

- Hero visual: `apps/web/public/images/third-code-erp-hero.png`.
- Live reference captures: `docs/design-references/thirdcode-erp-live-desktop.png`, `docs/design-references/thirdcode-erp-live-mobile.png`.

### 2026-08-02 production capture

- Full-page desktop: `docs/design-references/third-code-erp-production-desktop.png`.
- Full-page mobile: `docs/design-references/third-code-erp-production-mobile.png`.
- The production topology still matches the route order above; no new public route or vendor-derived surface was observed.

## Historical source topology retained

The original repository topology remains the baseline for regression review:

1. Floating fixed navigation with glass treatment.
2. Asymmetric attention hero with original construction image.
3. Decorative proof rail with operational vocabulary.
4. Dense 12-column, 24-cell interest bento with AI Brain, operations, and
   compliance.
5. Horizontal capability accordion with hover/focus/click expansion.
6. Desire narrative with scroll-linked image scaling and stacked workflow cards.
7. Manual testimonial carousel with no autoplay.
8. High-contrast action CTA.
9. Footer with product, trust, and company links.

All sections remain in normal document flow; JavaScript adds motion and
progressive disclosure only. This source contract is retained even where the
latest live capture uses updated section IDs and copy.

## 2026-08-04 measured topology recheck

Playwright reconfirmed the public route at 1440x1000, 768x900, and 390x844.
The production page height measured 8,823px at desktop and 10,688px at 390px;
the route retained the same section order and no horizontal overflow.

### Measured section bounds (1440px)

| Section | Top | Height |
| --- | ---: | ---: |
| Hero | 0 | 1,000 |
| Platform | 1,064 | 1,448 |
| Capability | 2,512 | 1,197 |
| Workflow | 3,709 | 2,240 |
| Priority | 5,949 | 712 |
| FAQ | 6,661 | 969 |
| CTA | 7,861 | 584 |
| Footer | 8,444 | 379 |

### New read-only surface

- Cortex preview is nested in the existing Cortex brain card; it is owned by
  local component state and renders one of three sample answers.
- Query controls expose `aria-pressed`; answer text uses `aria-live="polite"`.
- Source chips are descriptive sample provenance only. No API route, approval,
  database write, or ERP transaction is reachable from the public preview.
