# Pipeline list-view UX

## Outcome

- The existing `/pipeline/list` bookmark continues to resolve to the unified
  pipeline workspace with `view=list` state.
- List mode now renders a semantic, horizontally scrollable table instead of
  repeating draggable Kanban cards.
- The table exposes opportunity, stage/KYC attention, owner/SLA, TCV,
  probability, gross-profit margin, expected close, and accessible actions.
- Stage transitions remain capability-gated and use the same confirmation and
  reason dialogs as the board.
- Mobile users can scroll the dense data table without changing the board
  layout or losing URL-persisted filters.

## Verification

- `pnpm --config.engine-strict=false --filter @third-code-erp/web exec vitest run src/app/(dashboard)/pipeline/redirects.test.ts src/app/(dashboard)/pipeline/conversion/page.test.tsx src/components/pipeline/pipeline-list-table.test.tsx` — PASSED (18 tests).
- `pnpm --config.engine-strict=false --filter @third-code-erp/web typecheck` — PASSED.
