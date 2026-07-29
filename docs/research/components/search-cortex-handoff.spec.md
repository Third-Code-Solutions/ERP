# Search-to-Cortex Handoff Specification

## Overview

- **Target files:**
  - `apps/web/src/components/nav/command-palette.tsx`
  - `apps/web/src/components/cortex/cortex-agent.tsx`
  - `apps/web/src/lib/cortex/draft-handoff.ts`
- **Reference surface:** authenticated production command palette on
  `https://thirdcode-erp.vercel.app/dashboard`
- **Interaction model:** keyboard and click driven
- **Authority:** read-only navigation handoff; no AI request and no ERP
  transaction occurs until the user explicitly presses Send in Cortex

## Current measured surface

Measured at 1280 x 720 from the authenticated production surface:

### Overlay

- display: `flex`
- width: `1265px`
- padding: `86.4px 16px 16px`
- background: `rgba(15, 23, 42, 0.32)`
- backdrop filter: `blur(4px)`

### Panel

- width: `640px`
- max-width: `640px`
- background: `rgb(255, 255, 255)`
- border: `1px solid rgb(232, 232, 234)`
- border-radius: `12px`
- box-shadow:
  `rgba(15, 45, 74, 0.32) 0 24px 64px -16px,
  rgba(15, 45, 74, 0.08) 0 4px 12px`

### Input

- font-size: `15px`
- padding: `0`
- background: transparent
- border: none
- current application font: existing shared sans token

## DOM structure

1. Modal dialog and combobox remain unchanged.
2. A compact two-option mode control exposes `Search records` and
   `Ask Cortex`. Search remains the default.
3. One text input is retained; label and placeholder follow the selected mode.
4. Authorized record results appear only in Search mode.
5. A distinct `Ask Cortex` option appears in Ask mode whenever normalized
   input contains at least two characters.
6. The Ask option contains:
   - compact AI mark
   - `Ask Cortex` title
   - bounded one-line copy using the current question
   - explicit `Open` affordance

## States and behaviors

### Empty

- Existing search help text remains in Search mode.
- Ask mode explains that opening Cortex only drafts the question; Send remains
  a separate action.
- Ask option is absent until two characters are present.

### Searching

- Existing searching status remains.
- Search requests run only in Search mode.

### Results

- Record results retain their current order and active state.
- Enter opens the active record by default.
- Switching to Ask mode preserves input but clears record results.

### No record match

- Bounded no-match text remains.

### Ask mode

- No record-search request is made.
- Ask Cortex is active by default once the normalized question has at least
  two characters.
- Enter opens the drafted question in Cortex.

### Ask handoff

- Normalize and cap the question before storage.
- Generate an opaque UUID and store the question in same-tab `sessionStorage`
  under that UUID with a five-minute timestamped lifetime.
- Never place prompt text in a URL, server log, analytics event, or provider
  request during handoff.
- Navigate to `/cortex?handoff=<opaque UUID>`.
- The server validates only the UUID and accepts it only for a company-wide
  route without record focus or saved-conversation identity. A copied URL
  contains no question and has no draft in another browser session.
- Cortex consumes and removes the draft once, fills the composer, focuses it,
  replaces the marker with the explicit `/cortex` URL, and does not send.
- Prop-driven UUID changes support handoff when Cortex is already open.
- Expired, malformed, empty, or oversized drafts fail closed.

### Motion

- Panel enters from `translateY(-12px)`, `scale(0.985)`, and opacity `0`.
- Ends at neutral transform and opacity `1`.
- Duration: `0.24s`
- Easing: `power2.out`
- `prefers-reduced-motion: reduce` bypasses animation.

## Visual treatment

- Preserve 640px panel and existing shell tokens.
- Ask option uses a subtle navy-tinted surface only while active or hovered.
- No gradient, floating badge, decorative pill, numbered meta-label, or
  unrelated dashboard redesign.
- All text remains legible on white; active state uses existing navy tokens.
- Touch target is at least 44px.

## Responsive behavior

- **Desktop (1440px):** centered 640px panel; Search and Ask modes share one
  listbox surface.
- **Tablet (768px):** 16px viewport gutters; same interaction order.
- **Mobile (390px):** 16px gutters, full available width, one-line question
  truncation, minimum 44px action, no horizontal overflow.

## Accessibility

- Ask Cortex is a listbox option with `aria-selected`.
- The mode control uses tab semantics and explicit selected state.
- Arrow keys traverse options in the active mode.
- Enter activates the selected option; Escape closes.
- Focus remains visible.
- Cortex textarea receives focus only after a valid draft is consumed.
- No auto-send, surprise network request, or hidden state transition.

## Validation

- Unit tests: normalization, cap, write/consume, one-time removal, expiry, and
  malformed payload.
- Component/policy tests: option count and Enter selection behavior.
- Authenticated browser: record search still works; Ask option handoff retains
  exact draft; Ask mode makes no record-search or `/api/cortex/chat` request;
  storage is removed; 1440/768/390 overflow and console checks pass.
- Full lint, typecheck, tests, production build, gitleaks, actionlint,
  prohibited-source scan, and provider no-deployment verification.
