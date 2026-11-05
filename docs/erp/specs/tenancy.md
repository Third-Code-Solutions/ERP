# Spec: Tenant tax settings (`tenancy`)

Status: domain-reviewed (2026-11-05)
Depends on: — (rbac and audit-log already exist)
Feature flag: `erp_tenancy` (default off). It gates only the read-only tax
settings view. The rate resolver ships ungated, because with no active profile
it returns today's constants, so there is no behaviour change to gate.

Scope (owner and gap report §3 item 1): tenant settings, centred on the tax
profile. Read VAT, EWT and retention rates from the tenant's active, in-date
tax profile in invoice and PO math, and fall back to code constants when there
is none. Rates are **read-only** in the UI. The profile write API stays behind
the existing `tax_statutory_outputs` feature gate until owner questions Q3
(tax timing on retention) and Q7 (Top Withholding Agent status, non-VAT
suppliers) are answered and preconditions PRE-1..PRE-3 (§14) are met.
Observations: [`../oce/tenancy.md`](../oce/tenancy.md).

**Top rule (owner, fixed).** For every existing tenant, every invoice, PO,
billing preview and print **amount** stays identical to the centavo after this
module ships. Production fact (read-only SQL, 2026-11-04): 0 `tax_profiles`
rows and 0 enabled `tax_statutory_outputs` gate rows. So the defaults path is
the only live path. The defaults are VAT 1200 bps, EWT 200 bps and retention
1000 bps. They come from one code constant (`TAX_DEFAULTS`), **never** from
table column defaults (the table's retention default is 0).

**No migration.** Invoices and POs already store their computed amounts, so
documents are already frozen. The draft's rate-snapshot columns are moved to
§14 with the reason (decision D-TEN-6).

## 1. Problem and outcome
- **Problem.** Every invoice and PO uses rates written into the code: 12% VAT,
  2% EWT and 10% retention, in 13 places across 9 files (§15). The
  `tax_profiles` table exists, but no money path reads it. When an owner
  answer changes a rate, or a tenant is non-VAT, someone has to edit code in
  several places. The copies can drift, and the printed labels ("VAT (12%)")
  can disagree with the math.
- **Today.** Finance cannot see which rates the system applies, or why.
- **Outcome.**
  - One resolver gives every money path the same effective rates for a
    tenant on a date.
  - Every new invoice and PO records, in its existing audit entry, the rates
    and the source (profile id or `default`) it was computed with.
  - Every percentage label comes from one formatter fed by stored or
    resolved bps, never from a literal.
  - Finance can see the effective rates and where they come from.
- **Success measures.**
  - Zero rate literals left in invoice, PO, preview or label code outside
    `TAX_DEFAULTS` (grep check in CI review).
  - Amounts on new invoices, POs, previews and prints are identical to
    today's for the same inputs (fixtures I-1..I-8, PB-1..PB-3, PO-1..PO-5,
    PV-1..PV-3).
  - The settings view shows the correct source in all resolution cases
    R-1..R-9.

## 2. Roles
Template role → our role: Owner = `owner`, Admin = `admin`, PM = `pm`,
Estimator/QS = `estimator`, Site engineer = `sd_pm_pe`, Accountant = `finance`,
Viewer = `viewer`. `procurement`, `commercial` and the other roles keep their
current document permissions.

| Role | Needs |
|---|---|
| Accountant (`finance`) | See the effective rates and their source. Trust that invoices and POs use them. Later (gate open) prepare or approve profiles. |
| Owner / Admin | Same view as Finance. Later, prepare or approve profiles. |
| PM, Procurement, Commercial | Create POs and invoices. Rates apply automatically and cannot be overridden. They read the amounts and labels on the document. |
| Viewer | Read-only view of the effective rates. |

## 3. User stories
- `US-TEN-01` As an accountant, I want to see today's effective VAT, EWT and
  retention rates and whether each comes from a tax profile or the system
  default, so that I can confirm what the system will charge.
- `US-TEN-02` As a finance user drafting a progress invoice, I want retention,
  VAT and EWT computed from my tenant's effective rates on the draft date, so
  that every invoice uses one approved source.
- `US-TEN-03` As a procurement user creating a PO by any path, I want VAT and
  EWT computed from the tenant's effective rates, so that all PO paths agree.
- `US-TEN-04` As an accountant, I want each new invoice and PO to record in its
  audit entry the rates and source it was computed with, and its screens and
  prints to label percentages from one formatter, so that the trail and the
  labels stay truthful.
- `US-TEN-05` As a user filling in an invoice or PO form, I want the preview
  to use the same rates and rounding as the server, so that the saved amounts
  match what I saw.
- `US-TEN-06` As the business owner, I want rates locked against editing in the
  UI and the profile write API kept behind its gate, so that tax behaviour
  cannot change before policy is decided.
- `US-TEN-07` As an accountant, I want the system to refuse activating a
  profile that overlaps another active profile or starts in the past, so that
  exactly one rate set applies on any date and issued documents are never
  re-rated.
- `US-TEN-08` As the business owner, I want the person who prepared a profile
  to be unable to activate it, so that a rate change always needs two people.

## 4. Acceptance criteria
`AC-TEN-01` (US-01) View with defaults
- Given tenant T has no active, in-date profile, and I hold `finance.read`
- When I open the tax settings view
- Then I see VAT 12%, EWT 2%, retention 10% and VAT-registered "yes",
  each marked "system default", with today's Manila date as "as of".

`AC-TEN-02` (US-01) View with a profile
- Given T has an active profile covering today
- When I open the view
- Then I see that profile's rates, code, name, valid-from / valid-to,
  preparer, approver and approval time, with the source marked as that profile.
- And any active profile with a later valid-from appears as "upcoming", with
  its start date.

`AC-TEN-03` (US-01, negative) Denied role
- Given I am `pm`, `estimator` or `sd_pm_pe` without `finance.read`
- When I request the view or its data
- Then access is denied (the capability guard's default-deny) and no rates are
  returned.

`AC-TEN-04` (US-06, negative) No edit controls
- Given any role, including `owner`
- When the view renders
- Then it has no input, button or action that creates, edits, activates or
  retires a profile.
- And it shows a note that rates are locked pending owner decisions.

`AC-TEN-05` (US-06, negative) API writes stay gated
- Given the roadmap feature `tax_statutory_outputs` is off for T (env
  `ERP_ROADMAP_TAX_STATUTORY_OUTPUTS_ENABLED` not `true` and no enabled
  tenant flag row)
- When anyone calls the profile create or workflow endpoints
- Then the call is refused by the existing feature gate and no row changes.

`AC-TEN-06` (US-02) Invoice with defaults is unchanged
- Given T has no active profile
- When a progress invoice is drafted through the Core API or the legacy web
  path
- Then subtotal, retention, VAT, EWT and net equal today's results for the same
  inputs (fixtures I-1..I-8).
- And the row stores `retention_bps` 1000 (as today).
- And the draft's audit entry records `vat_bps` 1200, `ewt_bps` 200,
  `retention_bps` 1000, `vat_registered` true, source `default`, as-of date.

`AC-TEN-07` (US-02) Invoice with a profile
- Given T has an active profile P in force on the draft's Manila date
- When an invoice is drafted
- Then retention, VAT and EWT use P's rates (fixtures P-1..P-4).
- And the row stores P's retention bps in `retention_bps`, and the audit entry
  records P's rates and P's id.

`AC-TEN-08` (US-02) Non-VAT profile on an invoice
- Given P is in force and says the tenant is not VAT-registered
- When an invoice is drafted
- Then VAT is 0 and the audit entry records `vat_bps` 0; EWT and retention
  still apply (fixture P-2).

`AC-TEN-09` (US-03) PO on every path
- Given T's effective rates on the PO's Manila creation date
- When a PO is created through any of the 7 paths in §15 (Core API create,
  from BOM, grouped from BOM; legacy web ×3; requisition-to-PO)
- Then VAT and EWT use those rates (fixtures PO-1..PO-7).
- And the PO's audit entry records them and the source.

`AC-TEN-10` (US-03) Tenant VAT status does not touch PO VAT
- Given P says the tenant is not VAT-registered
- When a PO is created
- Then PO VAT is still halfUp(P × effective VAT bps) (fixture PO-6), because
  input VAT is set by the supplier's status, not the buyer's (D-TEN-2).

`AC-TEN-11` (US-04) Labels from one formatter
- Given any invoice or PO
- When its detail screen, form, print page or BIR 2307 print renders
- Then every percentage label is produced by `formatBps` (C-4):
  - invoice retention from the row's stored `retention_bps`;
  - VAT and EWT from `TAX_DEFAULTS` (the only rates any document can carry
    while PRE-1 is unmet);
  - the billing page's "Standard 10%" note from the tenant's effective
    retention bps.
- And for every existing document the label text equals today's
  ("VAT (12%)", "Withholding Tax (2%)", "Retention (10%)").

`AC-TEN-12` (US-04) Legacy documents
- Given an invoice or PO created before this release
- When it renders
- Then its stored amounts are shown unchanged and never recomputed.

`AC-TEN-13` (US-05) Previews equal the server, to the centavo
- Given the invoice form, PO form or portal BOM summary is open
- When the preview recalculates
- Then it uses the effective rates the page loaded from the server and the
  shared half-up functions.
- And for the same inputs it shows exactly today's amounts (fixtures
  PV-1..PV-3; property test over every subtotal 0..3,000,000 and 2,000,000
  random subtotals below 10^13 centavos).

`AC-TEN-14` (US-07, negative) Overlap refused at activation
- Given T has active profile A covering 2027-01-01..open
- When someone activates draft B whose range intersects A's
- Then activation fails with a conflict naming A's code, and B stays draft.

`AC-TEN-15` (US-07, negative) No backdating
- Given draft B with valid-from earlier than today's Manila date
- When someone activates B
- Then activation fails ("valid-from must be today or later") and B stays draft.

`AC-TEN-16` (US-08, negative) Preparer cannot approve
- Given user U created draft B
- When U activates B
- Then activation fails ("the tax profile preparer cannot activate it"),
  B stays draft, and no audit or workflow event is written for it.
- And a different user with `finance.manage` can activate B.

`AC-TEN-17` (US-02/03) Ignored profiles
- Given T's only profiles are draft, retired, expired (valid-to before the
  date) or future (valid-from after the date)
- When a money write happens
- Then the defaults apply and the audit source is `default`.

`AC-TEN-18` (US-02/03, tenant isolation, negative)
- Given tenant U has an active profile and T has none
- When a T user drafts an invoice or PO
- Then T's defaults apply. U's profile is never read (explicit `tenant_id`
  predicate on every query).

`AC-TEN-19` (US-02/03, integrity, negative) Overlap found at write time
- Given two active profiles of T cover the same date (impossible through the
  API; only by direct SQL)
- When an invoice draft or PO is created for that date
- Then the write fails with `TAX_PROFILE_OVERLAP` naming both codes, no row is
  written, the error is logged, and the settings view shows the conflict
  instead of rates.

## 5. Data model (our names, concept level)
**Tax profile** (`tax_profiles`, exists; tenant-owned). No new attributes, no
migration.

| Entity | Attribute | Type | Required | Rules |
|---|---|---|---|---|
| Tax profile | id | uuid | yes | — |
| | tenant | uuid | yes | Composite tenant key. |
| | code | text ≤40 | yes | Unique per tenant, not blank. |
| | name | text ≤160 | yes | — |
| | valid from | date (Manila calendar date) | yes | Inclusive. At activation must be ≥ today's Manila date (D-TEN-1). |
| | valid to | date | no | Inclusive. Null = open-ended. ≥ valid from (DB check `tax_profiles_date_check`). |
| | VAT rate | integer bps 0..10000 | yes | Table default 1200 is never relied on. |
| | EWT rate (`withholding_rate_bps`) | integer bps 0..10000 | yes | One rate for both directions this release (D-TEN-4). |
| | retention rate | integer bps 0..10000 | yes | Table default **0**; the app default is 1000. The create API requires the value, and the resolver uses only stored values or `TAX_DEFAULTS`. Seeds and test fixtures must set it explicitly. |
| | VAT-registered | boolean | yes | Affects customer-invoice output VAT only (D-TEN-2). |
| | BIR form version, statutory config | text / JSON | no | Stored, not used this release. |
| | status | draft / active / retired | yes | "Active" = approved (§6). |
| | created by (preparer), approved by, approved at | uuid / timestamp | created by: yes | Tenant-scoped user keys. approved by ≠ created by (D-TEN-5). |

**Documents (exist, unchanged).**

| Entity | Stored, frozen at creation | Rate stored? |
|---|---|---|
| Invoice | `subtotal_cents`, `retention_cents`, `vat_cents`, `withholding_tax_cents`, `net_amount_cents` | `retention_bps` yes (now written from the resolver); VAT / EWT bps no |
| Purchase order | `subtotal_cents`, `vat_cents`, `withholding_tax_cents`, `total_cents` | no |

Relations:
- Tenant 1 — 0..n tax profiles.
- At most one active profile covers any Manila date per tenant, enforced by
  the activation check under the tenant lock (§6). There is no DB exclusion
  constraint (§14); the resolver fails closed if one is ever bypassed.

**Effective rates** (derived, not stored): `vatBps`, `ewtBps`,
`retentionBps`, `vatRegistered`, `source` (`default` or the profile id and
code), `asOf` (Manila date).

**`TAX_DEFAULTS`** (code constant, `packages/shared-types`, single
definition): `{ vatBps: 1200, ewtBps: 200, retentionBps: 1000,
vatRegistered: true }`. `computeVAT`, `computeEWT`, `computeRetention`,
`purchase-order-money.ts`, the Core API PO paths, requisition-to-PO and both
previews read it instead of their own literals.

## 6. Lifecycle / state machine
The existing table supports **draft → active → retired**. There is no
"superseded" state. A profile is replaced by retiring it (or letting its
valid-to pass) and activating a successor whose range does not overlap any
active profile.

| From | To | Trigger (existing API) | Who | Guard |
|---|---|---|---|---|
| — | draft | create | `finance.manage` + feature gate | Code unique per tenant. Replay with the same code is idempotent only if **every** definition field matches (name, all three rates, VAT-registered, valid from, valid to); otherwise conflict. |
| draft | active (approved) | activate | `finance.manage` + feature gate, **actor ≠ created by** | (1) actor ≠ preparer (D-TEN-5). (2) valid from ≥ today's Manila date (D-TEN-1). (3) no other active profile of the tenant intersects `[valid from, coalesce(valid to, 9999-12-31)]` (exists, `roadmap.service.ts:1085-1099`). All checked under the tenant lock. Sets approved by / approved at. |
| active | retired | retire | `finance.manage` + feature gate | Takes effect immediately: from that moment the resolver ignores the profile and, absent a successor, the defaults apply. |

- **Immutable:** a profile's code, name, rates, VAT flag and dates never change
  after creation. There is no update endpoint. A rate change means a new
  profile.
- Retired is terminal.
- **Documents are frozen at creation.** Their stored amounts never change when
  a profile is later activated, retired or expires. Issue does not recompute
  (D-TEN-3).
- **This release:** guards (1) and (2) and the full-definition replay check
  are added to the gated create / activate code. All three transitions stay
  behind `tax_statutory_outputs`, which stays off for every tenant (§16
  Q-TEN-6). No UI triggers them.
- Each transition already writes a workflow event and a semantic audit entry.
  A refused transition writes neither.

## 7. Permission matrix
| Action | Owner | Admin | PM | Estimator/QS | Site engineer | Accountant | Viewer |
|---|---|---|---|---|---|---|---|
| View effective rates + source (settings view, `finance.read`) | ✓ | ✓ | — | — | — | ✓ | ✓ |
| See amounts and labels on an invoice / PO | per existing document read rights (unchanged) | | | | | | |
| Create invoice / PO (rates auto-applied, no override) | per existing capabilities (unchanged) | | | | | | |
| Edit a rate on a profile | — | — | — | — | — | — | — |
| Create (prepare) a profile | — this release (gate off). Once enabled: `finance.manage` = Owner, Admin, Accountant | | | | | | |
| Activate (approve) a profile | — this release. Once enabled: `finance.manage`, and never the preparer | | | | | | |
| Retire a profile | — this release. Once enabled: `finance.manage` | | | | | | |
| Override a rate on a document | — | — | — | — | — | — | — |

Segregation of duties: preparer ≠ approver on activation, enforced in code
this release (D-TEN-5). It mirrors the PO rule in
`apps/api/src/procurement/purchase-order-workflow.service.ts:380-384`.

## 8. Calculations
**C-0 Units and rounding (applies to all).** Money is integer centavos, rates
are integer bps (10000 = 100%), and every operation is exact integer (bigint)
math with no floats. One rounding rule, half-up, for n ≥ 0, d > 0:
`halfUp(n, d) = (2n + d) div (2d)`. This is today's `roundHalfUp` /
`roundedRatio` (`packages/shared-types/src/bom/calculations.ts:31-61`). The
other forms in use today are the same function for these rates:
- `(v × bps + 5000) div 10000` (legacy web and requisition-to-PO);
- `(v × pct + 50) div 100` (Core API PO `percentHalfUp`): identical to the bps
  form for 12% / 2% (numerator and denominator ×100; brute-force check over
  v = 0..1,999,999: 0 mismatches). It cannot express non-integer percents, so
  those paths switch to the bps form.

Rounding point: each amount is rounded once, where it is computed, then later
amounts use the rounded value (per document, not per line, for VAT / EWT).
All denominators are the constant 10000, so there is no division by zero.
Inputs are non-negative; results that would leave the safe-integer or
`bigint` column range are refused (existing guards).

**C-1 Effective-rate resolution**
- Inputs: tenant T, as-of date D.
- D is the Manila calendar date (`manilaCalendarDate`,
  `packages/shared-types/src/common.ts:42`) of:
  - an invoice draft's creation (D-TEN-3);
  - a PO's creation;
  - "now", for a preview or the settings view.
- Candidates: T's profiles with status `active`, valid from ≤ D, and (valid
  to null or valid to ≥ D).
- Result:
  - 0 candidates → `TAX_DEFAULTS`, source `default`.
  - 1 candidate → its VAT bps, EWT bps, retention bps and VAT flag, source =
    that profile.
  - ≥ 2 candidates → error `TAX_PROFILE_OVERLAP` with the codes; the caller
    aborts the write (integrity guard only; §6 prevents this).
- Read in the same transaction as the money write.
- One pure shared function picks from the candidate rows. Each app loads the
  rows with an explicit `tenant_id` predicate.

**C-2 Progress invoice** (order and base unchanged from today; the D-7 base
question waits on Q3). Inputs: contract value TCV (latest approved BOM, cents),
this invoice's billing percentage `billBps`, effective rates.
1. S (subtotal) = halfUp(TCV × billBps, 10000)
2. R (retention) = halfUp(S × retentionBps, 10000)
3. B (VAT/EWT base) = S − R
4. V (output VAT) = vatRegistered ? halfUp(B × vatBps, 10000) : 0
5. W (creditable EWT) = halfUp(B × ewtBps, 10000)
6. N (net receivable) = B + V − W

Stored: S, R, V, W, N and `retention_bps`. Audit entry: vatBps (0 when not
VAT-registered), ewtBps, retentionBps, vatRegistered, source, asOf.
Each invoice bills its own `billBps` of TCV; the cumulative cap
Σ billBps ≤ 10000 is enforced (D-6). Retention held to date = Σ R over the
project's progress invoices. Note: at 1200 bps VAT can never tie (B × 1200 /
10000 = 3B/25, whose fraction is a multiple of 0.04), so VAT tie fixtures need
another rate.

**C-3 Purchase order** (base unchanged).
1. P = Σ PO line totals (unchanged; each path keeps its own line math)
2. VAT = halfUp(P × vatBps, 10000)
3. EWT = halfUp(P × ewtBps, 10000)
4. Total = P + VAT − EWT

The tenant's VAT-registered flag is **not** applied to POs (D-TEN-2). Audit
entry: vatBps, ewtBps, source, asOf.

**C-4 Label formatter `formatBps(bps)`**: percent = bps ÷ 100, printed with up
to 2 decimals and no trailing zeros, followed by "%" (1200 → "12%", 200 →
"2%", 1000 → "10%", 1250 → "12.5%", 125 → "1.25%", 0 → "0%"). Integer math
only: `whole = bps div 100`, `frac = bps mod 100`. Replaces
`(bps / 100).toFixed(0)`, which would print 1250 as "13%".

**C-5 Previews** (same formulas as the server, rates passed from the server):
- Invoice form: C-2 via `previewProgressInvoice(tcv, billBps, rates)`.
- PO form: lines summed as today, then C-3 steps 2-4 with the shared helper,
  replacing `Math.round(subtotal × 0.12)` / `× 0.02`.
- Portal BOM summary (`portal/bom/[token]/page.tsx:54-57`): keeps **its own
  formula**, unchanged: VAT = halfUp(TCV × vatBps), retention =
  halfUp(TCV × retentionBps), payable = TCV + VAT − retention (no EWT). Only
  the constants and `Math.round` change.
- Equivalence (why the top rule holds): for an integer subtotal s ≥ 0,
  `Math.round(s × 0.12)`, `Math.round(s × 0.02)` and `Math.round(s × 0.1)`
  equal halfUp at 1200 / 200 / 1000 bps. 12% never ties; at 2% and 10% the
  doubles for 0.02 and 0.1 are slightly above the true values, so a tie lands
  on or above x.5 and rounds up, the same as half-up. Checked: 0 mismatches
  over every s in 0..2,999,999 and 2,000,000 random s below 10^13.

## 9. Worked examples (added/verified by domain expert — become test fixtures)
All values are integer centavos (₱1 = 100). Bracketed values are the exact
quotient before rounding. Every default-path expected value was recomputed
on 2026-11-05 with the shared functions and equals today's code output.

**Resolution C-1** (T = the tenant; dates are Manila dates)

| Case | Profiles of T | D | Expected |
|---|---|---|---|
| R-1 none | — | 2026-11-04 | `TAX_DEFAULTS`, source default |
| R-2 in force | A active 2026-01-01..2026-12-31 | 2026-11-04 | A |
| R-3 expired | A active ..2026-10-31 | 2026-11-04 | defaults |
| R-4 last day inclusive | A active ..2026-11-04 | 2026-11-04 | A |
| R-5 future, first day inclusive | B active from 2027-01-01 | 2026-12-31 / 2027-01-01 | defaults / B |
| R-6 draft or retired only | A draft, C retired, both covering D | 2026-11-04 | defaults |
| R-7 overlap (direct SQL only) | A and C active, both covering D | 2026-11-04 | `TAX_PROFILE_OVERLAP` (A, C); no write |
| R-8 Manila midnight | none; write at 2026-12-31T16:30Z | — | D = 2027-01-01 |
| R-9 other tenant | U has A active covering D; T none | 2026-11-04 | T gets defaults |

**Activation guards §6** (actor X, preparer Y, today 2026-11-05 Manila)

| Case | Setup | Expected |
|---|---|---|
| G-1 preparer activates | B created by X; X activates | refused, B draft |
| G-2 maker-checker | B created by Y; X activates | active, approved by X |
| G-3 backdated | B valid from 2026-11-04 | refused, B draft |
| G-4 starts today | B valid from 2026-11-05 | active |
| G-5 overlap | A active 2027-01-01..open; B 2027-06-01..2027-12-31 | refused, names A |
| G-6 adjacent | A active ..2026-12-31; B from 2027-01-01 | active |
| G-7 replay differs | replay of code B with VAT-registered flipped | conflict, no change |

**Invoice C-2, default path** (VAT 1200 / EWT 200 / retention 1000, VAT-registered; must equal today)

| Case | Inputs (TCV; billBps) | Intermediate | Expected N |
|---|---|---|---|
| I-1 normal | 100,000,000; 2500 | S 25,000,000; R 2,500,000; B 22,500,000; V 2,700,000; W 450,000 | 24,750,000 (= `customer-invoice-draft-create.service.spec.ts:343`) |
| I-2 messy | 1,234,567; 3333 | S 411,481 [411,481.1811]; R 41,148 [41,148.1]; B 370,333; V 44,440 [44,439.96]; W 7,407 [7,406.66] | 407,366 |
| I-3 tie on retention, tiny | 50; 1000 | S 5; R 1 [0.5]; B 4; V 0 [0.48]; W 0 [0.08] | 4 |
| I-4 tie on EWT, tiny | 280; 1000 | S 28; R 3 [2.8]; B 25; V 3 [3.0]; W 1 [0.5] | 27 |
| I-5 tie on retention, real | 12,345,650; 1000 | S 1,234,565; R 123,457 [123,456.5]; B 1,111,108; V 133,333 [133,332.96]; W 22,222 [22,222.16] | 1,222,219 |
| I-6 tie on EWT, real | 10,000,280; 1000 | S 1,000,028; R 100,003 [100,002.8]; B 900,025; V 108,003 [108,003.0]; W 18,001 [18,000.5] | 990,027 |
| I-7 zero billing | 100,000,000; 0 | S 0; R 0; B 0; V 0; W 0 | 0 |
| I-8 100% in one billing | 100,000,000; 10000 | S 100,000,000; R 10,000,000; B 90,000,000; V 10,800,000; W 1,800,000 | 99,000,000 |

**Retention across progress billings, default path** (TCV 987,654,321 = ₱9,876,543.21)

| Case | billBps (cumulative) | Intermediate | N | Retention held to date |
|---|---|---|---|---|
| PB-1 1st billing | 2000 (2000) | S 197,530,864 [197,530,864.2]; R 19,753,086 [19,753,086.4]; B 177,777,778; V 21,333,333 [21,333,333.36]; W 3,555,556 [3,555,555.56] | 195,555,555 | 19,753,086 |
| PB-2 2nd billing | 1750 (3750) | S 172,839,506 [172,839,506.175]; R 17,283,951 [17,283,950.6]; B 155,555,555; V 18,666,667 [18,666,666.6]; W 3,111,111 [3,111,111.1] | 171,111,111 | 37,037,037 |
| PB-3 3rd billing | 3000 (6750) | S 296,296,296 [296,296,296.3]; R 29,629,630 [29,629,629.6]; B 266,666,666; V 32,000,000 [31,999,999.92]; W 5,333,333 [5,333,333.32] | 293,333,333 | 66,666,667 |
| PB-4 cap | 3300 more (10050) | refused by the D-6 cap; no row | — | 66,666,667 |

Note: Σ R = 66,666,667 happens to equal halfUp(ΣS × 1000, 10000) =
halfUp(666,666,666 × 1000, 10000) = 66,666,667 here, but the two need not
agree in general. Retention is rounded per invoice, and the held total is the
sum of stored R, never recomputed.

**Invoice C-2, profile path** (resolver and money-function tests; unreachable in production this release)

| Case | Profile (VAT / EWT / ret / VAT-reg) | Input | Intermediate | Expected N |
|---|---|---|---|---|
| P-1 VAT 1200, lower EWT and retention | 1200 / 100 / 500 / yes | S 25,000,000 | R 1,250,000; B 23,750,000; V 2,850,000; W 237,500 | 26,362,500 |
| P-2 non-VAT tenant | 1200 / 200 / 1000 / no | S 25,000,000 | R 2,500,000; B 22,500,000; V 0 (audit vatBps 0); W 450,000 | 22,050,000 |
| P-3 zero retention | 1200 / 200 / 0 / yes | S 25,000,000 | R 0; B 25,000,000; V 3,000,000; W 500,000 | 27,500,000 |
| P-4 profile on PB-1 inputs | 1200 / 200 / 500 / yes | TCV 987,654,321; billBps 2000 → S 197,530,864 | R 9,876,543 [9,876,543.2]; B 187,654,321; V 22,518,519 [22,518,518.52]; W 3,753,086 [3,753,086.42] | 206,419,754 |

**PO C-3**

| Case | Rates (VAT / EWT) | P | Intermediate | Expected total |
|---|---|---|---|---|
| PO-1 messy, defaults | 1200 / 200 | 899,883 | VAT 107,986 [107,985.96]; EWT 17,998 [17,997.66] | 989,871 (= `purchase-order-creation.service.spec.ts:671-674`) |
| PO-2 tie, tiny, defaults | 1200 / 200 | 25 | VAT 3 [3.0]; EWT 1 [0.5] | 27 |
| PO-3 round, defaults | 1200 / 200 | 10,000,000 | VAT 1,200,000; EWT 200,000 | 11,000,000 |
| PO-4 lines, defaults | 1200 / 200 | 120 × 28,550 = 3,426,000; 2,500 × 1,875 = 4,687,500; 37 × 51,235 = 1,895,695 → P 10,009,195 | VAT 1,201,103 [1,201,103.4]; EWT 200,184 [200,183.9] | 11,010,114 |
| PO-5 tie, real, defaults | 1200 / 200 | 1,234,575 | VAT 148,149 [148,149.0]; EWT 24,692 [24,691.5] | 1,358,032 |
| PO-6 non-VAT tenant profile | 1200 / 200, VAT-reg no | 899,883 | VAT 107,986 (flag ignored); EWT 17,998 | 989,871 |
| PO-7 profile EWT 1% | 1200 / 100 | 899,883 | VAT 107,986; EWT 8,999 [8,998.83] | 998,870 |

**Previews C-5** (defaults; must equal today's float output and the server)

| Case | Input | Expected |
|---|---|---|
| PV-1 invoice form | TCV 1,234,567; billBps 3333 | same as I-2 (N 407,366) |
| PV-2 PO form | subtotal 1,234,575 | VAT 148,149; EWT 24,692; total 1,358,032 (= PO-5); `Math.round` gives the same |
| PV-3 portal BOM | TCV 1,234,565 | VAT 148,148 [148,147.8]; retention 123,457 [123,456.5]; payable 1,259,256 |

**Labels C-4**: 1200 → "12%"; 200 → "2%"; 1000 → "10%"; 0 → "0%"; 1250 →
"12.5%"; 125 → "1.25%"; 10000 → "100%".

## 10. Validations and edge cases
- **No profile** (every tenant today): defaults apply; output identical to
  today (I-1..I-8, PB-1..PB-3, PO-1..PO-5, PV-1..PV-3).
- **Expired profile:** ignored from the day after valid to. The settings view
  shows "default (profile X ended on D)".
- **Future-dated profile:** ignored until valid from; listed as upcoming. A
  document dated on its first day uses it (R-5).
- **Overlap:** refused at activation under the tenant lock (G-5). If direct
  SQL ever creates one, resolution fails closed (R-7, AC-TEN-19).
- **Backdating:** refused at activation (G-3), so no profile can start on a
  date for which documents may already exist.
- **Draft created before a rate boundary, issued after it:** amounts stay as
  drafted; issue does not recompute (D-TEN-3). Unreachable while the gate is
  off; PRE-2 closes it before the gate opens.
- **Down-payment invoice** (`packages/operations/src/signed-bom-award.ts:547-551`):
  stores retention 0, VAT 0 and EWT 0, pending D-11 / Q4. It does not call the
  resolver. Its labels: retention from its stored 0 bps ("0%"); VAT / EWT
  labels unchanged from today (D-11 owns the fix).
- **Legacy rows:** stored amounts are never recomputed.
- **Retention 0 in a profile** is valid (P-3).
- **Rates at the bounds** 0 or 10000 are allowed by the table. A
  configuration whose net would go negative is not reachable with today's
  rates; once writes open, the money write refuses a negative N or Total.
- **Previews** must not change any amount (C-5 equivalence, AC-TEN-13). The
  earlier draft's "may move by ₱0.01" allowance is withdrawn.
- **Concurrency:** the resolver reads in the write's transaction. The invoice
  path holds the project row lock; activation takes the tenant lock. No new
  lock is needed while writes are gated.
- **Volume:** a few profiles per tenant. Not a concern.

## 11. Integrations
- **Out to:**
  - invoicing: Core API draft, legacy web draft, invoice form preview;
  - procurement: Core API create / from BOM / grouped from BOM, legacy web ×3,
    PO form preview;
  - roadmap requisition-to-PO;
  - client portal BOM summary;
  - invoice and PO detail screens, forms, prints, the billing page and the
    BIR 2307 print (labels).
- **In from:** none. Profiles are written only through the existing gated
  roadmap API.
- **Not affected:** supplier bills (VAT and EWT keyed in by the user), DUPA
  pricing VAT (per-DUPA `vat_bps`, Q1 / D-2), the statutory outputs API,
  `calculateTax` / `calculateTaxByProfile` (single-base helper; not used for
  invoices, §15 gap 3).
- **Events:** none new.
- **Import / export:** none.

## 12. Audit
- Existing, unchanged: profile create and status change each write a semantic
  audit entry and a workflow event.
- New: each money path's existing audit write (Core API `writeSemantic`,
  legacy web `writeAuditLog*`) adds `tax: { vatBps, ewtBps, retentionBps
  (invoices), vatRegistered, source, profileCode, asOf }`. This is the
  immutable record of the rates used (the hash-chained audit log), replacing
  the draft's snapshot columns.
- Refused activations (G-1, G-3, G-5) write no profile audit entry; the HTTP
  error is logged.
- Viewing the settings page writes no audit entry.

## 13. Non-functional
- The resolver adds one tenant-scoped indexed read per money write (tiny
  table, < 5 ms p95). The invoice and PO create p95 budget is unchanged.
- The settings view renders in < 1 s and shows at most 50 profiles (no
  pagination needed).
- All labels and messages are i18n-ready: rates go through `formatBps`, not
  string concatenation inside sentences.
- Accessibility: the rates table uses header cells, the source is shown as
  text (not colour alone), and the locked state is announced as text.

## 14. Out of scope (Later)
- **Rate-snapshot columns on invoices and POs** (`vat_bps`, `ewt_bps`,
  `tax_profile_id`). Reason (D-TEN-6): every amount is already stored, so
  documents are frozen; invoices already store `retention_bps`; the rates and
  source are recorded in the audit entry. The only thing stored amounts cannot
  give is a truthful VAT / EWT **percentage label** on a document computed at
  a non-default rate, and no such document can exist while profile writes are
  gated. They become **PRE-1** below.
- **Preconditions before `tax_statutory_outputs` is enabled for any tenant**
  (owner decision required; none is met today):
  - PRE-1: expand-only migration adding the snapshot columns above, written
    by every money path, and labels switched to them.
  - PRE-2: the invoice issue action refuses when the effective rates on the
    issue Manila date differ from the draft's (EOPT: output VAT follows the
    invoice date); the user cancels and re-drafts.
  - PRE-3: owner answers Q3 and Q7, and the PH rates checked against primary
    BIR texts (STATE blockers).
- Editing rates in the UI.
- Per-counterparty VAT and EWT (D-9, Q7): payee type, ATC, Top Withholding
  Agent 1% goods / 2% services, non-VAT suppliers, government 5% final VAT.
- Separate EWT rates per direction (D-TEN-4).
- Contract-level retention (D-13 contract part; `contracts` module, Q3).
- Retention tax timing and the VAT / EWT base (D-7, Q3). VAT inside the DUPA
  rate (D-2, Q1). DP invoice tax (D-11, Q4).
- Non-VAT invoice wording ("not valid for claim of input tax") and
  percentage-tax handling for non-VAT tenants.
- Per-document rate overrides.
- A DB exclusion constraint (`btree_gist`, daterange) against overlapping
  active profiles.
- Other tenant settings named in the survey: currency, fiscal year, business
  calendar UI, company TIN / branch / BIR registration fields.
- Using `bir_form_version` or the statutory configuration; BIR 2307 ATC and
  quarter.
- Group companies and branches.

## 15. Gap vs current implementation (only if module partly exists)
**Exists.**
- `tax_profiles`: `packages/database/src/schema/roadmap.ts:451-489`; DDL in
  `supabase/migrations/20260921181036_roadmap_integrations_foundation.sql:620-651`
  (status, rates, code and `valid_to ≥ valid_from` checks).
- Create, activate and retire: `apps/api/src/roadmap/roadmap.service.ts:1018-1112`,
  with idempotent replay, an overlap check on activate (`:1085-1099`), audit,
  and workflow events, all under the tenant lock.
- `calculateTaxByProfile` (`:1114-1123`) resolves an active in-date profile
  by id.
- Routes: `apps/api/src/roadmap/roadmap.controller.ts:195-226`, all
  `finance.manage`, all behind the `tax_statutory_outputs` feature gate.
- Shared schema and `calculateTax`:
  `packages/shared-types/src/erp-api/roadmap.ts:274-331, 527-546`.

**Gaps.**
1. No money path reads `tax_profiles`.
2. No "effective profile for tenant on date" lookup; the existing lookup needs
   a profile id.
3. `calculateTax` puts VAT, EWT and retention on one base, while invoices
   take VAT and EWT on (S − R). Do not reuse it for invoices.
4. POs store no rates; invoices store only `retention_bps` (kept; §14).
5. The table's retention default is 0, while the app default is 1000.
6. No maker-checker on activation (activate sets `approved_by` to the caller
   without comparing to `created_by`).
7. No backdating guard on activation.
8. Idempotent replay compares only name and the three rates
   (`roadmap.service.ts:1037-1040`); a replay with a different VAT flag or
   dates silently returns the existing profile.
9. No read-only settings view.
10. No DB guard against overlapping active profiles (§14).

**Hardcoded rate sites (math): 13 in 9 files** (line numbers checked on
`8293f798`).

| # | File:line | What |
|---|---|---|
| 1 | `packages/shared-types/src/bom/calculations.ts:241-243` | `computeVAT` fixed 1200 bps |
| 2 | `packages/shared-types/src/bom/calculations.ts:246-248` | `computeEWT` fixed 200 bps |
| 3 | `packages/shared-types/src/bom/calculations.ts:251` | `computeRetention` default 1000 bps |
| 4 | `apps/api/src/finance/customer-invoice-draft-create.service.ts:44` (used `:272`, `:315`; VAT / EWT `:274-275`) | `RETENTION_BPS = 1_000`, Core API invoice draft |
| 5 | `apps/web/src/app/(dashboard)/procurement/actions.ts:921` (`:926-929`) | `retentionBps = 1_000`, legacy web invoice draft |
| 6 | `apps/web/src/components/billing/invoice-preview.ts:8` (`:14-17`) | `RETENTION_BPS`, invoice preview |
| 7 | `apps/api/src/procurement/purchase-order-creation.service.ts:501-502` | grouped-from-BOM PO, `percentHalfUp(…, 12n / 2n)` |
| 8 | `apps/api/src/procurement/purchase-order-creation.service.ts:871-872` | from-BOM PO |
| 9 | `apps/api/src/procurement/purchase-order-creation.service.ts:1199-1200` | manual PO create |
| 10 | `apps/web/src/lib/operations/purchase-order-money.ts:2-3` (callers `procurement/actions.ts:311, 516, 1667`) | `VAT_BASIS_POINTS 1_200n`, `WITHHOLDING_TAX_BASIS_POINTS 200n`, legacy web POs |
| 11 | `apps/api/src/roadmap/roadmap.service.ts:587-588` | requisition-to-PO, `1_200n` / `200n` |
| 12 | `apps/web/src/components/procurement/create-po-form.tsx:109-110` | PO preview, float `0.12` / `0.02` |
| 13 | `apps/web/src/app/portal/bom/[token]/page.tsx:15-16` (`:55-57`) | portal BOM summary, `VAT_BPS` / `RETENTION_BPS`, float `Math.round` |

**Hardcoded labels: 8 files.**
- `apps/web/src/app/(dashboard)/invoices/[id]/page.tsx:306-308` (retention uses `toFixed(0)`)
- `apps/web/src/app/(dashboard)/purchase-orders/[id]/page.tsx:376-377`
- `apps/web/src/app/(dashboard)/projects/[id]/billing/page.tsx:129` ("Standard 10%")
- `apps/web/src/components/billing/create-invoice-form.tsx:120-122`
- `apps/web/src/components/procurement/create-po-form.tsx:365-366`
- `apps/web/src/app/(print)/invoices/[id]/print/page.tsx:64, 211, 219, 250`
- `apps/web/src/app/(print)/invoices/[id]/bir2307/page.tsx:13` (used `:332`)
- `apps/web/src/app/(print)/purchase-orders/[id]/print/page.tsx:208, 214, 248`

**Related, not changed here.**
- `invoices.retention_bps` column default 1000
  (`packages/database/src/schema/invoices.ts:35`).
- DUPA `vat_bps` default 1200 (`packages/database/src/schema/dupas.ts:34`;
  `20260812180000_wo_06_dupa_engine.sql:213`), which belongs to Q1 / D-2.
- DP invoice VAT and EWT of 0 (`packages/operations/src/signed-bom-award.ts:550-551`),
  which belongs to D-11.
- **New finding (ADVISORY, not changed: it would change amounts):**
  requisition-to-PO line total `(quantity_micros × unit) / 1,000,000`
  (`roadmap.service.ts:583`) floors instead of rounding half-up for
  fractional quantities. Add to the defect list.
- **New finding (ADVISORY):** the portal BOM summary charges VAT and
  retention on the full TCV with no EWT, unlike the invoice formula (C-5).
  Kept as is (top rule); belongs to D-7 / Q1.
- Invoice numbers use the UTC month (Core) or server-local month (web), not
  the Manila month used for the as-of date. Not money; noted only.

**Smallest build.**
1. Add `TAX_DEFAULTS` and `formatBps` to `packages/shared-types`; give
   `computeVAT` and `computeEWT` an optional bps argument defaulting to
   `TAX_DEFAULTS`, like `computeRetention`.
2. Add one pure resolver and a tenant-scoped loader per app.
3. Pass the resolved rates into the 13 sites; Core API PO paths switch from
   `percentHalfUp(…, 12n)` to the bps half-up.
4. Add the `tax` block to each path's existing audit write.
5. Labels through `formatBps` (AC-TEN-11).
6. Gated activation guards: preparer ≠ approver, no backdating; full-definition
   replay check.
7. Read-only view behind `erp_tenancy`.
8. Tests: every fixture in §9 verbatim, the preview property test, and a
   regression test per money path asserting today's amounts.

## 16. Open questions
**Decisions taken in domain review (conservative, PH practice).**
- **D-TEN-1 Overlap (recon Q-TEN-1).** Prevent at activation: no
  intersection with another active profile (exists) and valid from ≥ today's
  Manila date (new). Resolution is then always unambiguous. The resolver keeps
  a fail-closed `TAX_PROFILE_OVERLAP` only as an integrity guard against
  direct SQL. Reason: issued invoices are BIR documents that cannot be deleted
  or silently re-rated, and a rate change in PH law is never retroactive.
- **D-TEN-2 Non-VAT tenant (Q-TEN-2).** Zero output VAT on customer invoices
  only. EWT and retention still apply (EWT on contractor income does not
  depend on VAT status). PO VAT stays the effective VAT rate and ignores the
  tenant flag: input VAT is the supplier's output VAT, charged by a
  VAT-registered supplier whatever the buyer's status. The supplier side
  (non-VAT suppliers) is D-9 / Q7, `contacts` module.
- **D-TEN-3 Effective date (Q-TEN-3).** The Manila calendar date of draft
  creation for invoices and of creation for POs. Amounts are frozen there, as
  today; issue does not recompute. Under EOPT (RA 11976, RR 7-2024) output VAT
  follows the invoice date, so before rates can differ across dates, PRE-2
  makes issue refuse when the issue-date rates differ from the draft's.
- **D-TEN-4 EWT direction (Q-TEN-4).** One EWT rate for both directions
  (client withholds from the tenant on invoices; tenant withholds from
  suppliers on POs) until Q7. This is exactly today's behaviour.
- **D-TEN-5 Maker-checker (Q-TEN-7).** Activation is refused when the actor
  is the profile's creator, shipped now in the gated path, consistent with the
  PO distinct-actor rule (`purchase-order-workflow.service.ts:380-384`).
- **D-TEN-6 Migration.** None. Snapshot columns move to §14 as PRE-1.

**Still open (owner).**
- **Q-TEN-5 (ties to Q3).** Is 10% the right tenant default, or only a
  contract term? The spec keeps 10% as the fallback.
- **Q-TEN-6 (BLOCKING for ship).** At release, a read-only production check
  must re-confirm that no tenant has `tax_statutory_outputs` enabled (no env
  var, no tenant flag row) and that `tax_profiles` has 0 rows (both true on
  2026-11-04). Owner to confirm: the gate stays off for every tenant until
  PRE-1..PRE-3 are met.
- **Q-TEN-8 (ADVISORY, ties to Q1).** The portal BOM summary shows clients
  TCV + VAT on full TCV − retention on full TCV, with no EWT. Keep, or align
  with the invoice formula once Q1 / Q3 are answered?

## 17. Domain review
Reviewer: `erp-domain-expert`, 2026-11-05. Status set to domain-reviewed.

**BLOCKING (all fixed in this revision).**
1. §10 allowed previews to "move by at most ₱0.01". That breaks the top rule
   (billing preview amounts must stay identical). Replaced by C-5 with a
   proof and a property test; the float and half-up forms are identical at
   1200 / 200 / 1000 bps (0 mismatches over 5,000,000 subtotals).
2. No maker-checker on profile activation (missing control). Now D-TEN-5,
   enforced in the gated activate path this release (AC-TEN-16, G-1/G-2).
3. Labels depended on snapshot columns that are now out of scope. Defined a
   source for every label (AC-TEN-11, C-4) that is truthful for every
   document that can exist while the gate is off; label text for existing
   documents is unchanged.
4. Overlap handling was "fail at billing time" in practice. Now prevented at
   activation, plus no backdating (D-TEN-1); write-time failure is an
   integrity guard only.

**ADVISORY.**
- Idempotent replay ignored the VAT flag and dates (§15 gap 8); fixed in the
  smallest build.
- `(bps / 100).toFixed(0)` would mislabel 1250 bps as "13%"; replaced by
  `formatBps`.
- Table retention default 0 vs app 1000: resolver reads only stored values or
  `TAX_DEFAULTS`; seeds must set retention explicitly.
- Core API PO `percentHalfUp` (percent form) cannot express non-integer
  percents; switched to bps form (identical at 12% / 2%).
- New defect: requisition-to-PO line total floors (`roadmap.service.ts:583`).
- Portal BOM summary formula differs from invoices (Q-TEN-8).
- Progress billing here is per-invoice % of TCV, not "work done to date −
  previous certified"; the IPC model belongs to `payment-apps` (Q5).

**Changes made and why.**
- Added the top rule, the `TAX_DEFAULTS` constant and "no migration" to the
  header; removed snapshot columns from §5, AC-TEN-06..09 and US-TEN-04, and
  moved them to §14 with the reason and PRE-1..PRE-3.
- Recorded rates and source in the existing audit writes instead (§12).
- Numbered decisions D-TEN-1..6 (§16) for recon questions (a)–(e) and the
  migration.
- Added activation guards and their fixtures G-1..G-7; new US-TEN-07/08,
  AC-TEN-14..16, AC-TEN-19.
- Added C-0 (units, one rounding rule, rounding point, equivalence of the
  three half-up forms) and C-5 (previews, including the portal formula kept
  as is).
- Re-verified every existing fixture (I-1..I-4, P-1..P-3, old PO-1..PO-5)
  against the shared functions; all match today's code. Old PO-4 / PO-5 are
  now PO-6 / PO-7. Added I-5..I-8 (real half-up ties, zero, 100%), PB-1..PB-4
  (retention across progress billings and the cap), P-4, PO-4 (lines),
  PO-5 (real EWT tie), PV-1..PV-3, R-9, G-1..G-7 and label cases.
- Fixed terminology: subtotal / retention / VAT-EWT base / output VAT /
  creditable EWT / net receivable; "active" = approved; preparer / approver.
- Refreshed line references against `8293f798` and added three new findings
  to §15.
