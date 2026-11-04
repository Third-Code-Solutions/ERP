# 00 — Baseline audit

| | |
|---|---|
| Date | 2026-11-04 |
| Mode | `init` baseline (erp-baseline-auditor) |
| Tree | `chore/erp-baseline` @ `ebd5135a` = `main` @ `90c48866` + swarm docs (no product-code delta) |
| Machine | Windows 11, Node 24.16.0 (repo pins 22.x), corepack pnpm 10.33.0, Python 3.12 |
| Limits | No `.env*` in the worktree (none read or created). No Supabase CLI. Docker daemon off. No database or production access used |

The architecture map is in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## Gate status

| Gate | Result | Numbers |
|---|---|---|
| Install | PASS | `install --frozen-lockfile` up to date in 1.6 s. 5 dependency build scripts skipped by pnpm 10 (BL-26) |
| Build | PASS | api `nest build` 26 s. Web `next build` 127 s, 115 static entries, 103 kB shared JS. CI `Build` on `main` run 38398595447: success |
| Typecheck | PASS | 0 errors across 13 tsconfigs |
| Lint | PASS | 0 errors, 0 warnings, 1,388 files (`--max-warnings=0`) |
| Unit tests | PASS | Vitest: 1,689 files, 5,309 tests, 5,105 passed, 0 failed, 204 skipped (DB-backed suites without `DATABASE_URL`, which CI runs with a no-skip assertion). node:test contracts: 260 tests, 259 passed, 1 failed (Windows CRLF artifact, BL-19) |
| Coverage | NOT MEASURED | No coverage provider installed (BL-14) |
| Integration / migrations from zero | PASS in CI only | `Database Reproducibility (Postgres 17)` on `main` run 38398595447: success. Not runnable locally |
| Dependency audit | **FAIL** | prod: 11 advisories (1 critical, 5 high, 4 moderate, 1 low). Full graph: 25 (1 critical, 6 high, 13 moderate, 5 low). The CI `Security Scan` gate now fails on every PR (BL-01..03) |

**Findings: P0 0 · P1 4 · P2 12 · P3 10** (26 total, §7).

---

## 1. Gate runs

All commands ran from `D:\thirdcode\ERP-baseline`. Local `turbo` is broken
(pnpm version mismatch), so each package was run directly, as CI's turbo would.

### Install
`corepack pnpm --config.engine-strict=false install --frozen-lockfile`
- rc 0, "Done in 1.6s using pnpm v10.33.0". Lockfile and `node_modules` are in sync.
- Warning: "Ignored build scripts: esbuild@0.28.2, msgpackr-extract@3.0.4,
  protobufjs@7.6.5, tesseract.js@7.0.0, unrs-resolver@1.12.2".

### Build
The web build used CI's non-secret placeholder values, passed as process env
only (`.github/workflows/ci.yml` job `build`).

| Command | rc | Time |
|---|---|---|
| `apps/api`: `node node_modules/@nestjs/cli/bin/nest.js build` | 0 | 26 s (webpack compiled successfully) |
| `apps/web`: `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role-key DATABASE_URL=postgresql://postgres:placeholder@… node node_modules/next/dist/bin/next build` | 0 | 127 s ("Compiled successfully in 48s", 115/115 static pages, middleware 106 kB) |

CI cross-check: `gh run view 38398595447` (CI on `main` @ `90c48866`).
- Success: Actionlint, Security Scan, BUILD OPS Invariants, Type Check, Lint,
  Unit Tests, Claim Document Browser Interaction, Database Reproducibility, Build.
- Skipped: E2E (push event).
- The previous `main` run (38310322245, `a07c1dfd`) failed only Security Scan.

### Typecheck
`node <root>/node_modules/typescript/bin/tsc --noEmit -p <tsconfig>` exactly
mirrors each package's `typecheck` script. Result: 0 errors in every config.

| Package / config | Errors | Time |
|---|---|---|
| packages/shared-types | 0 | 6 s |
| packages/auth | 0 | 3 s |
| packages/database | 0 | 15 s |
| packages/operations | 0 | 12 s |
| apps/api | 0 | 27 s |
| apps/web `tsconfig.json` | 0 | 50 s |
| apps/web `e2e/tsconfig.json`, `e2e/cortex-index`, `e2e/finance-{ledger,receivables,payables,cash,reconciliation}` (7 configs) | 0 | 2–17 s |

`packages/ai` has no tsconfig and no typecheck script. It is checked only
through importers (BL-18).

### Lint
`corepack pnpm --config.engine-strict=false lint` (= `eslint --max-warnings=0`
over api, web and 5 package `src` trees).
- rc 0. JSON run: 1,388 files, **0 errors, 0 warnings**.
- Calling `node node_modules/eslint/bin/eslint.js` directly fails with
  "couldn't find the plugin eslint-plugin-react-hooks". pnpm's `NODE_PATH`
  (`node_modules/.pnpm/node_modules`) is required because `publicHoistPattern` is `[]` (BL-26).

### Unit tests
Ran `node node_modules/vitest/vitest.mjs run [args] --reporter=json` in each package.

| Package | Files | Tests | Passed | Failed | Skipped | Time |
|---|---|---|---|---|---|---|
| apps/web | 689 | 2,658 | 2,652 | 0 | 6 | 3 m 34 s |
| apps/api (`run src test`) | 537 | 1,565 | 1,565 | 0 | 0 | 11 m 3 s |
| packages/database | 229 | 516 | 318 | 0 | 198 | 13 s |
| packages/shared-types | 227 | 561 | 561 | 0 | 0 | 6 s |
| packages/operations | 7 | 9 | 9 | 0 | 0 | 4 s |
| **Total** | **1,689** | **5,309** | **5,105** | **0** | **204** | |

Skips are DB-backed suites gated on `DATABASE_URL`, which was unset:
- web: 3 `*.integration.test.ts` files, 6 tests;
- database: 28 files, 198 tests.

CI runs all of them in `database-reproducibility` and asserts zero skips
(`scripts/assert-vitest-no-skips.mjs`). That job is green on `main`.
API `integration/` specs (`vitest run integration`) run only in that CI job.

CI's node:test contract list (30 files from the `test` job, plus `verify-build-ops-invariants.test.mjs`):
- `node --test scripts/…test.mjs`: 260 tests, 259 pass, 1 fail.
- The failure is `scripts/verify-build-ops-invariants.test.mjs:210` ("CI runs
  document, role and smoke readiness regressions…"). Its regex expects `\n`,
  but `core.autocrlf=true` checks `.github/workflows/ci.yml` out with CRLF.
  This is a local-checkout artifact, not a code defect (BL-19).
- `node scripts/verify-managed-supabase-parity-plan.mjs`: rc 0.

Python: `apps/workers/dxf-parser/tests` and `apps/workers/ai/tests` were not
run. `ezdxf`/`pytest` are not installed here, and **no CI workflow runs them** (BL-15).

E2E (Playwright) was not run locally: it needs browsers and credentials. CI
`Claim Document Browser Interaction` (15 credential-free specs) is green on `main`.

---

## 2. Dependency audit

Commands: `corepack pnpm --config.engine-strict=false audit --prod --json` and `… audit --json`.
- prod: 601 deps, **1 critical, 5 high, 4 moderate, 1 low**;
- full: 1,129 deps, **1 critical, 6 high, 13 moderate, 5 low**.

All advisories were published 2026-10-01 → 10-28, after the last green `main`
run (2026-10-13). CI gates `pnpm audit --prod --audit-level low` and `pnpm audit
--audit-level low` now fail. Confirmed: PR #128 run 41761854446 Security Scan = failure.

| Sev | Package (resolved) | Advisory | Path | Fixed in |
|---|---|---|---|---|
| critical | next 15.5.27 | GHSA-2464-fhr4-w9xw: unauthenticated RCE in Image Optimization API when SVG files are used | apps/web | ≥15.5.28 |
| high | next 15.5.27 | GHSA-p3m5-59mp-jv5r: DoS in App Router using Server Actions | apps/web | ≥15.5.28 |
| high | zod 3.25.76 | GHSA-mrhx-c7xc-m3w5: memory exhaustion on oversized constrained collections | api, web, shared-types, operations | ≥4.6.6 (major) |
| high | body-parser <2.4.0 | GHSA-27r3-jxmh-p828: DoS via trailing bytes after compressed body | api > express | ≥2.4.0 |
| high | multer <2.5.0 | GHSA-q7qp-rjg7-q26m: DoS via pending async fileFilter | api > @nestjs/platform-express | ≥2.5.0 |
| high | systeminformation <5.33.16 | GHSA-3f7j-7jwc-fxfj: Windows command injection in `services()` | web > inngest > OTel host-metrics | ≥5.33.16 |
| moderate/low (prod) | systeminformation ×2, qs ≤6.16.0, minimatch <11.0.1 | — | — | — |
| high (dev) | vite 7.3.5 | GHSA-587h-7wmj-h5pm (+4 moderate/low vite) | apps/web dev | ≥7.3.7 |
| moderate/low (dev) | @vitest/mocker ×2, fast-uri ×4, glob, deepmerge, minimatch, qs | — | — | — |

Open PR #125, "fix(security): patch next RCE + audit advisories", is MERGEABLE
with every CI check green, including Security Scan.

**Outdated majors** (`pnpm outdated -r`): 47 outdated, **23 a major behind**:
- next 15→16 (and eslint-config-next);
- @nestjs/* 11→12 (config 4→12);
- zod 3→4;
- typescript 5.9→7.0;
- vitest 4→5, vite 7→8, eslint 9→10;
- ai 6→7, openai 6→7;
- pdfjs-dist 5→6, postgres 3→4, bullmq 5→6, ioredis 5→6;
- @types/node 22→26.

`packages/ai` resolves openai 4.104.0 while the web app uses 6.37.0.

---

## 3. Code quality census

Scope: non-test `.ts/.tsx` in `apps/web/src`, `apps/api/src`,
`packages/{ai,auth,database,operations,shared-types}/src`. That is 1,387 files
and 242,950 lines, plus 777 `*.test|spec.*` files. Counts come from ripgrep.

| Signal | Count | Notes |
|---|---|---|
| explicit `any` (`: any`, `as any`, `<any>`, `any[]`) | **0** | 4 raw regex hits, all in comments or identifiers |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | 0 | |
| `eslint-disable` | 7 | 5 `react-hooks/exhaustive-deps`, 2 `@next/next/no-img-element` (BL-22) |
| empty `catch {}` | 0 | |
| catch blocks containing only comments | 15 | intentional swallows (BL-20) |
| `.catch(() => null \| undefined)` | 217 | 156 are `response.json().catch(() => null)` in `erp-core-client.ts` (benign) |
| `console.log` | 6 | all in `packages/database/src/seed.ts` (CLI seed; acceptable) |
| `console.warn/error/info/debug` | 92 | tagged structured logs |
| TODO / FIXME / HACK / XXX | 0 | |
| fire-and-forget `void fn(` | 60 | 4 with `.catch`. No `no-floating-promises` rule (BL-21) |
| files > 500 lines | **89** | 51 web, 29 api, 9 packages. 20 over 1,000. 3 over 2,000 (BL-13) |

Largest:
- `apps/web/src/lib/erp-core-client.ts` 10,513;
- `apps/api/src/procurement/delivery-workflow.service.ts` 2,202;
- `apps/web/src/app/(dashboard)/projects/[id]/bom/actions.ts` 2,113;
- `apps/web/src/app/(dashboard)/procurement/actions.ts` 1,782;
- `apps/api/src/config/environment.ts` 1,581.

**Obvious duplication.**
- `erp-core-client.ts` repeats the same
  `getCoreApiAccess() → fetch → json().catch → status→message` block 160 times
  (265 exports, 209 importers) (BL-12).
- 96 env cutover flags keep a legacy direct-DB path and a Core-API path alive
  for the same feature (BL-10).

---

## 4. Data layer

Method:
- A static replay of all 177 `supabase/migrations/*.sql` files. It handles
  create/alter/drop table and index, inline and table FKs, PK/unique constraints.
- An FK counts as covered when an index (or PK/unique) leads with its columns.
  For a composite `(tenant_id, x)` FK, an index leading with `x` also counts.
- This is inferred. It should be confirmed with a `pg_catalog` query in CI's
  reset database. Spot checks of 5 flagged FKs against the SQL all confirmed a
  missing index.

| Check | Result |
|---|---|
| Tables (after replay) | 214, of which 211 have `tenant_id` |
| FK column sets / without covering index | 734 / **342** (192 are actor columns such as `created_by`/`updated_by`/`*_by` → `users`; 150 others) (BL-05) |
| Tenant tables with no `tenant_id`-leading index | **11** (BL-06) |
| Money / quantity types | Money is `bigint` minor units (`*_cents`, 13 `*_centavos` columns). `numeric(18,4)` ×8, `numeric(10,2)` ×4. `numeric(38,12)` only in PL/pgSQL DUPA variables. **No float money anywhere.** The only `real` columns are `cortex_edges.weight/confidence` (`20260613192311_cortex_substrate_schema.sql:78-79`). No `integer` money columns |
| Unbounded list queries | Heuristic over Drizzle select chains, excluding `.limit`, aggregates, PK lookups, `inArray`. Web: 681 chains, 72 without `.limit`. api+packages: 294 chains, 15 without. `.offset(` appears 3× in web, 25× in api (BL-07) |
| N+1 patterns | 17 `for…of` loops with an awaited query inside (heuristic). Verified worst case: daily-task generation (BL-08). Others listed in BL-09 |
| Tenant predicate on web reads | 11 select chains with no tenant token. Most use a prebuilt tenant-scoped `where` variable (false positives). 2 confirmed derived-id lookups (BL-23) |
| Direct web writes | 20 files, 37 `db/tx.insert/update/delete` sites, all with a session `tenant_id` predicate (checked by grep). The web API routes have no direct writes (`scripts/verify-web-db-boundary.mjs` allowlist is empty) |

## 5. Migrations

- Ledger: 177 files, linear timestamps, `20260509164536_initial_schema.sql` →
  `20260921181036_roadmap_integrations_foundation.sql`.
- **Reproducible from zero: yes, proven in CI**, not locally. The
  `database-reproducibility` job does the following, green on `main` run 38398595447:
  - runs `supabase db start` + `supabase db reset --local` on Postgres 17 with
    pinned CLI 2.109.1;
  - asserts an empty `supabase db diff`;
  - verifies the ledger/catalog (`scripts/verify-database-repro.mjs`);
  - runs `plan-database-release.mjs --require-current`.
- Local replay was impossible: no Supabase CLI, Docker daemon down.
- RLS (static count of explicit statements):
  - `enable row level security` on 122 tables;
  - `force row level security` 96×;
  - 278 `create policy`, 0 `using (true)`;
  - 146 `security definer` mentions.
- Policy: production holds live demo data (STATE.md), so migrations must be
  additive (expand/contract). Index fixes below must use `create index concurrently`.

## 6. Error handling

- **Leaks to clients: none found.**
  - Nest has no custom exception filter. Unknown errors become a generic 500.
  - No `…Exception(error.message)` pattern in `apps/api/src`.
  - Web actions return allowlisted domain messages, e.g.
    `portal/bom/[token]/sign-actions.ts:150-158` and
    `admin/users/actions.ts:453-461`.
  - One raw provider message goes to an admin: Supabase `updateUserById` error
    at `admin/users/actions.ts:302` (acceptable, admin-only).
- **Unhandled promise paths.**
  - No `process.on('unhandledRejection')`. `apps/api/src/main.ts:44`
    `void bootstrap()`: a failed boot crashes the process, which is the desired outcome.
  - 60 `void fn()` sites, mostly UI handlers with internal try/catch.
  - Masked failures: `requireUserProfile().catch(() => null)` turns
    DB/network errors into "Unauthorized" (BL-20).

---

## 7. Findings

Size: S < 1 day, M 1–3 days, L > 3 days. "Inferred" = not verified at runtime.

### P0 — none
Build, typecheck and lint are green. No float money in persisted data. No
cross-tenant read path was found in the sampled queries.

### P1

**BL-01 · P1 · `apps/web/package.json` (`"next": "15.5.27"`)**: Next.js has a critical unauthenticated RCE and a high DoS.
- Evidence:
  - `pnpm audit --prod`: GHSA-2464-fhr4-w9xw (critical, Image Optimization +
    SVG) and GHSA-p3m5-59mp-jv5r (high, Server Actions DoS). Both affect
    ≤15.5.27, fixed in 15.5.28.
  - The CI Security Scan fails on every PR (PR #128 run 41761854446).
  - Exposure is probably reduced but not removed (inferred): `apps/web/next.config.ts:8-15`
    sets no `dangerouslyAllowSVG` and no `remotePatterns`, and the middleware
    matcher skips `/_next/image`.
- Fix: merge PR #125 (green, mergeable) or bump `next` (and
  `eslint-config-next`, `packages/auth` dev dep) to ≥15.5.28. Then deploy.
- Size: S.

**BL-02 · P1 · `apps/api/package.json`, `pnpm-workspace.yaml` overrides**: High advisories in the API runtime graph.
- Evidence:
  - zod 3.25.76 GHSA-mrhx-c7xc-m3w5 (fix needs zod ≥4.6.6, a major);
  - body-parser <2.4.0 GHSA-27r3-jxmh-p828 (express);
  - multer <2.5.0 GHSA-q7qp-rjg7-q26m (@nestjs/platform-express);
  - systeminformation <5.33.16 GHSA-3f7j-7jwc-fxfj (inngest OTel; Windows-only
    path, runtime is Linux);
  - moderate: qs ≤6.16.0.
  - The API takes 4 MB JSON bodies (`apps/api/src/main.ts:21`), so the body-parser/zod DoS paths are reachable.
- Fix:
  - add overrides `body-parser ≥2.4.0`, `multer ≥2.5.0`,
    `systeminformation ≥5.33.16`, `qs ≥6.16.1`;
  - for zod, either migrate to v4 (182 schemas, L) or add a scoped
    `auditConfig.ignoreGhsas` waiver with a documented size cap on collection
    schemas until migrated.
- Size: M (L with zod v4).

**BL-03 · P1 · `apps/web/package.json` (`vite` 7.3.5), `vitest` 4.1.11**: High advisory in the dev graph fails the full-graph audit gate.
- Evidence: vite GHSA-587h-7wmj-h5pm (high) + 4 more vite advisories,
  @vitest/mocker ×2, fast-uri ×4 (@nestjs/cli), glob, deepmerge, minimatch.
  25 advisories in the full graph.
- Fix: vite ≥7.3.7, vitest ≥4.1.12, and overrides for fast-uri ≥3.1.9 and glob ≥14.0.2.
- Size: S.

**BL-04 · P1 · `apps/web/src/app/(dashboard)/pipeline/actions.ts:361-364` (used at :53-54 and :148-149)**: Persisted money has no validation.
- Evidence:
  - `parseCents` = `parseFloat` → `NaN` becomes 0, negatives are accepted, no
    upper bound, no Zod.
  - The values go straight into `db.insert(opportunities)` (`tcv_cents`,
    `gp_cents`, derived `weighted_tcv_cents`).
  - No DB check on `opportunities.tcv_cents/gp_cents ≥ 0`. The only checks are
    `prob_range` and account/project (`packages/database/src/schema/opportunities.ts:50-54`).
- Fix:
  - Zod: a finite non-negative decimal string → integer cents via one shared
    parser (see BL-24).
  - Expand-only migration: `check (tcv_cents >= 0 and gp_cents >= 0) not valid`,
    then `validate constraint` after a data check.
- Size: S.

### P2

**BL-05 · P2 · `supabase/migrations/*` (static replay)**: 342 of 734 FK column sets have no covering index.
- Evidence:
  - 192 are actor FKs → `users`.
  - The 150 others include:
    - `supplier_bills(tenant_id,project_id)` (`20260726220000_supplier_payables_foundation.sql`);
    - `po_line_items(tenant_id,bom_line_item_id)` and
      `project_budget_lines(tenant_id,bom_line_item_id)` (`20260726242000_project_budget_schema.sql`);
    - `progress_claims(invoice_id)` (`20260513100000_rework_alignment.sql`);
    - `contracts(bom_id)` and `warranty_portal_tokens(project_id)` (`20260512110000_third_code_erp_ops_phase_2_to_8.sql`).
  - Effects: slow parent deletes and FK checks, and slow joins on those columns.
- Fix: confirm with a `pg_catalog` FK-without-index query in the CI reset DB.
  Then add `create index concurrently` for the non-actor FKs that are used in
  joins or deletes. Skip actor columns unless users are ever hard-deleted.
- Size: M.

**BL-06 · P2 · migrations**: 11 tenant tables have no `tenant_id`-leading index.
- Tables: `certificates_of_completion`, `permit_documents`, `price_list_items`,
  `provider_delivery_attempts`, `punchlist_photos`, `sap_posting_attempts`,
  `site_inspection_photos`, `site_inspection_rfis`, `ticket_messages`,
  `turnover_packages`, `warranty_portal_tokens`.
- Evidence: every app query and every RLS policy filters on `tenant_id`.
  Example: `certificates_of_completion` has only `idx_coc_project_id`
  (`20260512110000_…:458`).
- Fix: add `(tenant_id)` or `(tenant_id, <hot column>)` indexes concurrently.
- Size: S.

**BL-07 · P2 · `apps/web/src/app/(dashboard)/pipeline/page.tsx:32` and others**: List queries are unbounded and pagination is rare.
- Evidence:
  - 72 web and 15 api/package select chains have no `.limit` (heuristic).
  - Top files: `pipeline/page.tsx` (5), `crm/opportunities/[id]/proposal/page.tsx`
    (4), `reports/page.tsx` (4), `apps/api/src/process/process.service.ts` (7).
  - `pipeline/page.tsx:32` loads every tenant opportunity with 3 joins.
  - `.offset(` appears only 3× in web.
- Fix: add limit + keyset pagination to list pages and Core list endpoints.
  Cap report queries.
- Size: M.

**BL-08 · P2 · `apps/web/src/lib/operations/cadence-engine.ts:143-175`**: Daily-task generation has N+1 queries and can create duplicates under concurrency.
- Evidence:
  - 4 nested loops (project × template × task × assignee) issue one SELECT and
    one INSERT per combination, with no transaction.
  - `daily_tasks` has no unique key for idempotency, only non-unique indexes
    (`20260512110000_…:347-350`).
  - A cron run (`apps/web/src/lib/inngest-cadence.ts:57`) and an event run
    (`:97`) can race and insert duplicates.
  - `activeProjects` (`:116-119`) does not filter `deleted_at`.
  - Production holds 1,092 daily tasks (STATE.md). PR #128 touches this area.
- Fix:
  - dedupe existing rows;
  - add a unique index on `(tenant_id, project_id, assignee_id, title, manila due date)`;
  - batch `insert … on conflict do nothing`;
  - add `isNull(projects.deleted_at)`.
- Size: M.

**BL-09 · P2 · various**: Other N+1 candidates (heuristic, each still needs review).
- Candidates (a `for…of` loop with an awaited query per iteration):
  - `apps/web/src/app/(dashboard)/procurement/actions.ts:1510,1598`;
  - `apps/web/src/lib/procurement/rfq-workflow-service.ts:381,613`;
  - `packages/operations/src/signed-bom-award.ts:572,662`;
  - `apps/api/src/projects/ms-project-xml-import.service.ts:98,142`;
  - `apps/web/src/app/(dashboard)/projects/[id]/cost/budget/actions.ts:575`;
  - `apps/web/src/app/api/ai/chat/route.ts:182,216`;
  - `…/proposal/tender-actions.ts:132`.
- Fix: batch with `inArray` or a set-based insert where the loop is not
  intentionally sequential.
- Size: M.

**BL-10 · P2 · `apps/web/src/lib/erp-core-client.ts:520-566` + 188 web files importing `@third-code-erp/database`**: Every migrated feature keeps two data paths.
- Evidence:
  - 96 `ERP_*_VIA_API` + `_TENANT_IDS` flag pairs. When a flag is off, the web
    uses its legacy direct-Drizzle path.
  - 20 action files with 37 direct write sites skip Core idempotency receipts.
    Example: `pipeline/actions.ts:58`, a direct opportunity insert, even though
    a Core opportunity-creation contract exists.
  - Each feature therefore has two code paths to keep correct.
- Fix: per module, after a stable canary, set the flag to `*`, delete the
  legacy branch and the flag, and keep a burn-down count in STATE.md.
- Size: L.

**BL-11 · P2 · `apps/web/src/app/(dashboard)/pipeline/actions.ts:58-83` and 78 more `writeAuditLog(` calls**: App audit rows are not written atomically with the mutation.
- Evidence:
  - 79 `writeAuditLog(` calls run as separate statements after the write.
  - A crash in between loses the app-level audit row. DB triggers
    (`20260509164538_audit_triggers.sql`) still hash-chain tagged tables.
  - An atomic helper already exists: `writeAuditLogInTransaction`
    (`apps/web/src/lib/audit.ts`).
- Fix: wrap the mutation and audit row in `db.transaction` (with
  `stampActorInTransaction`), or move the write to Core.
- Size: M.

**BL-12 · P2 · `apps/web/src/lib/erp-core-client.ts`**: One 10,513-line module with 160 copies of the same request block.
- Evidence: 265 exports, 162 `fetch(` calls, 209 importers. Each wrapper
  re-implements access, headers, timeout, JSON parse and status mapping.
- Fix: extract `coreRequest({ method, path, command, resultSchema, idempotencyKey })`
  and split the file by domain. This is mechanical, and the large
  `erp-core-client.test.ts` guards it.
- Size: M.

**BL-13 · P2 · 89 production files > 500 lines**
- Evidence: 20 files over 1,000 lines. Examples:
  - `apps/api/src/procurement/delivery-workflow.service.ts` 2,202;
  - `…/projects/[id]/bom/actions.ts` 2,113;
  - `…/procurement/actions.ts` 1,782;
  - `apps/api/src/config/environment.ts` 1,581;
  - `…/cost/budget/budget-workspace.tsx` 1,567.
- Fix: split when touched, by command or workflow. No big-bang refactor.
- Size: L (incremental).

**BL-14 · P2 · `apps/*/vitest.config.ts`, `packages/database/vitest.config.ts`, `ci.yml` (coverage artifact)**: Coverage is never measured.
- Evidence:
  - No `@vitest/coverage-*` in `node_modules/.pnpm`.
  - No coverage block in any vitest config.
  - CI uploads `packages/*/coverage/`, which is never produced.
  - Root `CLAUDE.md` §13.1 calls for an 80% gate.
- Fix: add `@vitest/coverage-v8` and a `--coverage` run in CI. Report first,
  then gate on a ratchet rather than a flat 80%.
- Size: S.

**BL-15 · P2 · `apps/workers/dxf-parser/tests`, `apps/workers/ai/tests`**: Python worker tests never run in CI.
- Evidence: `rg pytest .github/workflows` returns nothing. dxf-parser is the
  production CAD worker on Railway (RUNBOOK).
- Fix: add a CI job: `pip install -e .[dev]` + `pytest` for each worker.
- Size: S.

**BL-16 · P2 · `docs/runbooks/tenant-isolation.md:19`, `docs/ARCHITECTURE.md`, `CLAUDE.md`**: Tenancy and stack docs contradict the code.
- Evidence:
  - The runbook says "no table has FORCE ROW LEVEL SECURITY", but migrations
    have 96 `force row level security` statements (e.g.
    `20260726201606_accounting_ledger_foundation.sql:1229`).
  - `docs/ARCHITECTURE.md` says server components read "RLS-scoped" (they use Drizzle).
  - `CLAUDE.md` lists shadcn/tRPC/React Query, none of which is present.
  - Whether Drizzle bypasses FORCE RLS depends on the role's `BYPASSRLS`, which is unverified.
- Fix: correct the docs. Add a CI assertion that records `rolbypassrls` for the
  runtime role in the reset DB.
- Size: S.

### P3

**BL-17 · P3 · root and package manifests**: 23 dependencies are a major version behind (§2).
- Fix: schedule next 16 / Nest 12 / zod 4 / TS 7 upgrades as separate modules.
- Size: M.

**BL-18 · P3 · `packages/ai/package.json`**: No tsconfig and no typecheck script; pins `openai` ^4 (4.104.0) while web uses 6.37.0.
- Fix: add a tsconfig and `typecheck`, align on one openai major.
- Size: S.

**BL-19 · P3 · `.gitattributes` (only `*.sql text eol=lf`)**: Windows checkouts get CRLF in workflow and script files.
- Evidence: `scripts/verify-build-ops-invariants.test.mjs:210` fails locally on
  CRLF `ci.yml` (1/260 node:test).
- Fix: add `* text=auto eol=lf`.
- Size: S.

**BL-20 · P3 · e.g. `apps/web/src/app/(dashboard)/projects/[id]/bom/actions.ts:1062,1427,1484,1671,1989`**: `requireUserProfile().catch(() => null)` reports DB or network failures as "Unauthorized".
- Also: 15 comment-only catch blocks.
- Fix: catch `AuthError` only and log or rethrow everything else.
- Size: S.

**BL-21 · P3 · `eslint.config.mjs`**: No type-aware lint, so floating promises go undetected.
- Evidence: 60 `void fn()` sites.
- Fix: enable `@typescript-eslint/no-floating-promises` with `parserOptions.project`, scoped to api first.
- Size: M.

**BL-22 · P3 · 7 `eslint-disable` comments**
- Sites:
  - `components/dashboard/realtime-refresher.tsx:40`;
  - `components/cortex/cortex-graph-canvas.tsx:374,385`;
  - `components/pipeline/pipeline-board.tsx:186`;
  - `components/bom/supplier-switcher-panel.tsx:109`;
  - `portal/project/[token]/photos/page.tsx:188`;
  - `components/proposal/inspection-form.tsx:549`.
- Fix: review exhaustive-deps suppressions for stale closures.
- Size: S.

**BL-23 · P3 · `apps/web/src/app/(dashboard)/projects/[id]/coc/page.tsx:79`, `apps/web/src/app/(print)/weekly-report/[id]/page.tsx:86`**: Some follow-up lookups omit `tenant_id`.
- Evidence: these look up `documents` / `accounts` by an id read from an
  already tenant-scoped row. No exposure, but they break the runbook rule
  "every Drizzle query includes tenant_id".
- Fix: add `eq(x.tenant_id, profile.tenantId)`.
- Size: S.

**BL-24 · P3 · ad hoc peso→cents parsing**
- Sites:
  - `components/procurement/create-po-form.tsx:125`;
  - `components/bom/bom-builder.tsx:570`;
  - `pipeline/actions.ts:363`;
  - `app/api/ai/similar-items/route.ts:213`.
- Evidence: `Math.round(parseFloat(x) * 100)` can round wrong because of binary
  floats (e.g. `1.005`). `create-po-form.tsx:124` silently clamps quantity to ≥1.
- Fix: one decimal-string → integer-cents parser in `packages/shared-types`, used everywhere.
- Size: S.

**BL-25 · P3 · `apps/web/src/app/portal/project/[token]/actions.ts:16`**: An unauthenticated mutation takes caller-supplied `sessionId` / `tenantId`.
- Evidence: the function lives in a `'use server'` module. Today it is only
  called from the RSC (`page.tsx:91`), so it is not exposed to client bundles
  (inferred from Next 15 action-id elimination).
- Fix: move it to a plain server module.
- Size: S.

**BL-26 · P3 · `pnpm-workspace.yaml` / `.npmrc`**: Two pnpm hoisting and build-script issues.
- No `onlyBuiltDependencies` decision: pnpm 10 skipped build scripts for
  esbuild, msgpackr-extract, protobufjs, tesseract.js and unrs-resolver.
- `publicHoistPattern: []` means eslint plugins resolve only through pnpm's `NODE_PATH`.
- Fix: record approved build deps and document `pnpm lint` as the only lint entry point.
- Size: S.

---

## 8. Not checked

- Live database catalog: indexes, `rolbypassrls`, policy coverage. Production
  and remote DBs were deliberately not touched. Section 4 figures are static.
- Local migration replay, integration and E2E suites (no Supabase CLI or Docker). CI evidence was used instead.
- Python worker tests and `pnpm dev`, which need dependencies and env.
- Exploitability of GHSA-2464-fhr4-w9xw against this config (inferred only).
