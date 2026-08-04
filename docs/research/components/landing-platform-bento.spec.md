# LandingPlatformBento Specification

## Overview

- **Target file:** `apps/web/src/components/marketing/third-code-landing.tsx`
- **Screenshot:** `docs/design-references/thirdcode-live-home-desktop-1440.png`
- **Interaction model:** static + hover + local Cortex query click

## Structure

Intro precedes a dense 12-column, two-row grid with three cards:

1. Brain card (`Cortex`): graph, source checklist, and read-only Cortex preview.
2. Operations card: Win, Estimate, Buy, Build, Bill, Support flow.
3. Compliance card: VAT and retention, BIR 2307 support, tenant isolation,
   hash-chained audit.

Desktop uses `grid-auto-flow: dense`. At 768px cards span full width; at
390px cards become a single-column flex stack.

## Cortex preview state

Three buttons switch `aria-pressed` state and replace answer/source chips in an
`aria-live="polite"` region. Sample questions are explicitly read-only and do
  not call an API or commit an ERP transaction.
