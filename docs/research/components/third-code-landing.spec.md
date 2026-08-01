# Component specification: Third Code ERP public landing

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
