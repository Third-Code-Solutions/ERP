# M3.45 — Cortex search accessibility and safe navigation

## Scope

Added keyboard-first Cortex search behavior for the Obsidian-like knowledge
graph. Actionable results can be selected with arrow keys and opened with
Enter; unavailable destinations are skipped. Loading, empty, and error states
are visible and announced, and stale results are cleared when a new term is
entered.

## Changed files

- `apps/web/src/components/cortex/cortex-graph-view.tsx`
- `apps/web/src/lib/cortex/search-navigation.ts`
- `apps/web/src/lib/cortex/search-navigation.test.ts`
- `apps/web/src/app/globals.css`
- `docs/research/components/cortex-search-accessibility.spec.md`
- architecture and operations memory files

## Verification

- Cortex-focused tests: 80/80, including 3/3 navigation tests.
- Web suite: 65 files, 447 tests passed.
- `pnpm lint`, `pnpm typecheck`, `git diff --check`, and `pnpm build` passed;
  Next generated 79/79 routes.
- Unauthenticated browser check redirected `/cortex` to `/auth/login` with a
  clean console. Authenticated Cortex replay reached the route but could not
  complete because the local Next Edge runtime could not resolve the
  configured Supabase host (`ETIMEDOUT`/`ENOTFOUND`); no browser pass is
  claimed for the authenticated graph.

## Release boundary

No Supabase SQL, hosted row, Storage object, migration history, Railway
variable/deployment setting, or Vercel deployment changed. Vercel remains
disconnected/spend-protected. The source is safe to push, but authenticated
browser/provider-runtime evidence remains an open follow-up gate.

## Next action

Re-run the authenticated Cortex desktop/mobile browser proof from a runtime
with working Supabase DNS, then continue the already-blocked supported backup
and owner-approved duplicate Purchase Order repair before replaying hosted
migrations. Do not auto-repair rows or trigger a Vercel build.
