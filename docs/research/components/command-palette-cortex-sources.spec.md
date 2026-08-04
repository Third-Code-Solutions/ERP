# CommandPalette Cortex Sources Specification

## Overview

- Target file: `apps/web/src/components/nav/command-palette.tsx`
- Source contract: `GET /api/cortex/search?q=<term>`
- Presentation helper: `apps/web/src/lib/cortex/command-palette-search.ts`
- Interaction model: explicit mode selection, bounded source lookup, canonical
  record navigation, and a separate user-confirmed Cortex handoff.

## Modes

### Search records

- Existing `/api/search` behavior remains unchanged.
- One debounced request is made after two or more characters.
- Results are permission-scoped records and open their existing canonical href.

### Ask Cortex

- No request is made until the operator selects the Ask Cortex tab.
- After two or more characters, one debounced request searches the existing
  tenant- and role-scoped Cortex graph.
- Only results with a non-null canonical href render as source rows.
- Selecting a source opens that ERP record; it does not call an AI provider.
- The final Ask Cortex row stages a draft handoff only after an explicit click
  or Enter. Sending remains a separate action inside Cortex.

## DOM and accessibility contract

```text
dialog[aria-label="Command palette"]
  input[role="combobox"]
  div[role="tablist"]
    button[role="tab"]: Search records
    button[role="tab"]: Ask Cortex
  div[role="listbox"][aria-label="Cortex sources and actions"]
    button[role="option"]: Cortex source x N
    button[role="option"]: Ask Cortex (when term length >= 2)
```

- Arrow keys wrap through source rows before the Ask Cortex action.
- Enter opens the active source or stages the explicit handoff.
- Loading, empty, and failure copy use `status`/`alert` live regions.
- Source rows are labeled `Cortex source` and show title plus compact summary
  and freshness text.

## States

- Empty (<2 characters): explains that source records are searched first and
  no question is sent until Ask Cortex is pressed.
- Loading: `Finding source records...`.
- No matches: `No source records found.`.
- Failure: a non-sensitive status with the HTTP failure class or an unavailable
  message; no response body is exposed.
- Results: actionable, canonical, source-backed rows only.

## Safety and cost boundaries

- The browser never writes to ERP tables from this component.
- Tenant identity, role scope, graph filtering, and source registry validation
  remain server-side.
- The palette performs no LLM, Python, queue, storage, or provider call.
- Default Search records traffic is not duplicated; Cortex traffic is opt-in,
  debounced, abortable, and capped by the existing API at 20 hits.
- A missing or unsafe href is dropped before presentation.

## Responsive behavior

- Desktop and tablet retain the existing 640px palette shell and 60vh result
  viewport.
- Mobile keeps the same vertical flow, 44px mode controls, full-width source
  rows, and keyboard/focus semantics.
- No new card grid or persistent page surface is introduced.
