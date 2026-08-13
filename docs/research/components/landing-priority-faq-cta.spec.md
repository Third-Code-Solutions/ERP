# LandingPriorityFaqCta Specification

## Overview

- **Target file:** `apps/web/src/components/marketing/third-code-landing.tsx`
- **Screenshot:** `docs/design-references/thirdcode-live-home-desktop-1440.png`
- **Interaction model:** click carousel + native disclosure + CTA links

## Priority panel

Ivory split panel, desktop 1/1 grid, 14px radius. Four rotating priorities use
`aria-live="polite"`; previous and next controls are labeled and keyboard
accessible.

## FAQ

Five native `<details>` rows. Questions and answers are sourced from
`landingFaqs`; all five can be independently open. Summary marker rotates on
open.

## CTA/footer

Ivory CTA panel has 14px radius, 144px desktop padding, 76px/24px mobile
padding, two high-contrast auth links, then Platform/Access/Trust footer groups.
