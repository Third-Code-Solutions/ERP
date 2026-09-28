# System dark mode handoff

## Scope and order

1. Agent 01 — update PRD v1.5 with the authenticated workspace appearance contract and acceptance criteria. This is complete in `docs/PRD.md`.
2. Agent 02 — implement shared dark design tokens and the accessible appearance control across the tenant workspace and Platform Control, while keeping public portals and print presentation separate.
3. Agent 03 — wire the saved preference into both authenticated layouts, use light mode for missing or unsupported values, and verify that navigation and reload preserve the selection.
4. Integration owner — run focused checks and representative browser journeys in both modes. Record the routes inspected; do not claim full route coverage from component or build checks alone.

## Boundaries

The preference is browser scoped and affects presentation only. Existing tenant isolation, authorization, route behavior, data contracts, and the refactor's MVP and ten-company release gates remain unchanged. No schema or provider change is required.

→ Handoff to Agents 02 and 03. Reason: implement and verify the UI and layout behavior specified in PRD §1.1. Inputs: PRD v1.5, the existing authenticated shells, and the current design tokens. Expected output: working controls, persistent light/dark selection, focused tests, browser evidence, and an implementation changeset with any unverified routes identified.
