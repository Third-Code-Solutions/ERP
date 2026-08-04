# LandingCortexAccordion Specification

## Overview

- **Target file:** `apps/web/src/components/marketing/third-code-landing.tsx`
- **Screenshot:** `docs/design-references/thirdcode-live-home-desktop-1440.png`
- **Interaction model:** click + focus + hover; local state

## Content

Verbatim outcomes: `Find anything`, `Understand context`, `Move work forward`,
`Prove every decision`. Active copy includes descriptions and details from
`third-code-content` in source.

## States

Exactly one item is active on desktop (`aria-expanded="true"`). Desktop uses
horizontal expansion with vertical writing for inactive titles. At 768px and
390px all rows become horizontal; only active body copy displays on mobile.
