# AbiOsLanding specification

## Overview

- **Target file:** `apps/web/src/components/marketing/abi-os-landing.tsx`
- **Styles:** `apps/web/src/components/marketing/abi-os-landing.module.css`
- **Image:** `apps/web/public/images/abi-os-hero.png`
- **Desktop evidence:** `docs/design-references/abi-os-landing-desktop-2026-07-29.png`
- **Tablet evidence:** `docs/design-references/abi-os-landing-tablet-2026-07-29.png`
- **Mobile evidence:** `docs/design-references/abi-os-landing-mobile-2026-07-29.png`
- **Interaction model:** scroll, hover, focus, and click

## Brand system

- Product: ABI OPS
- Company: Actuate Builders Inc.
- Voice: calm, precise, construction-literate, enterprise-ready
- Palette: midnight `#07131f`, navy `#0f2d4a`, ivory `#f5f0e8`,
  copper `#d08a57`, graphite `#161a1d`
- Display stack: Satoshi with Geist/system fallback
- Body stack: existing application sans stack

## Hero

- H1 width: `max-width: 72rem`
- H1 size: `clamp(3rem, 5vw, 5.5rem)`
- Maximum three lines at supported widths
- Exactly three measured visual lines at 1440px, 768px, and 390px
- Left-aligned copy with right/lower-right media composition
- Two actions: `Start guided setup`, `Open workspace`
- No badges, raw metrics, or floating stamps
- Decorative inline heading image hidden at 700px and below

## Bento density

- Grid: 12 columns, two equal rows, dense flow
- AI Brain: 7 columns × 2 rows = 14 cells
- Operations: 5 columns × 1 row = 5 cells
- PH compliance: 5 columns × 1 row = 5 cells
- Total: 24 of 24 cells occupied

## Content chapters

- AI Brain: permissioned graph, citations, provenance, human-approved actions
- Operations: CRM, estimate, BOM, procurement, delivery, project, billing, warranty
- Compliance: VAT, retention, BIR 2307, audit, tenant isolation
- Multi-business: configurable workflows and role-scoped workspaces
- FAQ: semantic answers shared with `FAQPage` structured data

## Responsive behavior

- Desktop: asymmetric hero, dense bento, horizontal accordion, stacked cards.
- Tablet: two-column hero and bento; normal-flow workflow cards.
- Mobile: single column; three-line hero; 44px minimum visible controls; no
  horizontal overflow.

## Accessibility

- One H1.
- Semantic landmarks and section headings.
- Visible focus states.
- Reduced-motion fallback.
- Accordion and carousel expose state through ARIA.
- Decorative motion and marquee hidden from screen readers.
- Capability, workflow, and FAQ surfaces use descriptive labels without
  decorative ordinals.
