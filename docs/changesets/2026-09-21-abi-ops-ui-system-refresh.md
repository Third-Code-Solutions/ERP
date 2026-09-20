# ABI OPS UI system refresh

## Outcome

Refreshed the shared ABI OPS workspace shell and executive dashboard language
without changing routes, permissions, data contracts, or business behavior.
The visual system now uses a calmer construction-operations canvas, stronger
nav hierarchy, clearer page typography, higher-density data tables, more
consistent form controls, accessible focus treatment, and responsive spacing.
The Today command center received a more legible navy command header, action
hierarchy, summary cards, and panel treatment so the primary ERP work queue is
visually anchored while remaining data-driven.

## Scope

- Shared app shell, sidebar, topbar, page headers, cards, KPI widgets, buttons,
  tables, forms, empty states, responsive breakpoints, and reduced-motion rules.
- Dashboard Today command center styling only; no API, database, auth, or route
  changes.
- Existing route slugs and role-filtered navigation remain unchanged.
- Mobile shell overrides retain the compact sidebar and toolbar at 390px, and
  dashboard panel links keep readable hover contrast on light surfaces.
- Focus rings use a high-contrast gold/white treatment, and sidebar section
  labels meet the intended readable contrast on the navy shell.

## Verification

- `git diff --check` — passed.
- `pnpm --config.engine-strict=false --dir apps/web exec vitest run
  "src/components/dashboard/today-command-center.test.tsx"
  "src/components/dashboard/management-health.test.tsx"` — 5 tests passed.
- `pnpm --config.engine-strict=false --dir apps/web lint` — passed.
- `pnpm --config.engine-strict=false --dir apps/web typecheck` — passed.
- `pnpm --config.engine-strict=false --dir apps/web build` — passed.
- Dashboard contract, App Router boundary, and ABI OPS branding checks — passed.
- Built `/auth/login` smoke screenshot captured with Playwright — passed.

The local verification host uses Node 24 while the repository engine target is
Node 22; hosted CI remains the authoritative runtime match.
