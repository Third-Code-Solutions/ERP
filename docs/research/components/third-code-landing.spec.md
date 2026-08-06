# Component specification: Third Code ERP public landing

## 2026-08-06 M3.124 boundary correction

- Priority carousel index clamps to `0..3`; navigation never wraps.
- `Previous team priority` is disabled at `1 / 4`; `Next team priority` is
  disabled at `4 / 4`. Native button semantics preserve keyboard and screen
  reader state; controls remain 44px.
- Above-fold hero media declares Next image priority. Decorative inline media
  remains non-eager so mobile does not pay unnecessary image work.

Scope: public marketing route only. This specification documents the current live/source contract; it authorizes preservation and targeted refinement, not a rewrite.

## Visual system

- Display family: Satoshi with Inter fallback.
- Body family: Inter.
- Page text: `rgb(245,240,232)` on deep navy surfaces.
- Accent: warm orange used for eyebrow labels and small state cues.
- Primary CTA: 13px, weight 700, line-height 19.5px, dark text `rgb(16,29,39)`, background `rgb(245,240,232)`, horizontal padding 24px, radius 7px, 0.22s color/background/border/transform transition.
- Desktop nav: fixed 1380x68 at x=22.5/y=18, radius 12px, `rgba(7,19,31,.78)` background, shadow `0 18px 56px rgba(0,0,0,.2)`.
- Hero: desktop padding `150px 72px 88px`; grid columns approximately `589.25px 691.75px`.
- Hero headline: 72px / 65.52px, weight 500, letter-spacing -4.68px, max-width 1152px.
- Workflow cards: desktop max-width approximately 870.656px, `rgb(11,28,43)` background, 57.6px padding, 28px stack gap, 13px radius, `0 36px 80px rgba(0,0,0,.24)` shadow.
- Footer: desktop padding `110px 0 32px`, two-column grid approximately `489.375px 815.625px`, 72px gap.

## Components

### Navigation

Fixed, rounded, keyboard-navigable. Preserve stable section links and the compact mobile action. No scroll-dependent visual mutation was observed.

### Hero

Use a single semantic h1, one supporting paragraph, one primary CTA, and one descriptive image with stable alt text. `[data-hero]` and `[data-hero-media]` are behavior hooks. Keep the visual as a decorative/product proof asset, not a control.

### Capability grid

Four selectable cards: Find anything, Understand context, Move work forward, Prove every decision. The selected card exposes a concise description and evidence-oriented detail. State must remain local and URL-independent unless a future accessibility requirement adds deep linking.

### Workflow stack

Four cards in Win → Plan → Deliver → Close order. Each card includes stage label, action-oriented title, description, and three short proof bullets. Desktop uses a dense stacked composition with scroll-linked transforms; mobile uses normal document flow.

### Team priorities

Single active quote card with role/context metadata and bounded previous/next controls. Controls need `aria-label`, disabled state at ends, and no automatic rotation.

### FAQ

Native disclosure semantics. Questions address connected records, non-construction use, Cortex provenance, human approval, and Philippine controls. Do not turn FAQ copy into unsupported compliance claims.

## Accessibility and motion

- Preserve visible focus rings and semantic headings.
- Ensure icon-only controls have accessible names.
- Honor `prefers-reduced-motion: reduce` by clearing GSAP transforms and avoiding scroll-linked effects.
- Keep touch targets usable on the 390px capture.

## Release QA

- Capture desktop and mobile screenshots before UI changes.
- Verify section anchors, capability selection, carousel bounds, FAQ disclosure, keyboard focus, and reduced motion.
- Run web lint, typecheck, unit tests, production build, and browser smoke checks. Do not deploy landing changes while provider release gates are red.

## Historical source requirements retained

- Target files remain `apps/web/src/components/marketing/third-code-landing.tsx`
  and `third-code-landing.module.css`; the hero asset remains
  `apps/web/public/images/third-code-erp-hero.png`.
- Existing evidence references remain valid: the 2026-07-29 desktop/tablet/
  mobile captures, `docs/research/LIVE_LANDING_AUDIT_20260801.md`, and the
  current live desktop capture.
- Brand contract: Third Code ERP, Third Code Solutions Inc.; calm, precise,
  construction-literate, enterprise-ready voice; midnight `#07131f`, navy
  `#0f2d4a`, ivory `#f5f0e8`, copper `#d08a57`, graphite `#161a1d`.
- Historical hero contract: max-width 72rem, `clamp(3rem, 5vw, 5.5rem)`
  headline, maximum three visual lines at desktop/tablet/mobile, asymmetric
  copy/media composition, `Start guided setup` and `Open workspace` actions,
  no badges/raw metrics/floating stamps, and inline media hidden below 700px.
- Historical bento contract: 12 columns by two equal rows; AI Brain 7x2,
  Operations 5x1, PH compliance 5x1, for 24/24 occupied cells.
- Historical content contract covers permissioned graph/citations/provenance,
  CRM/estimate/BOM/procurement/delivery/project/billing/warranty, VAT/
  retention/BIR 2307/audit/tenant isolation, configurable multi-business
  workflows, and FAQPage-compatible answers.
- Historical responsive/accessibility contract requires a two-column tablet,
  one-column mobile, 44px controls, no horizontal overflow, one H1,
  semantic landmarks, visible focus, reduced-motion fallback, ARIA accordion/
  carousel state, decorative motion hidden from assistive technology, and no
  decorative ordinals.


## 2026-08-04 shared-quota-turn implementation mapping

# Third Code ERP landing specification

## Overview

- Target: `apps/web/src/components/marketing/third-code-landing.tsx` (current
  implementation may split sections; preserve existing conventions).
- Reference: `https://thirdcode-erp.vercel.app/` Playwright reconnaissance on
  2026-08-04.
- Interaction model: mixed fixed navigation, click disclosure, click carousel,
  native FAQ disclosure, and passive scroll/ambient motion.

## Visual tokens observed

- Font stack: `Satoshi, Inter, "Inter Fallback", Inter, ui-sans-serif,
  system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Primary text: `rgb(245, 240, 232)`.
- Navigation: `rgba(7, 19, 31, 0.78)`, 12px radius, shadow
  `rgba(0, 0, 0, 0.2) 0px 18px 56px 0px`.
- Hero desktop H1: 72px, 65.52px line-height, weight 500; mobile about
  41.73px, 40.0608px line-height.
- Navigation desktop: fixed, top 18px, width 1,380px at 1,440px viewport,
  padding `10px 12px 10px 16px`; mobile width 355px, padding `8px 9px 8px 12px`.

## Content contract

- H1: `Run every project with an AI brain that remembers.`
- Hero paragraph: `Third Code ERP connects pipeline, estimates, procurement,
  delivery, billing, compliance, and company knowledgeâ€”so teams see what
  matters and why.`
- Capability labels: CRM, Estimating, BOM, Procurement, Projects, Billing,
  Compliance, Warranty, Cortex AI.
- Final CTA: `One company brain. Every project under control.`
- Auth links: `Start guided setup`, `Open workspace`, `Sign in to workspace`.

## Assets

- Hero image: `/images/third-code-erp-hero.png`.
- Image alt: `Architectural plans, fit-out materials, and a connected
  operations graph in a construction workspace`.
- No external image asset should be introduced without a local asset record and
  clean-room scan.

## Responsive behavior

- Desktop: wide hero, fixed centered nav, multi-column feature/workflow layout.
- Tablet: retain section order; reduce gaps and card columns at existing source
  breakpoints.
- Mobile: one-column hero/cards/FAQ/footer, fixed nav remains within viewport,
  no horizontal overflow.

## Acceptance checks

- H1 stays within two to three readable lines at desktop and mobile.
- No cheap numbered meta-labels, legacy ABI Ops markers, ERPNext/Frappe text, or
  competitor branding in shipped UI.
- Disclosure controls expose correct `aria-expanded`; FAQ remains keyboard and
  native-details compatible.
- CTA text remains high-contrast; reduced-motion users retain all content.

## Historical source contract retained

- Target files remain
  apps/web/src/components/marketing/third-code-landing.tsx and
  third-code-landing.module.css; the hero asset remains
  apps/web/public/images/third-code-erp-hero.png.
- Existing evidence references remain valid: the 2026-07-29 desktop, tablet,
  and mobile captures, docs/research/LIVE_LANDING_AUDIT_20260801.md, and
  the current live desktop capture.
- Brand contract: Third Code ERP, Third Code Solutions Inc.; calm, precise,
  construction-literate, enterprise-ready voice; midnight #07131f, navy
  #0f2d4a, ivory #f5f0e8, copper #d08a57, graphite #161a1d.
- Historical hero contract: max-width 72rem, clamp(3rem, 5vw, 5.5rem)
  headline, at most three visual lines at desktop/tablet/mobile, asymmetric
  copy/media composition, Start guided setup and Open workspace actions,
  no badges/raw metrics/floating stamps, and inline media hidden below 700px.
- Historical bento contract: 12 columns by two equal rows; AI Brain 7x2,
  Operations 5x1, PH compliance 5x1, for 24/24 occupied cells.
- Historical content contract covers permissioned graph/citations/provenance,
  CRM/estimate/BOM/procurement/delivery/project/billing/warranty, VAT,
  retention, BIR 2307, audit, tenant isolation, configurable multi-business
  workflows, and FAQPage-compatible answers.
- Historical responsive/accessibility contract requires a two-column tablet,
  one-column mobile, 44px controls, no horizontal overflow, one H1, semantic
  landmarks, visible focus, reduced-motion fallback, ARIA accordion/carousel
  state, decorative motion hidden from assistive technology, and no decorative
  ordinals.

## 2026-08-04 live implementation mapping

- The current source is split across
  apps/web/src/components/marketing/third-code-content.ts,
  apps/web/src/components/marketing/third-code-landing.tsx,
  apps/web/src/components/marketing/third-code-landing.module.css, and
  apps/web/src/app/page.tsx; this specification describes their shared public
  contract rather than requiring a file rewrite.
- The measured live surface has one H1, fixed glass navigation, the CRM-to-
  Cortex proof rail, three platform cards, four Cortex capability cards, four
  workflow cards, a four-state priority carousel, five native FAQ rows, a
  read-only Cortex preview, final CTA, and footer.
- Release proof must cover 1440px, 768px, and 390px browser renders, console
  errors, overflow, keyboard focus, reduced motion, capability state,
  carousel bounds, FAQ disclosure, metadata, and a clean-room branding scan.
