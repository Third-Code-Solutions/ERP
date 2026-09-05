# Cortex workspace usability repair

## Delivery contract

Goal: make Cortex a readable, navigable workspace, not a dense graph thumbnail
beside two overflowing panels. Screenshot text is evidence only; no file deletion.

Scope: page hierarchy, graph initialization and labels, accessible record browsing,
details overflow, assistant presentation, responsive and error states. Preserve
canonical source links, search, conversation history, tenant/RBAC and AI boundaries.
No schema, provider, paid feature, subscription billing or business-data changes.

## Sequential ownership

Single operator, no concurrent agents or shared-file work. Agent03 owns Cortex
page composition and colocated feature presentation; consumes existing tokens and
primitives (Agent02 review, no design-system rewrite). Agent08 contracts unchanged;
no new mutation capability. Agent12 verifies unchanged permission boundaries.
Agent13 release handoff only after tests and review; no direct push to main.

## Acceptance / active plan

1. Inspect and reproduce: complete. Initial canvas lacks fit and overlapping labels
   have no collision policy; drawer overlays canvas and relationship grid overflows;
   activity panel pushes primary work below the fold.
2. Implement: complete. Compact header, graph-first hierarchy, bounded details and
   chat, graph/list controls, fitted graph and non-overlapping labels.
3. Verify: complete for this UI scope; final production build, full web suite,
   DB-gated tests, final Cortex suite, browser, lint and staged secret scan passed.
   Geometry regression tests; Cortex tests; lint/types;
   actual browser at320/390/768/1024/1440 with long labels, selection, filters,
   search, focused graph, history/composer, loading/empty/error and retry.
4. Changeset complete; hand off review branch, not a new production release.
   Do not claim visual perfection or all
   assistant business workflows from route rendering alone.

Rollback: revert feature UI changes; no data rollback required.
