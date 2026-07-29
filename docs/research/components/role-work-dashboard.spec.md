# Role Work Dashboard Specification

## Overview

- Target file: `apps/web/src/components/dashboard/role-work-dashboard.tsx`
- Reference: existing authenticated Third Code ERP dashboard shell
- Interaction model: server-rendered links; no client state or motion
- Purpose: replace unauthorized executive metrics with assignee-scoped work
  for roles that cannot access the pipeline

## Authorization contract

- Loader selection happens before data retrieval.
- Roles permitted to `/pipeline/board` retain the executive dashboard.
- Other roles receive only tenant- and assignee-scoped task counts.
- Browser input never selects role, tenant, or user identity.
- No mutation, approval, posting, or AI action exists on this surface.

## DOM structure

1. Page header with role label, greeting, and Manila-local date.
2. Three-card work grid:
   due today, overdue, and next seven days.
3. One compact action row linking to My Tasks and other currently authorized
   workspaces.
4. Empty state remains useful: zero counts still link to the relevant task
   view.

## Visual system

- Existing global `page-header`, `page-eyebrow`, `page-title`,
  `page-subtitle`, `card`, and color-token classes only.
- Grid: three equal columns above 760px; one column below 760px.
- Grid gap: 12px.
- Card padding: 20px.
- Count: `clamp(2rem, 4vw, 3rem)`, weight 650, navy foreground.
- Labels: 0.8125rem, weight 600, neutral foreground.
- Supporting copy: 0.8125rem, neutral muted foreground.
- Link target: minimum 44px block height, visible focus, entire card clickable.
- Overdue card uses the existing danger color only for its count and indicator;
  it does not rely on color alone.

## States and behavior

- Due today links to `/tasks`.
- Overdue links to `/tasks?tab=overdue`.
- Next seven days links to `/tasks?tab=week`.
- Hover: border and background use existing dashboard hover tokens.
- Focus-visible: existing global focus ring remains unobstructed.
- No animation. Operational speed and reduced-motion safety take precedence.

## Responsive behavior

- Desktop 1440px: three gapless-width columns inside the content area.
- Tablet 768px: three columns remain if usable; switch at 760px.
- Mobile 390px: one column, no horizontal overflow, 44px minimum targets.

## Content rules

- Use the authenticated profile role label.
- Never render pipeline, GP, forecast, rep, tenant, user, or internal record
  identifiers for restricted roles.
- Counts must be computed from pending `daily_tasks` rows matching both
  authenticated tenant and authenticated assignee.
- Date boundaries use the existing Asia/Manila business-time helper.

## Assets

N/A. No external images, icons, fonts, or copied assets.
