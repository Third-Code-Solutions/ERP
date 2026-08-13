# CAD evidence boundary

Date: 2026-08-13

## Changed

- Removed Python worker Postgres client, `DATABASE_URL`, Supabase service-role
  configuration, and direct `scope_items` delete/insert code.
- Changed worker `/parse` to authenticated, bounded evidence-only processing:
  exact-object signed URL, source SHA-256 verification, deterministic item
  keys, bounded output, and no tenant/project/document fields.
- Moved official worker-result persistence into a tenant-scoped Next.js
  transaction. Inline and Inngest paths share this adapter before draft-BOM
  calculation.
- Added an explicit queued-path `createDraftBom: false` boundary so Inngest's
  existing `cad/parsed` consumer remains the sole queued draft-BOM creator.
- Made worker authentication fail closed by default; local bypass requires
  explicit `PARSER_ALLOW_UNAUTHENTICATED_LOCAL=true`.
- Updated worker Docker/config/docs and fixed DXF fixture serialization for the
  installed ezdxf API; generic block extraction expectation now matches code.

## Verification

- PASS - Python worker tests: 13/13.
- PASS - Web typecheck.
- PASS - root `pnpm test`: shared-types 130/130, database 112 passed with 152
  environment-gated skips, API 53/53, Web 380 passed with 3 skips.
- PASS - root `pnpm build`: API build and Web production build generated 78
  routes.
- PASS - focused upload/Inngest regression tests: 9/9.
- PASS - isolated Next standalone production smoke: build, health, landing,
  CSP, robots, sitemap, and manifest. The smoke completed on Node 24.16.0;
  repository-required Node 22.x was unavailable on this host.
- PASS - actionlint 1.7.12, gitleaks 8.30.1, type-safety (698 source files),
  and App Router boundary checks (111 pages).
- PASS - worker source scan: no database URL, Postgres client, service-role
  key, or direct database-write import/path.
- PASS - targeted `git diff --check` (line-ending warnings only).
- NOT RUN - Docker image build; Docker unavailable on this host.
- NOT RUN - hosted worker deployment or live CAD E2E; no deployment authority
  or authenticated hosted CAD fixture was provided.

## Boundary

This is source-only M2.2 progress, not full M2 completion. Durable processing
job/evidence tables, NestJS queue authority, canary proof, hosted deployment,
and production rollback evidence remain required.
