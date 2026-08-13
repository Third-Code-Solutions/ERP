# Project Command Center Specification

## Overview

- Target: `apps/web/src/components/projects/project-command-center.tsx`
- Source route: `/projects/[id]` overview
- Interaction model: server-rendered read-only context with link navigation;
  no browser mutation
- Before evidence: current project overview renders a fixed `1fr 300px`
  layout. At 390px the page measured `scrollWidth=1228` for `innerWidth=390`.

## User outcome

Give project teams one calm answer to: what work is open, what evidence exists,
what decisions need attention, what deliveries are moving, and where Cortex can
explain the source context.

## Data contract

Every count query must include both `tenant_id` and `project_id` predicates.
The read path may use existing tables only:

- `daily_tasks`: pending and overdue work
- `documents`: project evidence count
- `variation_orders`: open commercial/design decisions
- `punchlist_items`: open site defects
- `delivery_schedules` joined to tenant/project-owned `purchase_orders`
- `progress_updates`: latest `overall_pct` and week ending

No schema or migration change. No Server Action. Cortex link remains a separate
authorization boundary at `/cortex?refTable=projects&refId=<id>`.

## DOM structure

```text
section.projectCommandCenter
  header (eyebrow, title, source sentence, Ask Cortex / audit links)
  div.signalGrid
    link.signalCard (work queue)
    link.signalCard (evidence)
    link.signalCard (decisions)
    link.signalCard (delivery)
  div.detailGrid
    article.progressPanel (latest progress bar + Progress link)
    article.nextMovePanel (overdue/open decision guidance + scoped links)
```

## Visual contract

- Surface: ivory background, white panels, navy headings, copper accent.
- Container: `width: 100%`, `min-width: 0`; card grid uses
  `repeat(4, minmax(0, 1fr))` at desktop and stacks at `<=900px`.
- Cards: visible border, 12px radius, 16–20px padding, 44px minimum action
  target, clear hover background/translate transition.
- Progress meter: 8px track, copper fill, bounded 0–100 value.
- No ordinal labels, fake metrics, or autonomous-AI claims.

## Responsive behavior

- 1440px: four signal cards; two detail panels; project navigation stays in a
  bounded horizontal scroller.
- 768px: two signal columns; detail panels remain stacked or two-up when space
  permits; header actions wrap.
- 390px: one signal column; detail panels stack; no document horizontal
  overflow; project tab strip scrolls inside its own bounded frame.

## Acceptance criteria

1. Viewer/admin authenticated project page renders command-center heading and
   all four scoped signals without cross-tenant data.
2. `scrollWidth === innerWidth` at 390px and 1440px for the changed route.
3. All links preserve project id and use existing authorized destinations.
4. Empty progress/tasks/decisions/delivery states remain understandable.
5. Focused component/query tests, full Web tests, lint, typecheck, production
   build, and browser console checks pass.
