# Authority and live-release alignment — 2026-08-14

## Status

PARTIALLY VERIFIED. The repository authority documents and current release
evidence are aligned for source-verifiable boundaries. Full PRD completion is
not claimed because authenticated hosted parity, real ABI templates, the ABI
Delegation-of-Approval matrix, the canonical centavo-math decision, exact
production tenant/recovery identities and human sign-offs remain unavailable.

## Changes

- Aligned `docs/PRD.md` v1.4 document-control references with the current
  `docs/PROMPTS.md` v1.4 companion and made the PRD/source/release evidence
  hierarchy explicit.
- Corrected `docs/BUILD_OPS_AGENTS.md` so machine-verifiable checks are
  automated while provider, template, owner and human evidence remain explicit.
- Reconciled root `AGENTS.md` to the current `docs/PRD.md` v1.4 authority and
  marked legacy `CLAUDE.md` as historical context instead of an alternate PRD.
- Added current release section M3.280 to the capability matrix with exact
  Vercel/Core evidence, public route checks, audit coverage and open gates.
- Marked historical audit and hosted-brand blockers as superseded where the
  current evidence resolves them, without deleting their historical record.
- Added a fail-closed blocker for authenticated production browser evidence.
- Added `verify:doc-authority` and `test:doc-authority` to prevent future drift.
- Bounded the API Vitest pool to one worker because the full unbounded pool
  reproduced nine false 5-second Nest `app.init()` timeouts under this runner;
  the complete 180-file/790-test API suite passes with the bounded profile.

## Verification

- `pnpm verify:doc-authority` — PASS, 16/16.
- `pnpm test:doc-authority` — PASS, 1/1.
- `pnpm exec vitest run src test --pool=forks --maxWorkers=1 --minWorkers=1`
  from `apps/api` — PASS, 180/180 files and 790/790 tests.
- `pnpm test` — PASS, all four executed Turbo test packages; API 180/180
  files and 790/790 tests, with expected database skips.
- `pnpm typecheck` — PASS; `pnpm build` — PASS, 85 Web routes and Core compile.
- `pnpm lint` — PASS; actionlint, gitleaks, workflow refs, boundary,
  invariants, Turbo cache and 170/170 audit coverage — PASS.
- `git diff --check` — PASS; only expected LF/CRLF normalization warnings.
- Existing source-contract, typecheck, lint, build, full-test, CI-static,
  Vercel, Railway and public browser evidence remains recorded in M3.280 and
  the preceding release snapshot.

## Release boundary

The current source-alignment Vercel deployment is
`dpl_3h5R66ZBfZwjKYxYbByVB3ptk7fx`,
and the active Core deployment is
`190d69df-8efd-41cf-b7a1-de86c9977aff`. A follow-up deployment of this
documentation/verifier evidence refresh was applied in production as
`dpl_9wq71maAQo943uejBTsVptdxUfeS`; live health/readiness and public browser
smoke were rerun after that deployment. The root instruction-chain
reconciliation is included in the final documentation slice for this branch.
