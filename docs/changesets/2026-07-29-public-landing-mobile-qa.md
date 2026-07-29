# Public landing mobile QA correction

## Scope

- Preserve the accepted Third Code ERP public landing architecture.
- Correct verified responsive, label, touch-target, and local telemetry defects.
- Keep database, Auth, Nest, queues, tenant routing, and providers unchanged.

## Changed

- Mobile hero reduced from six measured visual lines to exactly three.
- Decorative inline hero media hides at 700px and below.
- Decorative capability, operation, workflow, and FAQ ordinals removed.
- Visible mobile links, buttons, and summaries now meet a 44px minimum target.
- Mobile action headline reduced to a compact three-line editorial treatment.
- Vercel Analytics renders only when `VERCEL=1`.
- Hero fetch priority replaces duplicate image preload hints.
- Landing behavior, topology, component specification, and architecture memory
  reconciled with measured browser behavior.

## Verification

- Web lint/typecheck: pass.
- Web tests: 69/69 pass.
- Root lint and typecheck: pass.
- Root tests: 250 pass; 132 disposable-database cases skip as designed.
- Optimized Next.js production build: 77/77 routes generated.
- Browser widths: 1440, 768, 390; no horizontal overflow.
- H1 visual lines: 3, 3, 3.
- Visible mobile interaction targets below 44px: zero.
- Decorative ordinal labels: zero.
- Accordion and FAQ interaction: pass.
- JSON-LD parses: pass.
- Local production browser console: clean after provider-scoped telemetry.
- Live SEO/GEO endpoints and health/readiness: HTTP 200.

## Release state

- Source commit `f40b2472d070085ef114143b65cfd822bda30f0d` is published to
  `main` and `agent-02/third-code-erp-landing`.
- Vercel Git remains disconnected.
- No Vercel deployment or paid build authorized.
- Live deployment remains `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt` at source
  revision `f24e5603a355`.

## Rollback

Revert this changeset's landing component, CSS module, layout telemetry guard,
and documentation. No data or provider rollback is required.
