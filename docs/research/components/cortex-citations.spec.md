# Cortex Citation Navigation Specification

## Overview

- Target files:
  - `apps/web/src/components/cortex/cortex-citation-list.tsx`
  - `apps/web/src/components/cortex/cortex-agent.tsx`
  - `apps/web/src/components/cortex/cortex-entity-panel.tsx`
- Interaction model: click-driven record navigation.
- Visual reference: existing Third Code ERP Cortex chip system in
  `apps/web/src/app/globals.css`. Production visual capture is deferred because
  the connected browser identity is authenticated but has no workspace
  membership; no authorization bypass is permitted.

## User outcome

Every source shown beneath a Cortex answer or entity summary opens the
canonical ERP record that produced it. The response text remains readable
without citations, and a source with no valid route remains plain text.

## DOM structure

- Source region with an accessible `Sources` label.
- Wrapped list of citation items.
- Each navigable item is a Next.js link containing:
  - canonical entity-type label;
  - record title, falling back to the first eight reference-ID characters;
  - a non-visual accessible name beginning with `Open`.
- Non-navigable citations retain the same visual structure without click
  semantics.

## Existing visual tokens

- Chip background: `var(--color-neutral-50)`.
- Chip border: `1px solid var(--color-border)`.
- Chip radius: `6px`.
- Type text: `0.625rem`, weight `700`, uppercase, navy.
- Record text: `0.75rem`, neutral-600, single-line ellipsis.
- Gap between chips: `6px`.

## States and behavior

### Default

- Compact neutral chip.
- No decorative icon or ordinal.
- Source order matches server grounding order.

### Hover

- Navy border and soft information background.
- Record title darkens.
- Transition duration: 160ms, ease-out.

### Keyboard focus

- Visible two-pixel navy outline with two-pixel offset.
- Link receives normal tab order.

### Navigation

- Uses canonical Cortex registry.
- Project-scoped entities use server-provided Project ID.
- Same-tab navigation preserves normal browser history.

## Responsive behavior

- Desktop/tablet: compact chip, minimum height 32px.
- Mobile at 640px and below: minimum height 44px; wrapping remains enabled.
- Citation region never causes horizontal overflow.

## Data and security contract

- Chat text remains `text/plain`; citations travel in a bounded response
  header.
- Header contains at most eight server-grounded citations and truncates
  display titles before encoding.
- Decoder is fail-closed for malformed, oversized, or structurally invalid
  data.
- Conversation history never trusts stored citation metadata. Server reloads
  current tenant-scoped graph nodes under the caller's current role scope.
- A role downgrade removes newly forbidden historical citations.
- Missing, superseded, cross-tenant, and forbidden nodes are omitted.
