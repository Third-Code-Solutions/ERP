# tenancy — build evidence (D-13)

| | |
|---|---|
| Date | 2026-11-05 |
| Mode | `build` (erp-builder), plan [`../plans/tenancy.md`](../plans/tenancy.md), spec [`../specs/tenancy.md`](../specs/tenancy.md) |
| Tree | `feat/erp-tenancy` on top of `149d3ad3` (spec + plan, D-5 work from PR #141 underneath). Not pushed, not merged |
| Machine | Windows 11, Node 22 (hermes), corepack pnpm 10.33.0, Docker (throwaway `supabase/postgres:17.11.0.011`) |
| Limits | No `.env*` read. No production access. The DB runs used a throwaway container (`tenancy-t10-pg`, DB `erp_t10`, migrations replayed after `scripts/ci/supabase-system-bootstrap.sql`), removed after the run. E2E not run locally |

## Result

- **No amount moved.** No existing amount assertion was edited. The only test file
  deleted is `components/billing/invoice-preview.test.ts` (plan T7). Every case in it
  moved to `shared-types/src/bom/__tests__/progress-invoice.test.ts` with the same
  amounts: 24,750,000; 99,000,000; 73/7/8/1/73; 40,736,666; and 8,330,000 for 8.325%.
  The pinned regressions still pass unchanged: invoice net 24,750,000 / 247,500 and
  PO total 989,871.
- No migration and no schema change. Every new DB read filters on `tenant_id`.
- Money stays in integer centavos with half-up rounding (`bpsHalfUp`, `computeProgressInvoice`, BigInt `+5_000n`).

## Gates

| Gate | Result | Numbers |
|---|---|---|
| Install | PASS | `corepack pnpm install --frozen-lockfile` |
| Build | PASS | api `nest build` (webpack, 29 s). Web `next build`: compiled in 76 s, 116 static pages, `ƒ /settings/tax` 286 B, 103 kB shared JS |
| Typecheck | PASS | shared-types, database, api, web, including the 7 e2e tsconfigs. The T10 integration spec was also checked with a temporary tsconfig, since `apps/api/integration` is not in any tsconfig |
| Lint | PASS | eslint run directly on every touched source file, 0 errors and 0 warnings. The `lint` script itself fails on pnpm 11 vs 10.33 (known tooling issue) |
| Unit: shared-types | PASS | 96 files, 729 tests |
| Unit: database | PASS | 98 files / 333 tests passed; 13 files / 211 tests skipped (they need a DB) |
| Unit: api (`vitest run src test`) | PASS | 269 files, 1,624 tests |
| Unit: web | PASS | 323 files / 2,876 tests passed; 3 files / 6 tests skipped |
| DB suite: `packages/database` with all `*_EXPECTED=1` | PASS | 111 files, 544 tests, 0 skipped |
| API integration (`vitest run integration`, `ERP_API_INTEGRATION_EXPECTED=1`, `--maxWorkers=1`) | 1 FAIL, outside this builder's files | 516 passed, 1 failed, 11 skipped (no Redis). The failure is in the spec engineer's file, see "Open items" |
| `node scripts/verify-wo-15-commitment-contract.mjs` | PASS | Its `node --test` file: 1 pass, 0 fail |
| Zero-literal grep (plan T8) | PASS | No money or label hits in `apps/web/src` or `apps/api/src` outside tests; the only hits are CSS `rgba(…, 0.12)` |
| AC-12 grep | PASS | `customer-invoice-issue.service.ts` imports no resolver |
| E2E | NOT RUN | It needs the stack and CI. `abi-ops-tax-settings.spec.ts` skips on 404, so it is safe while the flag is off |

The integration spec `integration/tax-rates.http.integration.spec.ts` (T10) passed all 3
of its tests against the real DB:
- the gate returns 401, 403 and 503 and no row changes; cross-tenant access gets 404;
  the preparer gets 403; the checker gets 200 with `approved_by` set;
- invoices: tenant T (defaults) nets 247,500; tenant U (profile) has retention 12,500,
  VAT 28,500, EWT 2,375 and net 263,625; tenant V (overlapping profiles) gets 409 and
  no invoice;
- manual PO: T 989,871, U 998,870.

## AC → test

Unit test paths are relative to each package. "HTTP" means `apps/api/integration/tax-rates.http.integration.spec.ts`.

| AC | Tests |
|---|---|
| 01 View with defaults | `web settings/tax/page.test.tsx` (owner, admin, finance, viewer; 12% / 2% / 10% / Yes, "System default", Manila as-of date); e2e `abi-ops-tax-settings.spec.ts`; `dashboard-role-local.spec.ts` viewer path when the flag is on |
| 02 View with a profile | page test: profile in force, preparer and approver names, upcoming list, open-ended, non-VAT, the ended-profile note, latest ended of several |
| 03 Denied role | page test: pm, estimator, sd_pm_pe and procurement are rejected before any read; `dashboard-route-inventory.test.ts` (`/settings/tax` = finance.read) |
| 04 No edit controls | page test: no `form`, `input`, `select`, `textarea` or `button`; locked note; e2e asserts the same |
| 05 API writes gated | `api roadmap/roadmap.tax-profile.service.spec.ts` (503 and no writes, for both create and activate); HTTP (401, 403, 503 with no row change, 404 cross-tenant) |
| 06 Invoice defaults unchanged | `shared-types progress-invoice.test.ts` (I-1..I-8, PB-1..PB-4); `api customer-invoice-draft-create.service.spec.ts` (24,750,000, `retention_bps 1000`, audit default); `web procurement/actions.invoice.test.ts`; HTTP tenant T |
| 07 Invoice with a profile | shared-types P-1, P-3, P-4; API draft spec (profile row; audit `profileId`/`profileCode`); HTTP tenant U |
| 08 Non-VAT invoice | shared-types P-2; API and web draft specs (`vat 0`, audit `vatBps 0`) |
| 09 PO on every path | `web lib/operations/purchase-order-money.test.ts` (PO-1..PO-7, PV-2, property tests); `api purchase-order-creation.service.spec.ts` (3 paths keep 989,871; bps vs percent property check); `api roadmap.requisition-po.service.spec.ts`; `web procurement/actions.test.ts` (3 legacy paths); HTTP manual PO |
| 10 VAT status does not touch PO VAT | PO-6 in `purchase-order-money.test.ts`; `purchaseOrderTaxAudit` unit test |
| 11 Labels from one formatter | `shared-types tax-rates.test.ts` (`formatBps`, all C-4 cases); print invoice, BIR 2307 and billing page tests; the form markup tests |
| 12 Legacy documents | print page test (stored amounts ₱27,000.00 / ₱4,500.00 / ₱247,500.00 rendered as stored; retention 0%); AC-12 grep |
| 13 Previews equal the server | shared-types property test (0..3,000,000 plus 2,000,000 seeded values); PV-1; web PO property test and PV-2; portal `page.test.tsx` PV-3 |
| 14 Overlap refused at activation | guard spec G-5 (names the active code, B stays draft, no write); G-6 |
| 15 No backdating | guard spec G-3 and the Manila-date edge case; G-4 |
| 16 Preparer cannot approve | guard spec G-1 (403, no write or audit); G-2 (`approved_by`); HTTP |
| 17 Ignored profiles | shared-types R-3, R-5, R-6 via `pickEffectiveTaxRates`; `database tax/effective-tax-rates.test.ts` SQL condition |
| 18 Tenant isolation | `database effective-tax-rates.test.ts` (tenant predicate and params); page test (`tax_profiles` and `users` reads filter on the tenant); HTTP two tenants |
| 19 Overlap at write time | shared-types R-7; `api common/tax-rates` → 409; API draft spec (no insert); web legacy `{ error }`, no insert; page conflict state; HTTP tenant V |
| R-8 | resolver unit test: `2026-12-31T16:30Z` → `asOf 2027-01-01` in the SQL params |
| G-7 | guard spec: create replay with a changed `vatRegistered`, `validFrom` or `validTo` → conflict, no write |

## Commits (one per plan task)

| Task | Commit |
|---|---|
| T1 | `dbfcadb0` feat(tax): add TAX_DEFAULTS, rate picker and progress-invoice formula |
| T2 | `fa83afbd` feat(tax): add tenant-scoped effective tax rate loader |
| T3 | `d1cca6db` feat(finance): draft Core API invoices at the tenant's effective rates |
| T4 | `903a0dff` feat(procurement): price Core API POs at the tenant's effective rates |
| T5 | `b2efefea` feat(roadmap): price requisition-to-PO at the tenant's effective rates |
| T6 | `13dd16cf` feat(web): use the tenant's effective rates on legacy invoice and PO paths |
| T7 | `c32ea09b` feat(web): preview invoices, POs and the portal BOM at the tenant's rates |
| T8 | `ee1ba135` feat(web): label invoice and PO documents through formatBps |
| T9 | `9b685601` feat(roadmap): guard tax profile activation with maker-checker and dating rules |
| T10 | `c5df89da` test(api): HTTP integration for tenant tax rates and profile activation |
| T11 | `d1d45c03` feat(web): add read-only tax rates view behind ERP_TENANCY_ENABLED; `16fba67e` refactor (drops a non-null assertion) |
| T12 | this report, `STATE.md`, `BACKLOG.md` |

## Deviations from the plan

1. PV-2 and the PO property test landed in T7 instead of T6. They pin the preview
   path that T7 changed.
2. The billing page resolves rates after the project-not-found check, so a missing
   project is never blocked by a rate conflict.
3. The portal loader returns `taxRates` as a top-level field of the ok result.
4. `/settings/tax` is in the viewer e2e path list only when `ERP_TENANCY_ENABLED=true`.
   With the flag off, the page is 404.
5. The route-inventory page count went from 120 to 121 because of the new page. This is
   a route count, not money.
6. The settings label is "EWT", as the plan has it; a longer label broke the spec
   parser.
7. The G-7 replay checks are added to the existing same-code compare in
   `createTaxProfile`.
8. An extra T11 commit, `16fba67e`, replaces a non-null assertion: builder rule.

## Open items and risks

- **Integration fixture failure, outside this builder's files.** The test
  `integration/tax-rates.tenancy-spec.http.integration.spec.ts` › "gated tax-profile
  write API and activation guards" fails at line 587. It inserts a
  `tenant_feature_flags` row with `enabled: true` but without `enabled_by` /
  `enabled_at`, so the check constraint `tenant_feature_flags_enabled_evidence`
  (`20260921181036_roadmap_integrations_foundation.sql:36`) rejects it. This is a test
  fixture issue, not product code. The T10 spec sets both fields and passes. It is left
  for the spec engineer; this builder does not edit `tenancy-spec` files.
- `formatBps` throws for a stored `invoices.retention_bps` outside the integers
  0..10000. No DB check constraint guards that column.
- The billing, PO list and portal pages fail closed if two active profiles ever
  overlap. The plan accepts this; it cannot happen while writes are gated.
- No unit test covers `loadPortalBom` resolving rates with the row's `tenant_id`
  directly; only the page test covers it, through a mocked loader.
- CI typecheck does not cover `apps/api/integration`.
- Not run locally: the e2e suites and the CI `database-reproducibility` job.
- Ship blocker Q-TEN-6 (owner): at release, re-confirm 0 `tax_profiles` rows and
  `tax_statutory_outputs` off for every tenant.
- New defect D-16 (in `BACKLOG.md`, not fixed because it changes amounts): the
  requisition-to-PO line total floors for fractional quantities
  (`apps/api/src/roadmap/roadmap.service.ts:590`).
