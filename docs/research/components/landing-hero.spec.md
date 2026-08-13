# LandingHero Specification

## Overview

- **Target file:** `apps/web/src/components/marketing/third-code-landing.tsx`
- **Screenshot:** `docs/design-references/thirdcode-live-home-desktop-1440.png`
- **Interaction model:** editorial split + scroll-driven media

## Computed styles

- Desktop section rect: width 1425px, height 1000px; `display: grid`;
  `padding: 150px 72px 88px`; two columns `0.92fr / 1.08fr`.
- H1 rect: x=72, y=321, width=560px, height=203px; Satoshi, 72px, weight
  500, line-height 65.52px, letter-spacing -4.68px.
- H1 has three explicit lines and measured `max-width: 72rem`.
- Hero media rect: x=605, y=230, width=905px, height=603px at desktop;
  image is eager/high priority and uses `/images/third-code-erp-hero.png`.

## States and behavior

- Initial media state after load: approximately `opacity: 1`, `scale: 1`.
- Scroll state: GSAP fades toward `.32` and scales toward `1.04`.
- Reduced motion: GSAP clears hero media properties.
- Two actions remain visible: `Start guided setup` and `Open workspace`.

## Responsive behavior

- 768px: one-column grid, H1 48px/43.68px, media follows copy.
- 390px: one-column grid, H1 41.73px/40.0608px, inline image hidden,
  full-width stacked buttons.
