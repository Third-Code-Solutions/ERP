# LandingNav Specification

## Overview

- **Target file:** `apps/web/src/components/marketing/third-code-landing.tsx`
- **Screenshot:** `docs/design-references/thirdcode-live-home-desktop-1440.png`
- **Interaction model:** fixed + click/anchor

## Computed styles

- Desktop rect: x=23, y=18, width=1380px, height=68px.
- `display: grid`; `grid-template-columns: minmax(230px, 1fr) auto
  minmax(230px, 1fr)`; `padding: 10px 12px 10px 16px`.
- `background: rgba(7, 19, 31, 0.78)`; `border: 1px solid rgba(245, 240,
  232, 0.13)`; `border-radius: 12px`; `backdrop-filter: blur(22px)`;
  `box-shadow: 0 18px 56px rgba(0, 0, 0, 0.2)`.
- Mobile rect: x=10, y=10, width=355px, height=62px. Brand subtitle and
  sign-in link are hidden; nav links are hidden below 1,180px.

## Content and states

Brand text is verbatim: `Third Code ERP` / `Built for work that compounds`.
Links: Platform, Cortex AI, Workflows, Trust, Sign in, Start guided setup.
CTA hover moves `translateY(-2px)` and changes ivory background to white.

## Responsive behavior

- 1440px: three-column grid; center nav links visible.
- 768px: two-column grid; nav links hidden.
- 390px: compact two-column grid; subtitle and sign-in hidden; CTA remains
  at least 44px high.
