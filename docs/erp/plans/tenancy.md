# Plan: Tenant tax settings (`tenancy`)

Spec: [`../specs/tenancy.md`](../specs/tenancy.md) (domain-reviewed 2026-11-05). The spec is
the contract. Branch `feat/erp-tenancy`, base `8293f798`. Every line reference below was
checked on that commit.

## 1. Summary

When done:
- One pure picker (`pickEffectiveTaxRates`) and one tenant-scoped loader (`resolveTaxRates`)
  give every invoice, PO, preview and settings read the same effective VAT, EWT and
  retention rates for a tenant on a Manila date.
- Fallback is `TAX_DEFAULTS` (1200 / 200 / 1000 bps, VAT-registered) in
  `packages/shared-types`. Production has 0 `tax_profiles` rows, so every amount stays
  identical to the centavo.
- The 13 math sites read resolved rates. The labels read stored bps, `TAX_DEFAULTS` or
  resolved bps through one formatter (`formatBps`).
- Every new invoice and PO audit entry carries a `tax` block.
- The gated profile API gets three changes: maker-checker on activate, a no-backdating
  check, and a full-definition replay check.
- Finance sees a read-only view at `/settings/tax`.

**No migration. No new table, column, endpoint or dependency.**

Feature flag (decision in §11): the money paths have **no flag**. The view sits behind
`erp_tenancy`, implemented as the env gate `ERP_TENANCY_ENABLED=true`. It is **off by
default**.

Prerequisites: none. Vitest, Zod, Drizzle, the audit service and the capability policy all
exist.

## 2. Pattern references

| Concern | Copy from |
|---|---|
| One tenant-scoped DB helper shared by API and web, running inside the caller's transaction; SQL-text test via `PgDialect` | `packages/database/src/invoicing/billed-percent.ts` + `billed-percent.test.ts` |
| Active in-date profile query shape | `apps/api/src/roadmap/roadmap.service.ts:1119` (`calculateTaxByProfile`) |
| Distinct-actor refusal (`ForbiddenException`) | `apps/api/src/procurement/purchase-order-workflow.service.ts:380-384` |
| RSC finance-read guard | `apps/web/src/app/(dashboard)/finance/receivables/page.tsx:71-72` (`requireUserProfile` + `requireCapability(profile, 'finance.read')`) |
| Settings subpage and card markup; per-role render test | `apps/web/src/app/(dashboard)/settings/profile/page.tsx`, `settings/page.tsx:235-247`, `settings/page.test.ts` |
| Route registration (defense-in-depth path guard) | `apps/web/src/lib/operations/nav-config.ts:510-608`, `dashboard-route-inventory.test.ts` |
| Boolean env gate | `apps/web/src/lib/operations/business-calendar.ts:49` |
| API service unit harness (sequential `select` mocks) | `apps/api/src/finance/customer-invoice-draft-create.service.spec.ts:200-270` |
| API HTTP integration against a real DB | `apps/api/integration/customer-invoice-draft-create.http.integration.spec.ts` |
| E2E on a finance route | `apps/web/e2e/abi-ops-finance.spec.ts` |

## 3. Data model

Unchanged. The code reads `tax_profiles` (`packages/database/src/schema/roadmap.ts:451-489`)
using these columns: `id, tenant_id, code, name, status, valid_from, valid_to, vat_rate_bps,
withholding_rate_bps, retention_rate_bps, vat_registered, created_by, approved_by,
approved_at`. Column defaults are never relied on; in particular the retention default is
0. `invoices.retention_bps` (already stored) is now written from the resolver.

## 4. Migration

None (spec D-TEN-6). Nothing is `REQUIRES APPROVAL`.

## 5. Tenant isolation

- **App layer (the real boundary; Drizzle bypasses RLS).**
  - `resolveTaxRates` builds its WHERE from `effectiveTaxProfilesCondition(tenantId, asOf)`,
    which starts with `eq(taxProfiles.tenant_id, tenantId)`.
  - `tenantId` always comes from the server session or token: `principal.tenantId` (API),
    `profile.tenantId` / `userRow.tenant_id` (web), or the portal token row's `tenant_id`.
    It never comes from request input.
  - The settings loader filters both `tax_profiles` and `users` on `tenant_id`.
- **DB layer (backstop).** The existing RLS on `tax_profiles` is unchanged. No client-role
  path reads it.
- **Service role.** Not used.
- **Proof.**
  - A unit test asserts the exact SQL text and params (tenant predicate first).
  - An HTTP integration test runs two tenants against a real DB (R-9 / AC-TEN-18).

## 6. Authorization matrix

| Action | owner | admin | finance | viewer | pm / estimator / sd_pm_pe / other roles | Enforced at |
|---|---|---|---|---|---|---|
| View `/settings/tax` | ✓ | ✓ | ✓ | ✓ | — | ① `nav-config.ts` registers the route with `FINANCE_ROUTE_ROLES` (`:432`), so the dashboard path guard denies it. ② The page calls `requireCapability(profile, 'finance.read')` (`authorization.ts:184`) before any DB read. |
| Edit any rate | — | — | — | — | — | Nothing to enforce: there is no update endpoint (profiles are immutable), no server action and no form control. A test asserts that none exist. |
| Override a rate on a document | — | — | — | — | — | Request schemas carry no rate fields (`customerInvoiceDraftCreateBodySchema`, `shared-types/src/erp-api/finance.ts:345`; PO commands). Rates are resolved server-side. |
| Create profile | gate off | gate off | gate off | — | — | Existing: `@RequireCapabilities('finance.manage')` (`roadmap.controller.ts:197`) + `requireFeature('tax_statutory_outputs')` (`roadmap.service.ts:192-216`). New: full-definition replay check. |
| Activate profile | gate off | gate off | gate off | — | — | Existing capability + gate. New guards, in this order, all under the existing tenant lock and before any write: (1) actor ≠ `created_by` → 403; (2) `valid_from` ≥ today's Manila date → 409; (3) no intersecting active profile → 409 naming its code. |
| Retire profile | gate off | gate off | gate off | — | — | Existing capability + gate (unchanged). |
| Create invoice / PO | unchanged | | | | | Existing `finance.issue_invoice` / `po.create`. |

Single enforcement function per surface:
- Web view: `requireCapability`.
- API: the global `CapabilityGuard` (default-deny) plus `RoadmapService.requireFeature`.

## 7. Domain logic (pure, unit-testable)

### 7.1 `packages/shared-types/src/tax-rates.ts` (new; exported from `src/index.ts`)

```ts
export const TAX_DEFAULTS = Object.freeze({
  vatBps: 1200, ewtBps: 200, retentionBps: 1000, vatRegistered: true,
} as const)                       // the single definition; nothing else may hold 1200/200/1000

export interface EffectiveTaxRates {
  vatBps: number; ewtBps: number; retentionBps: number; vatRegistered: boolean
  source: 'default' | 'profile'
  profileId: string | null; profileCode: string | null
  asOf: string                    // Manila YYYY-MM-DD
}

export interface TaxProfileCandidate {   // the Drizzle row shape (snake_case), no mapping code
  id: string; code: string; status: string; valid_from: string; valid_to: string | null
  vat_rate_bps: number; withholding_rate_bps: number; retention_rate_bps: number
  vat_registered: boolean
}

export class TaxProfileOverlapError extends Error {   // code 'TAX_PROFILE_OVERLAP'
  constructor(readonly profileCodes: readonly string[], readonly asOf: string)
}

// C-1. It re-applies status 'active' and the in-date filter itself, so it is safe on unfiltered
// rows (used by tests R-1..R-7). 0 → TAX_DEFAULTS/'default'; 1 → that profile; ≥2 → throws
// TaxProfileOverlapError with the codes sorted.
export function pickEffectiveTaxRates(rows: readonly TaxProfileCandidate[], asOf: string): EffectiveTaxRates

export function formatBps(bps: number): string   // C-4, integer math; RangeError if not an int in 0..10000

// §12 audit payloads; the only place the D-TEN-2 split is encoded for the audit.
export function invoiceTaxAudit(r: EffectiveTaxRates):
  { vatBps: number /* 0 when !vatRegistered */; ewtBps: number; retentionBps: number;
    vatRegistered: boolean; source: 'default' | 'profile'; profileId: string | null;
    profileCode: string | null; asOf: string }
export function purchaseOrderTaxAudit(r: EffectiveTaxRates):
  { vatBps: number /* flag ignored */; ewtBps: number; source: 'default' | 'profile';
    profileId: string | null; profileCode: string | null; asOf: string }
```

### 7.2 `packages/shared-types/src/bom/calculations.ts` (edited)

```ts
computeVAT(amountCents: number, vatBps: number = TAX_DEFAULTS.vatBps): number             // :241
computeEWT(amountCents: number, ewtBps: number = TAX_DEFAULTS.ewtBps): number             // :246
computeRetention(amountCents: number, retentionBps: number = TAX_DEFAULTS.retentionBps)   // :251
// C-2 in one place, used by the Core API draft, the legacy web draft and the invoice form
// preview. It replaces the 3 copies of the formula and spec C-5's `previewProgressInvoice`.
computeProgressInvoice(tcvCents: number, billingPercentBps: number,
  rates: Pick<EffectiveTaxRates, 'vatBps' | 'ewtBps' | 'retentionBps' | 'vatRegistered'>):
  { subtotal: number; retention: number; base: number; vat: number; ewt: number; net: number;
    vatBps: number /* applied: 0 when !vatRegistered */ }
```

`rates` is **required** on `computeProgressInvoice` and on `calculatePurchaseOrderTotals`
(§7.4). So the compiler forces every money path to pass resolved rates. A net below zero is
not reachable: W ≤ B and VAT ≥ 0 for bps ≤ 10000.

### 7.3 The rate resolver: `packages/database/src/tax/effective-tax-rates.ts` (new; exported from `src/index.ts`)

```ts
export function effectiveTaxProfilesCondition(tenantId: string, asOf: string): SQL | undefined
//   and(eq(tenant_id, tenantId), eq(status,'active'), lte(valid_from, asOf),
//       or(isNull(valid_to), gte(valid_to, asOf)))
export async function resolveTaxRates(
  executor: Pick<Database, 'select'>,   // the caller's transaction (or db for read-only pages)
  tenantId: string,
  at: Date,                             // instant of the write; resolver derives the Manila date
): Promise<EffectiveTaxRates>           // = pickEffectiveTaxRates(rows, manilaCalendarDate(at))
```

Decisions:
- **One resolver for both apps.** Both apps already share `billedPercentBps` from this
  package in the same way. The spec's "a tenant-scoped loader per app" therefore becomes
  one loader.
- **It takes a `Date`, not a date string.** The web has a same-named
  `manilaCalendarDate` in `lib/operations/cadence-engine.ts` that returns a `Date`. A
  caller passing that helper's value, or a UTC slice, would get the wrong day. Deriving the
  date inside the resolver puts R-8 in one place.
- **No row lock.** Spec §10: writes are gated, and the invoice path holds the project lock.
  It reads in the same transaction as the write.
- **No `limit`.** All overlapping codes are reported.

### 7.4 Thin per-app wrappers

- `apps/api/src/common/tax-rates.ts` (new, about 15 lines):
  `resolveTaxRatesForWrite(transaction, tenantId, at)`. It calls `resolveTaxRates`. On a
  `TaxProfileOverlapError` it logs through `new Logger('TaxRates').error(message)` and
  throws `ConflictException(message)` (409). It rethrows any other error.
- `apps/web/src/lib/operations/purchase-order-money.ts`:
  `calculatePurchaseOrderTotals(subtotalCents, rates: { vatBps: number; ewtBps: number })`.
  The constants at `:2-3` are removed and the body uses `BigInt(rates.vatBps)` /
  `BigInt(rates.ewtBps)`. Its type cannot see `vatRegistered`, so D-TEN-2 holds by
  construction.
- Core API PO: `percentHalfUp` (`purchase-order-creation.service.ts:97-99`) is replaced by
  `bpsHalfUp(value: bigint, bps: number): bigint`, defined as
  `(value * BigInt(bps) + 5_000n) / 10_000n`.

### 7.5 Activation guards (in place, `roadmap.service.ts`)

| Where | Change |
|---|---|
| `:1039` replay compare | Also compare `vat_registered`, `valid_from` and `valid_to ?? null` with the command. A mismatch throws the existing `ConflictException` (G-7). |
| after `:1083` (activate on a draft) | `if (profile.created_by === principal.userId) throw new ForbiddenException('The tax profile preparer cannot activate it')` (G-1, D-TEN-5) |
| next | `if (profile.valid_from < manilaCalendarDate(new Date())) throw new ConflictException('valid-from must be today or later')` (G-3, D-TEN-1) |
| `:1086-1099` overlap | Select `code` as well. The message becomes ``An active tax profile (${overlap.code}) already covers this effective date range`` (G-5, AC-TEN-14). |

All three guards throw before the update at `:1102`, the workflow event and the audit write.
So a refused activation writes nothing (AC-TEN-16).

## 8. Every hardcode site: the exact change

Notation:
- **Tx**: the site runs inside an existing transaction, and the listed locks are already held
  when the resolver is called.
- **Client**: a client component that cannot call the DB. Its rates come from the server page
  as a prop.

### 8.1 Math sites (spec §15: 13 sites in 9 files)

| # | File:line | Kind | Change |
|---|---|---|---|
| 1 | `packages/shared-types/src/bom/calculations.ts:241-243` | pure | `computeVAT(amount, vatBps = TAX_DEFAULTS.vatBps)` |
| 2 | `…/calculations.ts:246-248` | pure | `computeEWT(amount, ewtBps = TAX_DEFAULTS.ewtBps)` |
| 3 | `…/calculations.ts:251` | pure | default becomes `TAX_DEFAULTS.retentionBps`; add `computeProgressInvoice` (§7.2) |
| 4 | `apps/api/src/finance/customer-invoice-draft-create.service.ts:44` (used `:272`, `:315`; VAT/EWT `:274-275`) | **Tx**; holds users row FOR UPDATE (`:387`), project FOR UPDATE (`:186`), BOM FOR UPDATE (`:222`, `:246`), idempotency claim | Delete `RETENTION_BPS`. Move `const now = new Date()` from `:279` to just after the cap check (`:266`), then `const tax = await resolveTaxRatesForWrite(transaction, authorizedPrincipal.tenantId, now)`. `:267-276` becomes `computeProgressInvoice(exactCentavoNumber(bom.tcvCents), parsedBody.billingPercentBps, tax)`. Set `retention_bps: tax.retentionBps` (`:315`). Audit `:346` diff gets `tax: invoiceTaxAudit(tax)`. |
| 5 | `apps/web/src/app/(dashboard)/procurement/actions.ts:921` (`:922-929`) | today the math runs **outside** the tx; it moves into the **Tx** at `:939`, after the project FOR UPDATE (`:942-951`) and the cap check | Delete `retentionBps`. Inside the tx: `const tax = await resolveTaxRates(tx, profile.tenantId, now)` (reuse `now`, `:932`), then `computeProgressInvoice(bom.tcv_cents, billingPercentBps, tax)`. Set `retention_bps: tax.retentionBps` (`:986`). The tx returns the amounts and `tax`. Audit `:1000` (post-tx `writeAuditLog`) diff gets `tax: invoiceTaxAudit(tax)`. Wrap the tx: on `TaxProfileOverlapError`, `console.error('[tax-rates]', …)` and return `{ error: message }`; rethrow anything else. |
| 6 | `apps/web/src/components/billing/invoice-preview.ts:8` (`:14-17`) | **Client** consumer (`create-invoice-form.tsx`) | Delete the file. Port its 6 cases from `invoice-preview.test.ts` to the shared-types tests. `CreateInvoiceForm` takes the new prop `taxRates: EffectiveTaxRates` and calls `computeProgressInvoice(tcvCents ?? 0, bps, taxRates)` (`create-invoice-form.tsx:30`). The billing page (RSC) passes `taxRates` at `projects/[id]/billing/page.tsx:193`. |
| 7 | `apps/api/src/procurement/purchase-order-creation.service.ts:501-502` (grouped from BOM) | **Tx**; users FOR UPDATE (`:225`), idempotency (`:275`), BOM FOR UPDATE (`:310`) | Before the PO-number lock (`:479`), once per command: `const tax = await resolveTaxRatesForWrite(transaction, tenantId, now)` (reuse `now`, `:318`). Use `bpsHalfUp(subtotal, tax.vatBps)` / `bpsHalfUp(subtotal, tax.ewtBps)`. Per-PO audit `:551` diff gets `tax: purchaseOrderTaxAudit(tax)`. |
| 8 | `…/purchase-order-creation.service.ts:871-872` (from BOM) | **Tx**; users (`:679`), idempotency (`:729`), BOM FOR UPDATE (`:764`) | Hoist `const now = new Date()` from `:939` to before `:862` and reuse it below. Resolve as in row 7, then `bpsHalfUp`. Audit `:989` diff gets `tax`. |
| 9 | `…/purchase-order-creation.service.ts:1199-1200` (manual create) | **Tx**; users (`:1051`), idempotency (`:1105`) | `const tax = await resolveTaxRatesForWrite(transaction, tenantId, new Date())`, then `bpsHalfUp`. Audit `:1309` diff gets `tax`. Delete `percentHalfUp` (`:97-99`). |
| 10 | `apps/web/src/lib/operations/purchase-order-money.ts:2-3`; callers `procurement/actions.ts:311, 516, 1667` | callers below | Add the `rates` param (§7.4). **`:311` createPoFromBom**: **Tx** (`:266`), BOM FOR UPDATE (`:276`) and lines (`:293`); resolve before `:311`; audit `:366` gets `tax`. **`:516` createStandalonePo**: today it runs before the tx. Keep the subtotal reduce (and its range message) pre-tx; move `calculatePurchaseOrderTotals(subtotalCents, tax)` into the **Tx** (`:523`) after the `po-number` advisory lock (`:524-528`). The catch maps `RangeError` to the same range message and maps overlap. Audit `:568` gets `tax`. **`:1667` createPosFromBomGrouped**: **Tx** (`:1531`), BOM FOR UPDATE (`:1539`); resolve once before the loop using `now` (`:1564`); per-PO audit `:1709` gets `tax`. Each catch adds the `TaxProfileOverlapError` mapping (3 lines). `scripts/verify-wo-15-commitment-contract.mjs:40-41` pins the removed literals. Replace those 2 asserts with asserts that `tax-rates.ts` holds `vatBps: 1200` / `ewtBps: 200` and that `purchase-order-money.ts` uses `rates.vatBps`. The intent ("12% / 2% unchanged") moves to the single source; it is not weakened. |
| 11 | `apps/api/src/roadmap/roadmap.service.ts:587-588` (requisition-to-PO) | **Tx**; roadmap tenant advisory lock (`:402`), requisition FOR UPDATE (`:421`) | In `transitionRequisition`'s `convert_to_po` branch (`:427-429`): `const tax = await resolveTaxRatesForWrite(transaction, principal.tenantId, new Date())`, passed as a new 5th parameter of `convertRequisitionToPurchaseOrder` (`:553`). `:587-588` uses `BigInt(tax.vatBps)` / `BigInt(tax.ewtBps)`. Audit `:453` diff gets `tax: tax ? purchaseOrderTaxAudit(tax) : null`. The `:583` flooring defect is **not** touched (spec ADVISORY). |
| 12 | `apps/web/src/components/procurement/create-po-form.tsx:109-110` | **Client** | New prop `taxRates: { vatBps: number; ewtBps: number }`. Compute `Number.isSafeInteger(subtotal) && subtotal >= 0 ? calculatePurchaseOrderTotals(subtotal, taxRates) : null`; when null, show "—" for VAT, EWT and total (the old float path tolerated negative typing; the server rejects it anyway). Line subtotal math (`:107`) is unchanged. `purchase-orders/page.tsx` (RSC) resolves only when `canCreate` (`:55`) and passes the prop at `:143-147`. |
| 13 | `apps/web/src/app/portal/bom/[token]/page.tsx:15-16` (`:54-57`) | RSC; no session; tenant from the portal token row | Delete the constants. `loadPortalBom` (`sign-actions.ts:243`, which already holds `row.tenant_id`) adds `taxRates: { vatBps, retentionBps }` from `resolveTaxRates(db, row.tenant_id, new Date())` to its `ok` result (type `PortalBomDetail`, `:217`). The page uses `computeVAT(subtotal, taxRates.vatBps)` and `computeRetention(subtotal, taxRates.retentionBps)`. The portal formula is otherwise unchanged (C-5): no EWT, and the VAT flag is not applied. |

### 8.2 Label sites (spec §15: 8 files, plus 1 found in review)

All label sites are RSC unless marked Client. Each one uses `formatBps` from
`@third-code-erp/shared-types`.

| File:line | Today | Change (source of bps per AC-TEN-11) |
|---|---|---|
| `(dashboard)/invoices/[id]/page.tsx:306` | `(inv.retention_bps / 100).toFixed(0)` | `formatBps(inv.retention_bps)` (stored) |
| `…/invoices/[id]/page.tsx:307-308` | `'VAT (12%)'`, `'Withholding Tax (2%)'` | `formatBps(TAX_DEFAULTS.vatBps)` / `.ewtBps` |
| `(dashboard)/purchase-orders/[id]/page.tsx:376-377` | literals | `TAX_DEFAULTS` via `formatBps` |
| `(dashboard)/projects/[id]/billing/page.tsx:129` | `'Standard 10%'` | `` `Standard ${formatBps(taxRates.retentionBps)}` ``. The page resolves once with `resolveTaxRates(db, profile.tenantId, new Date())` after `:58` and reuses the value for the form prop. |
| `components/billing/create-invoice-form.tsx:120-122` (**Client**) | literals | `formatBps(taxRates.retentionBps)`, `formatBps(preview.vatBps)` (applied VAT, so a non-VAT tenant reads "0%"), `formatBps(taxRates.ewtBps)` |
| `components/procurement/create-po-form.tsx:365-366` (**Client**) | literals | `formatBps(taxRates.vatBps)` / `.ewtBps` |
| `(print)/invoices/[id]/print/page.tsx:64` (used `:203`) | `toFixed(0)` + `%` | `formatBps(inv.retention_bps)` (it includes `%`, so drop the literal `%` at `:203`) |
| `…/print/page.tsx:211, 219, 250` | `12% VAT`, `2% —`, `2% creditable` | `TAX_DEFAULTS` via `formatBps` |
| `(print)/invoices/[id]/bir2307/page.tsx:13` (used `:332`) | `'2%'` | `formatBps(TAX_DEFAULTS.ewtBps)` |
| `(print)/purchase-orders/[id]/print/page.tsx:208, 214, 248` | literals | `TAX_DEFAULTS` via `formatBps` |
| `app/portal/bom/[token]/page.tsx:206, 208` (**not in the spec list**) | `VAT (12%)`, `Retention (10%)` | `formatBps(taxRates.vatBps / .retentionBps)` (the rates are already loaded for site 13) |

Not touched:
- the billing-percent labels (`toFixed(0)` on `billing_percent_bps`), which are not tax
  rates;
- the DUPA `vat_bps` defaults (Q1);
- the down-payment invoice (`signed-bom-award.ts:547-551`). Its retention label renders
  "0%" from the stored 0, as today.

## 9. API contracts

No new endpoint. Changed behaviour of existing ones:

| Endpoint | Auth / capability | Change | Errors |
|---|---|---|---|
| `POST v1/projects/:projectId/customer-invoices` | JWT, `finance.issue_invoice` | Rates come from the resolver; the response is unchanged (`retentionBps` = resolved) | new **409** `TAX_PROFILE_OVERLAP: …` (no row, request not completed) |
| `POST v1/procurement/purchase-orders`, `/from-bom`, `/from-bom/grouped` | JWT, `po.create` | Same | new **409** overlap |
| `POST v1/roadmap/procurement/requisitions/:id/workflow` (`convert_to_po`) | existing, plus `po.create` in the service | Same | new **409** overlap |
| `POST v1/roadmap/tax/profiles` | JWT, `finance.manage`, gate | Replay compares the full definition | 401, 403, 503 (gate off, no change), 409 (code reused with a different definition) |
| `POST v1/roadmap/tax/profiles/:id/workflow` | same | `activate` guards (§7.5) | 401, 403 (capability, **or preparer = actor**), 404 (other tenant's id), 409 (not draft / backdated / overlap naming the code), 503 |

Idempotency is unchanged: existing `Idempotency-Key` receipts. A refused write leaves the
receipt in `processing`, which is rolled back with the transaction.

## 10. UI: `/settings/tax` (read-only)

- **Files.**
  - `apps/web/src/app/(dashboard)/settings/tax/page.tsx` (RSC).
  - `apps/web/src/app/(dashboard)/settings/tax/tax-settings.ts`, exporting:
    - `taxSettingsEnabled()`: `process.env.ERP_TENANCY_ENABLED === 'true'`;
    - `loadTaxSettings(tenantId, at)`.
- **Loading and errors.** It reuses `settings/loading.tsx` and `(dashboard)/error.tsx`.
- **Order in the page.** `if (!taxSettingsEnabled()) notFound()`, then
  `requireUserProfile()`, then `requireCapability(profile, 'finance.read')`, then
  `loadTaxSettings(profile.tenantId, new Date())`. Every check runs before the DB is read.
- **`loadTaxSettings`.**
  - It calls `resolveTaxRates(db, tenantId, at)`, so the view shows exactly what a write would
    use.
  - It then runs one list query: `tax_profiles` where `tenant_id = T` and
    `status = 'active'`, ordered by `valid_from`, limit 50.
  - It runs one `users` query: `tenant_id = T` and `id in (created_by, approved_by)`, for the
    names.
  - It returns either
    `{ state: 'ok', rates, inForce | null, upcoming[], lastEnded | null }`
    or, when it catches `TaxProfileOverlapError`, `{ state: 'conflict', profileCodes, asOf }`.
- **Markup.**
  - It reuses the `page-header`/`page-title`/`page-subtitle` and `card`/`card-header`/`card-title`
    classes from `settings/page.tsx`.
  - Subtitle: "Effective rates as of {asOf} (Manila)".
  - A `<table>` with `<th scope="col">` columns Rate, Value and Source. Rows: VAT, EWT,
    Retention (via `formatBps`) and VAT-registered (Yes/No).
  - The source is plain text: "System default", or "Tax profile {code}". When a profile has
    ended: "System default (profile {code} ended on {date})" (§10 of the spec).
  - When a profile is in force: code, name, valid from, valid to ("Open-ended"), prepared by,
    approved by, approved at.
  - Upcoming: "{code}, starts {date}".
  - The locked note is plain text: "Rates are locked and cannot be edited here until the owner
    decides the open tax policy questions."
  - Conflict state: a `role="alert"` panel that names the codes and the date and says invoices
    and POs cannot be created. No rates are shown.
  - **No `form`, `input`, `select`, `textarea` or `button`.**
  - A back link to `/settings`.
- **Wiring.**
  - `nav-config.ts:596-611`: add `'/settings/tax'` to the `FINANCE_ROUTE_ROLES` block.
  - `dashboard-route-inventory.test.ts`: add `'/settings/tax': FINANCE_READ` (near `:275`).
  - `settings/page.tsx:239-245`: inside `canReadFinance`, show
    `{taxSettingsEnabled() && <Link href="/settings/tax">Tax rates</Link>}`.
  - No sidebar item.
- **i18n-ready.** Rates are passed as values (`formatBps`), not concatenated inside sentences.

## 11. Feature flag decision

- **Money paths: no flag.**
  - With 0 profile rows (production fact) the resolver returns `TAX_DEFAULTS`, and the
    output is proven identical by the fixtures and the property tests.
  - A flag would keep the literal code path alive (the thing being removed) and double the
    test matrix for zero risk reduction.
  - Rollback is a code revert: no migration, and the only new data is the extra `tax` key in
    audit diffs.
  - Profile writes stay behind the existing `tax_statutory_outputs` gate, which is the real
    control.
- **View: keep `erp_tenancy` as `ERP_TENANCY_ENABLED=true`, default off.**
  - The spec names it, and it is the only new user-visible surface.
  - It lets the owner decide when Finance sees the "locked pending owner decisions" page,
    separately from the money deploy (see Q-TEN-6).
  - It costs about 5 lines, using the boolean env gate pattern.
  - Document it in `docs/DEPLOYMENT.md` §2. A flip needs a Vercel redeploy (RUNBOOK §1.7).

## 12. Audit and events

- New `tax` key in the existing entries:
  - Core: `writeSemantic` at `customer-invoice-draft-create.service.ts:346`,
    `purchase-order-creation.service.ts:551, 989, 1309` and `roadmap.service.ts:453`.
  - Web: `writeAuditLog*` at `procurement/actions.ts:366, 568, 1000, 1709`.
- Shape: `invoiceTaxAudit` / `purchaseOrderTaxAudit` (§7.1). Invoices record
  `vatBps: 0` when the tenant is not VAT-registered; POs never apply the flag.
- Unchanged: profile create and status-change audits and workflow events. A refused
  activation writes neither. Viewing the page writes nothing. There are no new events or
  webhooks.

## 13. Test plan (AC → test)

Fixture ids are from spec §9. "SR" = shared-types resolver/calculation tests.

| AC | Unit | Integration (real DB, CI `database-reproducibility`) | E2E |
|---|---|---|---|
| 01 | `settings/tax/page.test.tsx`: owner/admin/finance/viewer see 12% / 2% / 10% / Yes, "System default" ×4 and as-of date (R-1) | — | `e2e/abi-ops-tax-settings.spec.ts`; `/settings/tax` added to `viewerRenderablePaths` in `e2e/dashboard-role-local.spec.ts` |
| 02 | page test: in-force R-2 details and names; upcoming R-5; ended note R-3 | — | — |
| 03 | page test: each of the 9 roles without `finance.read` → rejects FORBIDDEN, `resolveTaxRates` not called; route inventory + `canViewPath` | — | — |
| 04 | page test, all 13 roles incl. owner: no `<form`, `<input`, `<select`, `<textarea`, `<button`; locked note present | — | same e2e asserts no form controls |
| 05 | `apps/api/src/roadmap/roadmap.tax-profile.service.spec.ts`: env unset + no flag row → 503, no insert, update, audit or workflow event | `apps/api/integration/tax-rates.http.integration.spec.ts`: 401 (no token), 403 (`pm`), 503 gate off (row count unchanged), 404 cross-tenant profile id with gate on | — |
| 06 | SR: I-1..I-8, PB-1..PB-3, PB-4 cap; API draft spec: I-1 regression (`net 24,750,000`, `retention_bps 1000`, audit `tax` default block); web `actions.invoice.test.ts`: same on the legacy path | HTTP: tenant with no profile → stored amounts + audit `tax.source = 'default'` | existing `billing-milestone-navigation.spec.ts` unchanged |
| 07 | SR: P-1, P-3, P-4; API draft spec with a mocked active row (P-1) → `retention_bps 500`, audit `profileId`/`profileCode` | HTTP: tenant with active profile → profile amounts | — |
| 08 | SR P-2; API + web draft specs: `vat 0`, audit `vatBps 0` | — | — |
| 09 | `purchase-order-money.test.ts`: PO-1..PO-5, PO-7; API `purchase-order-creation.service.spec.ts`: each of 3 paths keeps `989,871` (PO-1) and gets PO-7 and audit `tax`; requisition-to-PO spec (new `roadmap.requisition-po.service.spec.ts`): PO-4 lines, audit `tax`; web `actions.test.ts`: 3 legacy paths PO-1 / PO-7 | HTTP: manual PO create, default vs profile tenant | existing `purchase-order-from-bom-loopback.spec.ts` (30,000 → 33,000) must stay green |
| 10 | PO-6 in `purchase-order-money.test.ts`, `purchaseOrderTaxAudit` unit, one API path | — | — |
| 11 | SR `formatBps`: all 7 C-4 cases + `formatBps(TAX_DEFAULTS.*)` = "12%" / "2%" / "10%"; extend `(print)/invoices/[id]/print/page.test.tsx` ("Retention (10%)", "12% VAT", "2% — BIR Form 2307"), `bir2307/page.test.tsx` ("2%"), billing `page.test.tsx` ("Standard 10%"); form markup tests for both forms | — | — |
| 12 | print page test: stored amounts rendered as stored; `customer-invoice-issue.service.ts` gains no resolver import (grep in done-check) | — | — |
| 13 | SR property test: `computeVAT/EWT/Retention` at defaults equal `Math.round(s*0.12/0.02/0.1)` for every s in 0..3,000,000 and 2,000,000 seeded random s < 10^13; `computeProgressInvoice` PV-1 = I-2; `purchase-order-money.test.ts` property test vs the old float form and PV-2; portal `page.test.tsx` PV-3 | — | — |
| 14 | guard spec G-5 (names A, B stays draft, no write); G-6 passes | — | — |
| 15 | guard spec G-3 refused, G-4 passes (fake timers, today = 2026-11-05 Manila) | — | — |
| 16 | guard spec G-1 → 403 and no audit or workflow event; G-2 → `approved_by` = X | HTTP: G-1 / G-2 with a tenant flag row enabled for the test tenant | — |
| 17 | SR: R-3, R-5 (both days), R-6 via `pickEffectiveTaxRates`; `effectiveTaxProfilesCondition` SQL text | — | — |
| 18 | `packages/database/src/tax/effective-tax-rates.test.ts`: SQL text and params, tenant predicate first | HTTP: tenant U active profile, T none → T defaults, U profile (R-9) | — |
| 19 | SR R-7 (codes sorted); API `resolveTaxRatesForWrite` → 409; API draft spec: overlap → invoice insert not called; web legacy: `{ error }`, no insert; page test conflict state | HTTP: 2 overlapping active rows by direct SQL → 409, invoice count unchanged | — |
| R-8 | resolver unit: `at = 2026-12-31T16:30Z` → `asOf '2027-01-01'` and the SQL params carry it | — | — |
| G-7 | guard spec: replay with flipped `vatRegistered` → 409, no insert | — | — |

**Harness notes.**
- API specs keep the **real** `resolveTaxRates`. Each harness adds one
  `.mockReturnValueOnce({ from: () => ({ where: async () => rows }) })` at the resolver's
  position (after the billed-percent select). This exercises the real default path.
- Web tests already partially mock `@third-code-erp/database` (`importOriginal`). They add
  `resolveTaxRates: mocks.resolveTaxRates`.
- The billing, purchase-orders, portal and settings page tests add the same mock, or a
  `taxRates` field in `loadPortalBom`'s mocked result.

## 14. Tasks (each ≤ ~400 changed lines, each green on its own)

Done-check prefix (worktree, after
`corepack pnpm --config.engine-strict=false install --frozen-lockfile`):
`P="corepack pnpm --config.engine-strict=false"`. Lint (`$P lint`) runs on every task.

| Id | Scope | Files | AC / fixtures | Done-check |
|---|---|---|---|---|
| T1 | Shared domain core | `shared-types/src/tax-rates.ts` (new), `bom/calculations.ts`, `src/index.ts`, `src/__tests__/tax-rates.test.ts` (new), `bom/__tests__/progress-invoice.test.ts` (new) | R-1..R-7, C-4, I-1..I-8, PB-1..PB-4, P-1..P-4, PV-1, the AC-13 property test; ACs 06, 07, 08, 11, 13, 17, 19 (pure part) | `$P --filter @third-code-erp/shared-types test && $P --filter @third-code-erp/shared-types typecheck` |
| T2 | Resolver loader | `database/src/tax/effective-tax-rates.ts` (new) + test, `database/src/index.ts` | AC-18 (SQL), R-8, R-1 / R-7 via a mocked executor | `$P --filter @third-code-erp/database test && … typecheck` |
| T3 | Core API invoice draft | `api/src/common/tax-rates.ts` (new), `finance/customer-invoice-draft-create.service.ts`, its `.spec.ts` | site 4; ACs 06, 07, 08, 19 | `$P --filter @third-code-erp/api exec vitest run src/finance/customer-invoice-draft-create.service.spec.ts && $P --filter @third-code-erp/api typecheck` |
| T4 | Core API POs ×3 | `procurement/purchase-order-creation.service.ts`, its `.spec.ts` (incl. a `bpsHalfUp` vs old percent-form property check over 0..3,000,000) | sites 7, 8, 9; PO-1, PO-6, PO-7; ACs 09, 10, 19 | same pattern on that spec |
| T5 | Requisition-to-PO | `roadmap/roadmap.service.ts` (`:427-460`, `:553-588`), `roadmap/roadmap.requisition-po.service.spec.ts` (new) | site 11; PO-4, PO-7; AC-09 | same pattern |
| T6 | Legacy web money paths | `procurement/actions.ts` (`createInvoice`, 3 PO actions), `lib/operations/purchase-order-money.ts` + test, `actions.invoice.test.ts`, `actions.test.ts`, `scripts/verify-wo-15-commitment-contract.mjs` | sites 5, 10; I-1, P-2, PO-1..PO-7; ACs 06, 08, 09, 10, 19 | `$P --filter @third-code-erp/web exec vitest run src/app/(dashboard)/procurement src/lib/operations/purchase-order-money.test.ts && node --test scripts/verify-wo-15-commitment-contract.test.mjs && $P --filter @third-code-erp/web typecheck` |
| T7 | Previews and their labels | delete `components/billing/invoice-preview.ts` + test; `create-invoice-form.tsx`, `projects/[id]/billing/page.tsx` + test, `create-po-form.tsx`, `purchase-orders/page.tsx` + test, `portal/bom/[token]/page.tsx` + `sign-actions.ts` + test | sites 6, 12, 13; billing note; portal labels; PV-1..PV-3; ACs 11, 13 | web vitest on the touched dirs + typecheck |
| T8 | Document labels (RSC) | `invoices/[id]/page.tsx`, `purchase-orders/[id]/page.tsx`, `(print)/invoices/[id]/print/page.tsx` + test, `bir2307/page.tsx` + test, `(print)/purchase-orders/[id]/print/page.tsx` | ACs 11, 12 | web vitest `src/app/(print)` + typecheck + the zero-literal grep: `rg -n "0\.12\b\|0\.02\b\|1_200n\|\b12n\b\|RETENTION_BPS\|VAT_BASIS_POINTS\|\(12%\|\(2%\|10%\)\|'2%'\|Standard 10%" apps/web/src apps/api/src -g '!*.test.*' -g '!*.spec.*'` → no money or label hits |
| T9 | Gated activation guards | `roadmap/roadmap.service.ts` (`:1039`, `:1083-1099`), `roadmap/roadmap.tax-profile.service.spec.ts` (new) | G-1..G-7; ACs 05, 14, 15, 16 | `$P --filter @third-code-erp/api exec vitest run src/roadmap && … typecheck` |
| T10 | HTTP integration | `api/integration/tax-rates.http.integration.spec.ts` (new) | ACs 05, 06, 07, 09, 16, 18, 19 (real DB) | CI `database-reproducibility` (`vitest run integration`, `ERP_API_INTEGRATION_EXPECTED=1`); it skips locally without `DATABASE_URL` |
| T11 | Read-only view + flag | `settings/tax/page.tsx`, `settings/tax/tax-settings.ts` (new) + `page.test.tsx`, `settings/page.tsx` + `page.test.ts`, `lib/operations/nav-config.ts`, `dashboard-route-inventory.test.ts`, `e2e/abi-ops-tax-settings.spec.ts` (new), `e2e/dashboard-role-local.spec.ts`, `docs/DEPLOYMENT.md` §2 | ACs 01, 02, 03, 04, 19 (view) | web vitest `src/app/(dashboard)/settings src/lib/operations` + typecheck + `tsc -p e2e/tsconfig.json` |
| T12 | Evidence and docs | `docs/erp/reports/tenancy.md`, `STATE.md`, `BACKLOG.md` (D-13 status; new defect: requisition-to-PO line flooring `roadmap.service.ts:583`) | DoD G10 | full gate set: build, typecheck, lint, unit; CI integration and e2e green |

Order:
- T1 → T2 → {T3, T4, T5, T6} → T7 → T8.
- T9 depends on nothing.
- T10 depends on T3 + T9. T11 depends on T1 + T2.

## 15. Risks: what could move an amount, and the test that pins it

| Risk | Pin |
|---|---|
| Core API PO rounding form changes (percent → bps) | The `bpsHalfUp` vs `percentHalfUp` property check at 12 / 2 over 0..3,000,000 (T4); the existing `989,871` assertion (`purchase-order-creation.service.spec.ts:671-674`) |
| Preview float → half-up | AC-13 property tests (T1, T7); PV-1..PV-3 |
| Table retention default 0 leaks in | The resolver never reads column defaults: TAX_DEFAULTS when there are no rows, stored values otherwise. R-1 (no rows → 1000) and P-3 (explicit 0 → 0) |
| Wrong tenant's profile read | SQL-text test (T2); two-tenant HTTP test (T10) |
| Wrong day (UTC or server-local) | The resolver derives the Manila date itself (§7.3); R-8 |
| Non-VAT flag applied to POs, or not applied to invoices | Types: the PO helpers take only `{vatBps, ewtBps}`. C-2 lives only in `computeProgressInvoice`. PO-6, P-2 |
| Moving legacy invoice math into the tx, and standalone PO totals into the tx | I-1 regression on the legacy path; the standalone range-error message test |
| `computeVAT/EWT` default param changes old callers | Existing `calculations.test.ts` 12% / 2% cases stay unchanged |
| Label text drifts for existing documents | `formatBps(1000/1200/200/0)` = today's text; the print page tests assert full strings |
| The overlap guard blocks pages, not only writes | Billing, PO list and portal pages error (fail closed) if 2 active rows ever exist. This is unreachable while writes are gated. Accepted and documented; only the settings view renders the conflict |
| Rates change between the preview render and the submit (Manila midnight) | Unreachable while gated; PRE-2 owns it |

## 16. Spec gaps and open questions (none blocking)

1. Portal BOM labels (`portal/bom/[token]/page.tsx:206, 208`) are missing from the spec's
   label list. The plan includes them, fed from the rates already loaded.
2. Portal VAT for a non-VAT tenant. The spec's C-5 formula omits the flag, and D-TEN-2 says
   "invoices only", so the plan ignores the flag there. This ties to Q-TEN-8.
3. The audit hash covers only `entity_type`, `entity_id`, `action` and `created_at`
   (`apps/api/src/audit/audit.service.ts:82-87`, `apps/web/src/lib/audit.ts:79-84`), not
   `diff`. The `tax` block is append-only but not hash-protected. ADVISORY for the owner;
   unchanged by this module.
4. Architect deviations from spec wording:
   - one shared loader instead of one per app;
   - `computeProgressInvoice` replaces `previewProgressInvoice`;
   - the resolver takes a `Date`.
   Semantics are unchanged.
5. Still owner-open: Q-TEN-5, Q-TEN-6 (BLOCKING for ship: re-confirm 0 rows and gate off at
   release), Q-TEN-8.

Skipped on purpose:
- a new CI literal-scan script (the T8 grep is the review check, per spec §1);
- a DB-backed test inside `packages/database` (the T10 HTTP test covers the loader against a
  real DB);
- a Core API read endpoint for rates (the view is an RSC).
