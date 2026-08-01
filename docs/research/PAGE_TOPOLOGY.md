# Third Code ERP landing page topology

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
