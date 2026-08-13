# Production deployment verification

## Outcome

PARTIALLY VERIFIED. The verified web/build slice is deployed to the exact
Vercel production project. Database writes, destructive demo cleanup, and
full authenticated route smoke remain held by the documented gates.

## Superseded deployment identity

- Project: `pavi-2e9809a4/thirdcode-erp`
- Project ID: `prj_5yZX5MTJdXZYWRIeS50jVhmjqzdb`
- Deployment: `dpl_GsBc79JG3npEtPqGUXozGVCweF2y`
- Deployment URL: `https://thirdcode-8rnwkqydt-pavi-2e9809a4.vercel.app`
- Production alias: `https://thirdcode-erp.vercel.app`
- Source revision exposed by health endpoints: `8268bbf93fae`

## Verification

- PASS — Vercel provider build: Next compiled and generated 77/77 routes.
- PASS — `GET /api/health`: 200, service alive, revision present.
- PASS — `GET /api/ready`: 200, database `up`, revision present.
- PASS — `GET /`, `/robots.txt`, `/manifest.webmanifest`, `/auth/login`: 200.
- PASS — unauthenticated `/dashboard` ends at `/auth/login` with 200.
- PASS — live public browser E2E: 1/1 across desktop, tablet, and mobile;
  metadata, schema, FAQ interaction, responsive overflow, and console/page
  errors checked.
- PASS — live unauthenticated auth-boundary E2E: 4/4.
- PASS — Vercel error-level logs for the deployment in the last hour: empty.
- NOT RUN — authenticated production route smoke; repository default account
  credentials are invalid and no authorized test credentials were available.
- NOT RUN — Supabase migration push; target/repository ledger is already
  55/55 and release recovery/schema/data gates remain open.

## Final middleware hardening verification

The latest deployment supersedes the earlier deployment evidence above:

- PASS - `dpl_4ZVACBsDAY2BUUJzGTUCPmHEZcb2` is READY at
  `https://thirdcode-6wmir8yhg-pavi-2e9809a4.vercel.app` and aliased to
  `https://thirdcode-erp.vercel.app`.
- PASS - all 22 protected roots return `307 /auth/login` without following the
  redirect; every redirect includes the baseline security headers.
- PASS - live browser E2E is 3/3: login render, 22-surface auth boundary, and
  public frontend. Public checks cover desktop, tablet, and mobile metadata,
  schema, FAQ interaction, responsive overflow, and console/page errors.
- PASS - `/api/health` and `/api/ready` return 200 with database `up` and the
  baseline `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`
  headers. `/api/notifications` returns 401 without a session.
- PASS - Vercel error-level logs for the final deployment in the last hour are
  empty.
- PASS - local web suite is 48 files and 286 tests; production build generated
  77/77 routes.
- PASS - repository lint, typecheck, aggregate tests, actionlint, and BUILD OPS
  invariant tests.
- PASS - hosted read-only database reproducibility: 55 migrations, 30
  protected tables, RLS/policies/indexes/privileges/triggers/constraints.
- PASS - hosted read-only BUILD OPS invariants and demo audit: no ABI-like
  tenant and no PO-0002 join fanout.
- NOT RUN - authenticated production route smoke; no authorized production test
  credentials were available.
- NOT RUN - disposable database replay; Docker and Supabase CLI are unavailable.

## Latest code-only release

- PASS - deployment `dpl_4ZVACBsDAY2BUUJzGTUCPmHEZcb2` is READY at
  `https://thirdcode-6wmir8yhg-pavi-2e9809a4.vercel.app` and aliases the
  production domain.
- PASS - Vercel build configuration resolved Node `22.x`; serverless lambdas
  run `nodejs22.x`. The middleware remains provider-managed edge runtime.
- PASS - health/readiness revision is `dpl_4ZVACBsD`, proving the dirty-tree
  release by deployment identity rather than stale Git metadata.
- PASS - production Chromium E2E: 3/3 (public frontend, login render, and
  protected-route auth boundary).
- PASS - Vercel runtime-error aggregation: no runtime errors in the selected
  two-hour window.
- PARTIAL - authenticated production E2E now has a verified viewer-role
  read-only canary; full admin/finance role coverage and mutating business-flow
  E2E remain unrun because no disposable data-bearing environment is available.

## Authenticated viewer production E2E

- PASS - `dashboard-role-local.spec.ts` ran 1/1 against the public production
  alias using the existing viewer-role magic-link test path.
- PASS - the browser exercised desktop, tablet, and mobile dashboard layouts,
  tenant-scoped document search, Cortex draft handoff, viewer denial of
  executive/finance data, command-palette overflow, session cleanup, and
  console/page-error assertions.
- PASS - the same authenticated context rendered five viewer-allowed surfaces
  (`/dashboard`, `/cortex`, `/tasks`, `/documents`, `/settings`) and probed all
  22 protected route roots without a 5xx or unauthenticated login redirect.
- PASS - the harness now derives the Supabase auth-cookie hostname and HTTPS
  flag from the configured base URL, so the same proof works against localhost
  and the production alias.
- NOT RUN - mutating production business flows; no production data was created,
  changed, deleted, or migrated by this test.
- NOT RUN - Supabase DDL/data push; provider-linked source remains at 55/124
  migrations with WO-02 audit coverage unresolved.

## Latest authenticated role-matrix E2E

- PASS - `role-access-production.spec.ts` ran 1/1 against
  `https://thirdcode-erp.vercel.app` with one sequential Chromium worker.
- PASS - all 11 seeded roles (`admin`, `commercial`, `cx`, `design`, `finance`,
  `owner`, `procurement`, `safety`, `sales`, `sd_pm_pe`, and `viewer`) received
  a verified magic-link session and a 200 dashboard response without an auth
  redirect.
- PASS - each role's configured navigation links were present, and the
  authenticated `/admin`, `/bom`, and `/finance` boundary probes returned no
  5xx/429 or login redirect; role-forbidden paths redirected to the dashboard
  according to the central navigation policy.
- PASS - the run completed without captured browser console errors,
  uncaught page errors, or non-aborted request failures.
- NOT RUN - mutating production business flows; the matrix is read-only and
  created, changed, or deleted no business data.
- NOT RUN - Supabase DDL/data push; provider-linked source remains at 55/124
  migrations and the WO-02/recovery/source-identity gates remain unresolved.

## Latest production deployment after rate-limit regression fix

- PASS - deployment `dpl_F1Xo2hfhpMrfvrHG1hiPRKeim9mN` is READY and aliased to
  `https://thirdcode-erp.vercel.app`.
- PASS - Vercel build generated 77/77 routes. Build output confirms
  serverless lambdas on `nodejs22.x`; middleware is provider-managed
  `nodejs24.x` edge runtime.
- PASS - production Chromium E2E on the public alias: 3/3 (login render,
  22-surface unauthenticated auth boundary, and public frontend responsive/
  metadata/accessibility checks).
- PASS - the preceding 429 regression was reproduced, fixed, and covered by
  request-rate-limit unit tests: page GET/HEAD navigation does not consume the
  shared bucket; API, auth, and mutating requests remain limited.
- PASS - alias HTTP smoke: `/`, `/auth/login`, `/api/health`, `/api/ready`,
  `/robots.txt`, `/sitemap.xml`, and `/manifest.webmanifest` return 200;
  unauthenticated `/api/notifications` returns 401; baseline security headers
  are present.
- PASS - Vercel runtime-error aggregation after browser and HTTP smoke: no
  runtime errors in the selected 30-minute window; deployment error logs empty.
- PARTIAL - authenticated production E2E includes the verified viewer-role
  read-only canary; admin/finance roles and mutating business flows remain
  unrun without a disposable data-bearing environment.
- NOT RUN - Supabase DDL/data push; target remains `MIGRATIONS_FAILED`, with
  WO-02 audit/calendar coverage and recovery/staging gates unresolved.

## Provider source identity recheck

- BLOCKED - the local release workspace `HEAD` is
  `8268bbf93fae23c4584c4d0485ded784e07e08b4`, while provider-linked
  `origin/main` is `7cd3306681e68528897de792dbef46b3aefee3a3` (603 commits
  ahead).
- BLOCKED - local migrations contain 55 files; provider-linked `origin/main`
  contains 124. Supabase branch-action logs show the provider applying a
  migration absent from the local workspace and failing on duplicate PO
  numbers.
- NOT RUN - authenticated business-flow E2E or database release against the
  provider-linked source. The public web E2E validates only the deployed dirty
  workspace slice.
