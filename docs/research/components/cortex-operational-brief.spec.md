# CortexOperationalBrief Specification

## Overview

- Target file: `apps/web/src/components/cortex/cortex-brief-panel.tsx`
- Presentation model: `apps/web/src/lib/cortex/brief-presentation.ts`
- Screenshot reference: `docs/design-references/thirdcode-erp-live-desktop.png`
- Interaction model: click-driven source links with bounded GSAP entrance; no
  network request, mutation, autoplay, or approval action.

## DOM Structure

```text
section[aria-labelledby]
  header
    div: eyebrow, h2, supporting text
    div: freshness summary (fresh / stale / unknown)
  div[data-brief-grid]
    div[data-brief-list]
      a[data-brief-item] x 6 (source-backed record rows)
    aside[data-brief-aside]
      strong: permission scope
      dl: visible record count, provenance count, connection count
```

## Computed Styles (implementation contract)

### Shell

- display: block
- margin-top: 20px
- overflow: hidden
- background: `#ffffff` (`var(--color-surface)`)
- border: `1px solid #e8e8ea` (`var(--color-border)`)
- border-radius: `12px`
- box-shadow: `0 1px 2px rgba(15, 23, 42, 0.05), 0 1px 1px rgba(15, 23, 42, 0.04)`

### Header

- display: flex
- align-items: flex-start
- justify-content: space-between
- gap: `24px`
- padding: `22px 24px 18px`
- background: `linear-gradient(135deg, #ffffff, #fafafa)`

### Heading

- font-family: `'Cabinet Grotesk', 'Satoshi', var(--font-sans), sans-serif`
- font-size: `1.25rem`
- font-weight: `700`
- line-height: `1.1`
- letter-spacing: `-0.035em`
- color: `#08203a` (`var(--color-navy-900)`)

### Grid

- display: grid
- grid-template-columns: `minmax(0, 1.5fr) minmax(220px, 0.7fr)`
- grid-auto-flow: dense
- gap: `1px`
- background: `#e8e8ea`
- border-top: `1px solid #e8e8ea`

### Evidence row

- display: grid
- grid-template-columns: `8px minmax(0, 1fr) auto`
- align-items: center
- gap: `12px`
- min-height: `72px`
- padding: `12px 24px`
- background: `#ffffff`
- transition: `background-color 160ms ease, transform 160ms ease`
- hover background: `#fafafa`
- hover transform: `translateX(3px)`

### Freshness summary

- display: grid
- grid-template-columns: `repeat(3, minmax(0, 1fr))`
- gap: `8px`
- padding: `18px 20px`
- background: `#f7f7f8` (`var(--color-surface-sunken)`)
- labels: `0.625rem`, `700`, uppercase, `0.08em` letter spacing
- values: `1.35rem`, `700`, `var(--font-mono)`

## States and Behaviors

- Initial state: rows are source-backed, visible, and listed newest-first.
- Entrance: GSAP `fromTo` starts each row at `opacity: 0`, `y: 12px`,
  `scale: 0.985`; ends at `opacity: 1`, `y: 0`, `scale: 1`, duration `0.42s`,
  stagger `0.045s`, `power2.out`.
- Reduced motion: skip GSAP transform/opacity changes; rows render fully visible.
- Hover/focus: source row receives the exact hover transform above; keyboard
  focus uses existing global `:focus-visible` outline.
- Freshness: status is descriptive only. It never authorizes or submits a
  transaction.

## Content

- Heading: `What Cortex knows now`
- Supporting copy: `Recent source records, permission-scoped and ready to open.`
- Freshness labels: `Fresh`, `Stale`, `Unknown`
- Scope copy: `Read-only evidence surface`
- Scope detail: `Every link opens the canonical ERP record allowed for your role.`
- Empty copy: `No indexed records in your current scope.`

## Responsive Behavior

- Desktop 1440px: two-column grid; evidence list wider than freshness aside.
- Tablet 768px: two-column grid retained; shell padding reduces to `18px`.
- Mobile 390px: single-column grid; freshness summary follows evidence list;
  rows retain 44px+ hit area and timestamp moves below title.
- Breakpoint: `720px`.

## Safety

- Tenant ID and role scope come from the authenticated server page.
- View model drops unregistered Cortex entity sources before render.
- No direct browser database write, AI call, Python finalization, or provider
  action exists in this component.
