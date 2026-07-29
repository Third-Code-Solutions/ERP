# Cortex Evidence Trail Specification

## Overview

- Target files:
  - `apps/web/src/lib/cortex/entity-response.ts`
  - `apps/web/src/components/cortex/cortex-evidence-trail.tsx`
  - `apps/web/src/components/cortex/cortex-entity-panel.tsx`
- Interaction model: click-driven native disclosure.
- Product outcome: every mirrored ERP record can show when and how Cortex
  recorded its evidence without exposing internal provenance fields.
- Live data reference: hosted Supabase read-only aggregate on 2026-07-29.
  Current graph has 637 node-provenance events across 385 nodes; every current
  node has one to three evidence events.

## Trust boundary

- Reuse the existing entity authorization gate and tenant/current-role-filtered
  context pack.
- Retrieve at most six node-provenance rows.
- Normalize provenance on the server.
- Browser may receive only:
  - safe event kind;
  - human label;
  - human explanation;
  - ISO timestamp.
- Never return raw actor ID, origin reference, hash, previous hash, internal
  sequence, tenant ID, subject ID, or source-table implementation detail.
- Provenance remains read-only and cannot authorize or finalize transactions.

## Event mapping

| Stored origin | Safe kind | Label | Explanation |
| --- | --- | --- | --- |
| `mutation` | `record_change` | ERP record change | Captured from an authorized ERP record change. |
| `document` | `document` | Document evidence | Captured from an ingested document. |
| `ai_run` | `ai_analysis` | AI analysis | Recorded from AI analysis for human review. |
| `import` | `data_import` | Data import | Captured during an authorized data import. |
| unknown | `system` | System evidence | Recorded by Cortex. |

Unknown or malformed timestamps are omitted. Events preserve newest-first
server order and are capped at six.

## DOM structure

- `details.cortex-evidence`
  - `summary.cortex-evidence__summary`
    - title `Evidence trail`
    - event count
    - disclosure indicator
  - `ol.cortex-evidence__timeline[aria-label="Evidence trail"]`
    - event item
      - timeline dot
      - event body
        - label
        - explanation
        - UTC timestamp

## Computed visual contract

### Disclosure

- top/bottom margin: `14px`
- top padding: `14px`
- top border: `1px solid rgb(232, 232, 234)`
- summary display: `grid`
- summary columns: `minmax(0, 1fr) auto auto`
- summary gap: `8px`
- minimum target height: `44px`
- title: `11px`, weight `700`, uppercase, `0.05em`
- count: `10px`, weight `600`
- indicator: `12px` glyph in a `14px` square, rotates on open
- focus: `2px solid` navy with `2px` offset

### Timeline

- ordered-list reset: no marker, margin `4px 0 0`, padding `0`
- event grid: `12px minmax(0, 1fr)`
- event gap: `10px`
- event vertical padding: `8px 0`
- dot: `7px` square, circular, navy
- connector: `1px` neutral border, absent after last event
- label: `12px`, weight `600`, neutral 800
- explanation: `11px`, line-height `1.45`, neutral 500
- timestamp: `10px`, neutral 400, UTC

## States and behavior

- No events: render nothing.
- Closed: one 44px summary row; evidence list hidden by native disclosure.
- Open: timeline visible below summary.
- Toggle: click or keyboard activation on native summary.
- Focus: visible two-pixel outline.
- Motion: indicator rotates in `160ms ease-out`.
- Reduced motion: transition disabled.

## Responsive behavior

- Desktop 1440px: disclosure fills Cortex panel width.
- Tablet 768px: unchanged single timeline column.
- Mobile 390px: unchanged single timeline column; timestamp remains below
  explanation; no horizontal overflow.
- All widths: summary target remains at least 44px.

## Assets and dependencies

- No image, icon package, font, animation library, or dependency.
- Disclosure indicator uses CSS only.
- Existing panel colors and spacing remain authoritative.

## Acceptance criteria

- All four known origins map to safe original language.
- Unknown origin fails safely to generic system evidence.
- Malformed timestamps and sensitive provenance fields never reach response.
- Response is capped at six events and preserves newest-first order.
- Existing `found`, `summary`, `citations`, and `relationships` fields remain
  compatible.
- Empty evidence renders nothing.
- Native disclosure works with pointer and keyboard.
- 1440/768/390 checks show 44px target, visible focus, readable timestamps,
  and zero horizontal overflow.
- Lint, typecheck, tests, production build, secret scan, and provider
  no-deployment checks pass.
