# BUILD OPS authority source and local browser gate

## Outcome

PARTIALLY VERIFIED. Repository now contains Markdown execution copies of all
three attached BUILD OPS authority PDFs. CI now runs deterministic public
browser E2E against a built production server on every build path.

## Changes

- Added `docs/PRD.md` from `output/pdf/BUILD OPS PRD.pdf` v1.3.
- Added `docs/PROMPTS.md` from `output/pdf/BUILD OPS Prompt Pack.pdf` v1.3.
- Added `docs/BUILD_OPS_AGENTS.md` from `output/pdf/AGENTS.pdf`.
- Added `.github/workflows/ci.yml` `e2e-local` job: downloads the built Next
  artifact, starts `next start`, installs pinned Playwright Chromium, and runs
  `frontend-release-local.spec.ts` with desktop/tablet/mobile assertions plus
  the unauthenticated auth-boundary suite (invalid-credential mutation excluded).

## Verification

- PASS — extracted Markdown contains WO-01 through WO-18, additive-migration,
  no-`scope_items`, BIGINT-centavos, tenant, and audit constraints.
- PASS — `pnpm ci:actionlint`.
- PASS — `pnpm test` (482 passed; 137 database tests skipped because command
  had no `DATABASE_URL`).
- PASS — local built production server public browser E2E, 1/1 across
  desktop/tablet/mobile; auth-boundary E2E, 4/4.
- PASS — live Vercel public browser E2E, 1/1; live auth redirect E2E, 4/4.
- PASS — `pnpm ci:actionlint` after adding the local E2E job.
- NOT RUN — GitHub-hosted `e2e-local` job; requires CI execution.
