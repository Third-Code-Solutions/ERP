# ABI OPS production deployment

## Latest CAD worker promotion

- Railway service `328c6650-306e-4a3c-80dc-7566e80ba86a` (`ABI OPS CAD
  Worker`) is Online on deployment `9c864abc-2308-42f3-b47d-d4388e25273a`
  at `https://abi-ops-cad-worker-production.up.railway.app`.
- The image builds LibreDWG `0.13.4` from the pinned upstream release; the
  prior apt-based image failed because Debian did not provide
  `libredwg-tools`. The Railway `PORT` command now expands through
  `sh`.
- Worker auth was rotated without a UTF-8 BOM after an initial malformed
  secret caused a 500 on invalid credentials. Auth now fails closed with 401;
  worker tests are 14/14.
- Direct production proof: health 200 with `dwg_support=true`,
  unauthenticated parse 401, authenticated public-DWG parse 200, and
  authenticated public-DXF parse 200. The worker returned bounded
  hash-verified evidence only.
- Vercel production env now wires `DXF_PARSER_URL` and server-only
  `PARSER_SHARED_SECRET`; the BOM surface real-Chrome E2E confirms
  `Worker online`.
- Vercel deployment `dpl_8L2HQin9DH2vxYaxm8sbwzdTudq6` is READY and aliased
  to `https://thirdcode-erp.vercel.app`.

## Scope

Production release of the current local ABI OPS web, API, and additive
Supabase database changes after the user explicitly authorized deployment.

The provider values in the earlier sections are retained as historical
evidence. The final promotion values and gates below supersede them.

## Release contract cleanup

- Added `DXF_PARSER_URL` to `apps/web/.env.example` beside the server-only
  `PARSER_SHARED_SECRET` so local and production wiring cannot be partial.
- Corrected integration documentation: missing Resend or Semaphore
  credentials use explicit development stubs only outside production;
  production fails closed and records no fake delivery.

## Guarded CI/CD promotion

- Added `.github/workflows/deploy-production.yml`, a manual `main`-only,
  GitHub-environment-protected promotion workflow for Supabase, Railway API,
  Railway CAD worker, and Vercel.
- Added ADR-020. The workflow fails before provider mutation when any required
  provider or seeded-E2E secret is missing, keeps cutover flags disabled,
  verifies web/API/worker health, and then runs authenticated real-Chromium
  branding, route, role-matrix, and CAD-worker production journeys.
- PASS: actionlint 1.7.12, workflow action-reference verification, ABI OPS
  brand contract, and diff check.

## Final promotion recheck

- Vercel project `pavi-2e9809a4/thirdcode-erp`: final production deployment
  `dpl_AUme5sfo7WfZqDKgD8319PqTVWkK`, `Ready`, aliased to
  `https://thirdcode-erp.vercel.app`.
- Railway service `c45b3d01-036a-4663-a524-0713d782fce3`: final production
  deployment `d0873402-3516-4094-ae7a-7dac11b9eef4`, `SUCCESS`, with
  `/ready` reporting database and Redis healthy.
- Supabase project `aqqrtkmtcsfkbyyqxowv`: migration
  `20260813220000_change_request_change_log.sql` is applied; the linked
  database is current at 140/140 migrations.
- The proposal change-request slice now has tenant-scoped append-only change
  logs, idempotent create/resolve transactions, and audit coverage. Audit
  verification is `170/170` tenant-scoped tables. The protected hosted
  mutation proof also passed in the seeded `buildops-e2e` demo tenant.
- The previously linked `/crm/opportunities` collection URL now redirects to
  the pipeline board instead of returning a production 404. Proposal action
  transaction failures emit structured `trace_id` logs.

Supabase Edge Functions cnps-survey-sender, permit-staleness-checker, and
sla-checker are ACTIVE at version 2 with JWT verification enabled.
Unauthenticated probes returned 401. No pg_cron jobs exist in the target and
optional Resend/CNPS configuration is absent, so background scheduling and
outbound email remain unverified.

## Provider results

- Vercel project `pavi-2e9809a4/thirdcode-erp`:
  `dpl_DUT3PBLM8gUhkmrLSJfVSPKdeNUy`, `READY`, explicitly promoted to
  `https://thirdcode-erp.vercel.app`. The project runtime is pinned to Node
  `22.x`.
- Railway API service:
  deployment `2c19f8b8-a5cb-462f-9f92-d35e16647056`, `Online`, healthcheck
  `/ready` passed.
- Supabase project `aqqrtkmtcsfkbyyqxowv`:
  migration ledger matches local through `20260813210000`; dry-run reports no
  pending migrations.

## Database promotion

- Added the deterministic duplicate Purchase Order number reconciliation
  migration. The oldest `PO-0002` row was preserved; later duplicates were
  renamed with `-R02` through `-R12`. No rows were deleted and IDs/FKs were
  preserved.
- Added audit triggers for all tenant-scoped tables missing coverage. The
  hosted verification result is `169/169` tables with audit coverage.
- WO-02, WO-04, WO-05, and WO-06 database gates plus WO-06 behavior and the
  Build Ops invariant check passed against the linked database.

## Verification

- PASS — Vercel build: typecheck and 78 route generation completed.
- PASS — Vercel `/api/health`: HTTP 200, `abi-ops-web`.
- PASS — Vercel `/api/ready`: HTTP 200, `database=up`.
- PASS — Railway `/health`: HTTP 200, `abi-ops-api`.
- PASS — Railway `/ready`: HTTP 200, `database=ok`, `redis=ok`.
- PASS — `pnpm verify:production-surface -- --url https://thirdcode-erp.vercel.app`.
- PASS — real Chrome `frontend-release-local.spec.ts`: 1 test passed.
- PASS — hosted E2E configuration now fails closed without a dedicated
  `E2E_USER_EMAIL`/`E2E_USER_PASSWORD` and Supabase public configuration; no
  implicit test identity remains.
- PASS — CI workflow source now runs hosted E2E on every pull request and
  fails closed when the URL or credentials are absent; no GitHub secrets or
  variables were fabricated.
- PASS — authenticated hosted route smoke: all major protected routes, with
  no console or blocking page errors.
- PASS — authenticated ABI OPS branding smoke.
- PASS — authenticated 11-role access matrix and protected-boundary checks.
- PASS — authenticated Cortex focused graph, conversation history, deep link,
  and responsive overflow journey.
- PASS — authenticated viewer dashboard safety and observe-mode journey.
- PASS — public manifest and landing contain `ABI OPS` and no legacy
  `Third Code Solutions`, `Third Code ERP`, or `ABI OS` product/legal copy.
- PASS — protected API route returns 401 without credentials.
- NOT RUN — CI workflow execution with repository-hosted `E2E_USER_EMAIL` and
  `E2E_USER_PASSWORD` secrets; the local linked Supabase role harness was used
  for hosted authenticated proof and no secrets were printed.

- PASS — current-source self-hosted CI lane: 139-migration replay, database
  reproducibility/security invariants, 264 database tests, WO-04/05/06 gates,
  and standalone web/API smoke all completed with exit code 0. Redis emitted
  its non-fatal WSL memory-overcommit warning; the lane itself passed.

## Final verification evidence

- PASS - hosted demo-tenant US-009 mutation: create, exact idempotent replay,
  resolve, persisted reload, no duplicate, no browser console errors, and no
  404 resources. Supabase confirms one row in the demo tenant and seeded
  opportunity, `created/resolved` domain logs, and a succeeded ledger.
- PASS - final Vercel deployment log scan after the critical browser suites:
  zero HTTP 5xx and zero HTTP 404 responses in the sampled window.

- PASS — authenticated production regression: smoke, branding, and the
  11-role access matrix, 3/3 real-Chrome tests.
- PASS — current-source API unit suite: 53/53 tests.
- PASS — current-source web unit suite: 385/389 tests, with 4 explicit
  environment-gated skips.
- PASS — current-source 140-migration replay, database reproducibility and
  security invariants, audit coverage, and standalone web/API smoke.
- PASS — Supabase linked dry-run reports `upToDate=true` and no pending
  migrations.
- PASS - Supabase linked `db push --yes --skip-vault` reports
  `upToDate=true` with no migrations, seeds, or roles to apply.
- PASS - disposable PostgreSQL workflow integration proves create, exact
  replay, conflicting-key denial, resolve replay, and cross-tenant denial.
- PASS — hosted demo-tenant mutation proof for change-request create/resolve;
  no customer tenant was used. Direct Supabase evidence confirms one row,
  `created/resolved` logs, and a succeeded idempotency ledger.

Edge Function scheduled execution and provider email delivery were not run;
the functions are deployed, but the target has no pg_cron jobs and no optional
outbound-email secrets.

## Release state

PARTIALLY VERIFIED. The deployed providers, linked database, public surface,
authenticated hosted journeys, and current-source local CI lane passed the
available checks. The working tree remains dirty and the exact deployed source
is not yet committed or pushed; repository-hosted CI secrets, PRD
human/governance gates, M1 canary/provider drill, and physical/device
validation remain open.
