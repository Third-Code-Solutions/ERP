# LandingWorkflowStack Specification

## Overview

- **Target file:** `apps/web/src/components/marketing/third-code-landing.tsx`
- **Screenshot:** `docs/design-references/thirdcode-live-home-desktop-1440.png`
- **Interaction model:** desktop scroll-driven pin/stack; mobile static flow

## Content

Four cards in order: Win, Plan, Deliver, Close. Each card contains a title,
description, and three checklist items. Source copy remains exact in component
data.

## Motion

GSAP pins each `[data-stack-card]` against the stack trigger. At `scrollY≈4300`
the first cards begin scale reduction; by `scrollY≈5600` cards are visibly
translated and stacked. `prefers-reduced-motion` clears transforms.

## Responsive behavior

At 959px and below the intro and stack become one column; at 700px cards use
vertical flex layout and no pinned visual overlap.
