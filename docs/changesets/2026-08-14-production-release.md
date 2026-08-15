# Production release evidence — 2026-08-14

## Scope

The current ERP working tree was released to the verified production targets after the PDF/WO implementation pass. The release was performed from the working tree with the explicit production authorization in the task; no Git commit or push was created by this release operation.

## Supabase production

- Project: `ERP` / `aqqrtkmtcsfkbyyqxowv` / `ap-northeast-2`.
- Project status observed: `ACTIVE_HEALTHY`.
- Applied migrations: `20260814120000_wo_12_inspection_sync_idempotency` and `20260814130000_wo_15_budget_commitment`.
- Post-push migration ledger: 142 local rows, 0 missing remote rows, head `20260814130000`.
- Post-push SQL verification confirmed PostgreSQL 17, `client_submission_id`, the tenant-scoped submission index, and the budget-commitment trigger function.
- Rollback evidence available: latest completed physical backup observed as backup `1364769265`; PITR was reported disabled. A current logical dump was not produced because the required dump client/direct database connection was unavailable in this environment.

## Railway production

- Project: `ERP` / `a21fd382-80b2-4218-8025-11f420a062e3`; environment: `production` / `ce3a09da-9334-4256-a0a6-85d69676cb89`.
- API service `Third Code ERP API`: current-tree upload `eca16ce8-af82-4509-8afa-b31ac600ec17` was `SKIPPED` because Railway detected no new files in the service watch set; the active successful deployment remains `d16b859a-bb28-4401-8d2b-2bef06dfa614`, and health `/ready` passed.
- CAD service `ABI OPS CAD Worker`: current-tree deployment `65fb4ae5-9fca-4307-9c7b-7a18f93cc6ac`, status `SUCCESS`, health `/health` passed with `dwg_support: true` and `evidence_only: true`.
- Managed Redis remained online and was verified through the API readiness response; it was not redeployed.
- No AI worker service is provisioned in this Railway project. The worker README identifies that worker as separately controlled, so no unprovisioned service was created or deployed.

## Vercel production

- Project: `thirdcode-erp` / `prj_5yZX5MTJdXZYWRIeS50jVhmjqzdb`, team `pavi-2e9809a4`.
- Deployment: `dpl_3Sohe4pRG9FofdLLVFLZsXpdnyFw`, status `READY`, target `production`.
- Deployment URL: `https://thirdcode-jgvjtego6-pavi-2e9809a4.vercel.app`.
- Active aliases: `https://thirdcode-erp.vercel.app` and `https://thirdcode-erp-pavi-2e9809a4.vercel.app`.
- Remote build passed installation, Next.js compilation, typecheck, static generation (85/85 pages), and deployment.
- Live `/api/health` and `/api/ready` returned HTTP 200; readiness reported `database: up`.

## Verification

- PASS — WO-11, WO-13, WO-15, WO-17, and WO-18 focused contract tests.
- PASS — web/database boundary tests.
- PASS — BUILD OPS static invariants.
- PASS — `git diff --check` (only line-ending normalization warnings).
- PASS — live endpoint checks for Vercel, Railway API, Railway readiness, and CAD health.
- PASS — Supabase session-pooler re-push reported the remote database up to date; migration list confirmed 142 rows with 0 local/remote mismatches and head `20260814130000`.
- PASS — browser smoke checks for the public home page, mobile home layout, login page, unauthenticated dashboard redirect, and live health/readiness routes on the final Vercel deployment.
- NOT RUN/BLOCKED — full local monorepo test/typecheck/lint/build suite because the local checkout lacks the required root Turbo/TypeScript/Vitest executables and the prior frozen install did not complete in the available environment. The remote Vercel and Railway production builds passed.

## Remaining limitations

- The browser console was clean on the public desktop and mobile home pages. Direct navigation to JSON/API or login pages caused a browser-requested `/favicon.ico` 404 artifact; the explicit `/icon.svg` asset returned 200.
- Supabase security/performance advisors still report pre-existing warnings (request tables without policies, mutable search paths, public vector extension, and duplicate tenant indexes); these were not introduced by the two release migrations.
- PDF-dependent work remains partially verified where the source documents or human approvals were absent: real ABI SD Framework, real ABI templates, ABI delegation/DoA matrix, commercial spreadsheet sign-off, and president-level meeting acceptance.
