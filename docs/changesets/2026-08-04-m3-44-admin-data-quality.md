# M3.44 — admin data-quality review

## Scope

Added an original, tenant-scoped, admin-only read surface for reviewing the
duplicate Purchase Order identifiers that currently stop the supported
Supabase migration suffix.

## Source checkpoint

`63bbf22` (`feat(web): add admin data quality review`).

## Changed files

- `apps/web/src/app/(dashboard)/admin/page.tsx`
- `apps/web/src/app/(dashboard)/admin/data-quality/page.tsx`
- `apps/web/src/app/(dashboard)/admin/data-quality/data-quality.module.css`
- `apps/web/src/lib/admin/data-quality-queries.ts`
- `apps/web/src/lib/admin/data-quality-queries.test.ts`
- `docs/research/components/admin-data-quality.spec.md`
- architecture and operations memory files

## Verification

- Focused report tests: 2/2.
- Web suite: 64 files, 444 tests passed.
- Full workspace: API 57 files/294 tests, shared-types 15 files/162 tests,
  database 41 files/166 executed with 140 environment-gated skips.
- `pnpm lint`, `pnpm typecheck`, `git diff --check`, and `pnpm build` passed;
  Next generated 79/79 routes.
- Authenticated browser proof passed at 1440px and 390px: one duplicate group,
  12 affected records, no repair controls, no horizontal overflow, and no new
  console errors.

## Release boundary

No Supabase SQL, hosted row, Storage object, migration history, Railway
variable/deployment setting, or Vercel deployment changed in this milestone.
The Supabase target remains at the verified 55-migration prefix with its
protected branch failing safely on the duplicate `PO-0002` preflight. Vercel
remains disconnected/spend-protected.

## Release verification

Source `63bbf22` and evidence `eab1719` were pushed to `main` and
`agent-02/third-code-erp-landing` as `kurtgav`. GitHub's Railway check is
successful; the linked Railway service is online with `/ready` and `/health`
returning 200. Supabase remains unchanged at 55/87 migrations and Vercel has
no deployment for this SHA.

## Next action

Obtain a supported recoverable database backup and an owner-approved canonical
duplicate repair before replaying the ordered SQL suffix. Do not auto-repair
business records or hand-edit migration history.
