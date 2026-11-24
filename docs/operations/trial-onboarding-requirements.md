# Trial onboarding requirements (engineering)

Date: 2026-11-23. Scope: what a trial company must provide before and during a supervised
30-day trial, and what the operator must configure. Derived only from code, schema,
importers, seed and bootstrap scripts on branch `fix/trial-readiness-pass-1`, working tree
included. Decision record for the trial itself: [`../erp/reports/02-trial-readiness.md`](../erp/reports/02-trial-readiness.md).
Customer-facing version: [`trial-onboarding-checklist.md`](trial-onboarding-checklist.md).

Path prefixes used below:

| Prefix | Path |
|---|---|
| `web/` | `apps/web/src/` |
| `dash/` | `apps/web/src/app/(dashboard)/` |
| `api/` | `apps/api/src/` |
| `st/` | `packages/shared-types/src/` |
| `mig/` | `supabase/migrations/` |

**Tree caveat.** These files are untracked (not committed, not on `main`, not live):
`scripts/bootstrap-trial-tenant.mjs`, `scripts/check-trial-flags.mjs`,
`scripts/import-material-items.mjs`, `scripts/lib/trial-*.mjs`,
`scripts/lib/material-items-import.mjs`, `scripts/lib/tenant-script-db.mjs`,
`docs/erp/trial-flags.json`, and migrations `mig/20261118*`. RUNBOOK §6 (the trial-tenant
procedure) is an uncommitted edit. Anything below that depends on them is "ready in the
tree", not "ready in production".

## 1. How the data gets in

Only three kinds of company data have a file importer: takeoff quantities, bank
statements and project schedules. A fourth, material items, has a command-line importer
that needs database access. Everything else is typed into a screen one record at a time,
seeded by the operator's bootstrap script, or (for a few items) only reachable through
the API or SQL.

| Route in | What uses it |
|---|---|
| Screen, one record at a time | Accounts, opportunities, projects, vendors, rate cards, material items, cost codes, ledger accounts, users |
| File importer in the app | Takeoff CSV/XLSX, bank statement CSV, master schedule CSV, MS Project XML |
| Operator script (database URL) | Chart of accounts, fiscal period, cash accounts, units, unit aliases, warehouse, cost codes (`scripts/bootstrap-trial-tenant.mjs`); material items (`scripts/import-material-items.mjs`) |
| API or SQL only | Tax profiles (`POST tax/profiles`), `tenant_feature_flags` rows, price lists |
| Not possible | Contacts, branches/departments, consent records, client TIN, invoice series |

## 2. Requirements by area

Legend for **Need**: R = required before the flow works, R-flow = required only for the
named flow, O = optional.

### 2.1 Legal and tax identity (`tenants`)

| Item | Why / where used | Format | Need | How it gets in | Evidence |
|---|---|---|---|---|---|
| Registered company name | `tenants.name` NOT NULL; printed on invoice and BIR 2307 | 1-255 chars | R | Platform create, `/settings` | `mig/20260509164536_initial_schema.sql:17-27`; `dash/settings/actions.ts:14-19` |
| BIR TIN | `tenants.bir_tin` varchar(20); printed on invoice, PO, 2307 (shows "—" when empty) | ≤20 chars, no format check | R-flow (billing, 2307) | Platform create form, or owner/admin on `/settings` | `st/erp-api/platform-administration.ts:55`; `dash/settings/actions.ts:16`; `web/app/(print)/invoices/[id]/bir2307/page.tsx:273` |
| PCAB licence number | `tenants.pcab_license` varchar(50); printed when set | ≤50 chars | O | Same | `st/erp-api/platform-administration.ts:54`; `dash/settings/actions.ts:17` |
| DPO contact | `tenants.dpo_contact`; shown on `/settings` only | Email on platform create; free text ≤255 on `/settings` | R (RA 10173) | Same | `st/erp-api/platform-administration.ts:56`; `dash/settings/actions.ts:18` |
| Business type | `tenants.organization_type` NOT NULL, check list | `construction`, `developer`, `design-engineering`, `supply-manufacturing`, `professional-services`, `other` | R | Platform create | `mig/20260729054456_persist_signup_organization_type.sql:6-26` |
| Tenant slug | `tenants.slug` unique | `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 2-100 | R (operator picks) | Platform create | `st/erp-api/platform-administration.ts:49-52` |

No column exists for: RDO, VAT registration status of the tenant, registered address,
Authority to Print or invoice/OR series, PCAB category or expiry. Invoice numbers are fixed
as `INV-YYYYMM-n` (UTC month) at draft creation (`api/finance/customer-invoice-draft-create.service.ts:280-299`).
On the BIR 2307 print the payee address is hard-coded "—" (`bir2307/page.tsx:279`) and the
payor TIN is always "N/A" because client accounts have no TIN column (`bir2307/page.tsx:297,307`;
`packages/database/src/schema/accounts.ts:17`). The platform "Configure" form edits only name
and business type (`web/app/(platform)/platform-admin/actions.ts:85-93`); TIN, PCAB and DPO
are edited by the tenant's owner/admin on `/settings`.

### 2.2 Tax profile (`tax_profiles`)

| Item | Why / where used | Format | Need | How it gets in | Evidence |
|---|---|---|---|---|---|
| VAT rate, EWT rate, retention rate, VAT-registered flag | Billing, invoices, 2307 | bps 0-10000; `code` ≤40 unique, `name` ≤160, `valid_from` today or later | O for the pilot (defaults apply) | API only: `POST tax/profiles`, then workflow by a second user | `mig/20260921181036_roadmap_integrations_foundation.sql:620-651`; `api/roadmap/roadmap.controller.ts:195-216`; `api/roadmap/roadmap.service.ts:1105-1106` |

- With no active profile the code uses built-in defaults: VAT 12%, EWT 2%, retention 10%,
  VAT-registered (`st/tax-rates.ts:3-8,73-80`). This is the pilot configuration:
  `ERP_TENANCY_ENABLED` is unset, so `/settings/tax` returns 404 (`dash/settings/tax/tax-settings.ts:7-9`).
- Trap: the column default for retention is 0, so a profile inserted by SQL without a
  retention value means 0% retention, while no profile means 10%.
- Every tax-profile endpoint also needs `ERP_ROADMAP_TAX_STATUTORY_OUTPUTS_ENABLED=true` or a
  `tenant_feature_flags` row (`api/roadmap/roadmap.service.ts:185-187,197-222`). No code
  writes `tenant_feature_flags`.
- The BIR 2307 rate label always uses the built-in 2%, not the profile (`bir2307/page.tsx:20`).
- What the company provides: confirmation that 12% / 2% / 10% match its practice, or the
  rates to load. Money policy Q1-Q10 (STATE Blockers) decides how these are applied.

### 2.3 Users and roles

| Item | Why / where used | Format | Need | How it gets in | Evidence |
|---|---|---|---|---|---|
| Per user: full name, work email, role | `users` row, capability checks | name 2-255; email; one role from the list below | R | Platform invite (first admin) or tenant admin `/admin/users/new` | `dash/admin/users/actions.ts:29-37`; `st/erp-api/platform-administration.ts:90-94` |

Role names (database enum and `ERP_ROLES`, `st/authorization.ts:9-23`;
`dash/admin/users/roles.ts:7-22`): `owner`, `admin`, `sales`, `commercial`, `design`,
`sd_pm_pe`, `finance`, `procurement`, `safety`, `cx`, `viewer`, plus legacy `estimator`, `pm`.
Capability summary (`st/authorization.ts:43-264`): owner/admin everything; finance all
`finance.*`, KYC, inventory posting; sales accounts, opportunities, stage moves, project
create; commercial BOM and PO approval, rate cards; estimator BOM generate/edit;
pm/sd_pm_pe projects, schedule, diary, variations, POs; procurement RFQ, PO issue/receive,
inventory; design design upload/approval; safety permits, diary; cx punchlist, warranty;
viewer read and export.

- Two people with finance authority are needed for any maker/checker step: a tax profile
  cannot be activated by its preparer (`api/roadmap/roadmap.service.ts:1105-1106`), and PPRF
  KYC tracks need a finance recommendation plus a president decision
  (`mig/20260813130000_wo_11_opportunity_kyc_tracks.sql:56-80`).
- Tenant-admin creation types an initial password (12-128 chars), auto-confirms the email
  and sends no email (`dash/admin/users/actions.ts:244-249`). Platform invite sends a
  Supabase Auth email (`api/platform-admin/platform-identity-admin.service.ts:47-48`).
- No bulk user import.

### 2.4 Organisation structure

No tables for branches, departments, business units, teams or cost centres. The nearest are
per-project `project_locations` (`mig/20260812173000_wo_05_location_dimension.sql:14`) and
warehouses. `tenant_memberships` exists but is not session authority
(`mig/20260904020000_platform_owner_administration_boundary.sql:1-3`). Nothing to collect.

### 2.5 Chart of accounts, fiscal period, cash accounts

| Item | Why / where used | Format | Need | How it gets in | Evidence |
|---|---|---|---|---|---|
| Ledger accounts with system keys | Every posting looks up a system account and raises if missing | `code` ≤30 unique; `name` ≤160; type asset/liability/equity/income/expense | R | `scripts/bootstrap-trial-tenant.mjs` (18 accounts, 1000-6100) or `/finance` setup | `mig/20260726201606_accounting_ledger_foundation.sql:105-155`; `scripts/lib/trial-tenant-bootstrap.mjs:22-68` |
| Open fiscal period | Posting outside an open period fails | name unique; non-overlapping dates | R | Bootstrap (`FY <year>`, Jan-Dec, `--fiscal-year`) or `/finance` | `mig/20260726201606_accounting_ledger_foundation.sql:65-103`; `scripts/lib/trial-tenant-bootstrap.mjs:237-241` |
| Cash and bank accounts | Cash, reconciliation | name + ledger account | R-flow (cash, bank rec) | Bootstrap creates "Main cash account" (1000) and "Operating bank" (1010) | `scripts/lib/trial-tenant-bootstrap.mjs:70-73` |

- Required system keys: `cash`, `accounts_receivable`, `retention_receivable`,
  `withholding_tax_receivable`, `revenue`, `output_vat_payable`, `accounts_payable`,
  `input_vat_receivable`, `withholding_tax_payable`, `inventory`,
  `goods_received_not_invoiced`, `inventory_consumption`, `inventory_adjustment_gain`,
  `inventory_adjustment_loss` (`scripts/lib/trial-tenant-bootstrap.mjs:22-37`; raised by
  `mig/20260726210500_customer_receivables_foundation.sql:525-575`,
  `mig/20260726220000_supplier_payables_foundation.sql:456-475`).
- Nothing creates these when a tenant is created. The bootstrap needs an active owner/admin
  user first (`scripts/lib/tenant-script-db.mjs:18-31`).
- The UI cannot deactivate a ledger account, and cannot map the three inventory
  consumption/adjustment keys (`scripts/lib/trial-tenant-bootstrap.mjs:45-48`). So the
  company's accountant signs off the starter chart before `--apply`, not after.
- No chart-of-accounts import.

### 2.6 Cost codes

`cost_codes`: `code` ≤40 unique per tenant (case-insensitive), `name` ≤160, category
material/labour/subcontractor/equipment/overhead/other (`mig/20260726242000_project_budget_schema.sql:37-69`).
Bootstrap seeds MAT, LAB, SUB, EQP, OHD, OTH (`scripts/lib/trial-tenant-bootstrap.mjs:150-159`).
More are added one at a time in the project budget screen with `budget.manage`; they are
tenant-wide (`dash/projects/[id]/cost/budget/actions.ts:159-189`). No import. Provide: the
company's standing cost-code list if it has one.

### 2.7 Units of measure and aliases

Bootstrap seeds PCS, SET, LOT, BAG, BOX, ROLL, M, SQM, CUM, KG, L and 41 **proposed**
aliases (`pc`, `sq.m`, `m3`, `ls`→LOT, …) that need the company's sign-off before `--apply`,
because an alias says two spellings are the same goods (`scripts/lib/trial-tenant-bootstrap.mjs:75-144`).
Aliases need migration `20261124140000`. Units can also be created on
`/inventory` (code ≤32, decimals 0-6). Provide: the unit spellings used in the company's
BOQs and POs.

### 2.8 Materials, rate cards, rate libraries

| Item | Why / where used | Format | Need | How it gets in | Evidence |
|---|---|---|---|---|---|
| Material items | `material_items`; rate cards and price lists reference them | code ≤64 unique, description, unit ≤32, wastage 0-10000 bps | R-flow (priced BOM, PO) | `/admin/material-items` or the CSV script below | `mig/20260512110000_third_code_erp_ops_phase_2_to_8.sql:153-166`; `dash/admin/material-items/actions.ts:15-27` |
| Supplier unit prices (rate cards) | `rate_cards`; BOM picker and PO-from-BOM pricing | item, vendor (optional), unit price ≥ ₱0.01, lead time 0-3650 days, effective from | R-flow (priced BOM) | `/admin/rate-cards`, one at a time | `mig/20260512110000_third_code_erp_ops_phase_2_to_8.sql:168-179`; `dash/admin/rate-cards/actions.ts:12-30` |
| Labour crew rates, equipment, assemblies (DUPA) | `crew_roles`, `equipment_catalog`, `assemblies` used by BOM build-ups | hourly rate in centavos, productivity > 0 | R-flow (DUPA build-ups) | No screen and no import | `mig/20260812180000_wo_06_dupa_engine.sql:7-175` |
| Price lists | `price_lists`, `price_list_items` | tiers by minimum quantity | O | API only, off until a tenant canary is approved | `mig/20260921181036_roadmap_integrations_foundation.sql:521-572`; `dash/roadmap/page.tsx:66-68` |

Material items CSV (`scripts/import-material-items.mjs`, operator-run with `DATABASE_URL`
and `--tenant-id`, dry run unless `--apply`): header exactly `code,description,unit[,tracked]`
(case-insensitive, unknown columns rejected); RFC 4180, BOM stripped; ≤5,000 rows; code
≤64 and unique in the file; unit ≤32 and must already exist as a unit code or alias;
`tracked` = yes/y/true/1 or no/n/false/0/blank; existing codes are skipped, never updated;
any row error writes nothing (`scripts/lib/material-items-import.mjs:10-11,53-176`). No
category or wastage column. The catalogue (`ERP_CATALOGUE_ENABLED`, #149) is not in this tree.

### 2.9 Vendors

`vendors`: name NOT NULL ≤255, contact_name, email, phone ≤50, address, `bir_tin` ≤20, notes
(`mig/20260509164536_initial_schema.sql:145-157`). Entered one at a time on `/procurement`
with `po.create` (`web/components/procurement/add-vendor-form.tsx:61-66`;
`dash/procurement/actions.ts:120-184`). No VAT status, EWT category/ATC, bank details or
payment terms columns: VAT and EWT are typed as amounts on each supplier bill
(`mig/20260726220000_supplier_payables_foundation.sql:38-39`). Defect: the form limits are
looser than the columns: TIN 32 vs 20, phone 60 vs 50, email 320 vs 255
(`dash/procurement/actions.ts:123-125` against `mig/20260509164536_initial_schema.sql:150-153`),
so an over-length value passes the form and fails with a generic error. No import. Provide: TIN as ≤20 characters
(e.g. `123-456-789-000`).

### 2.10 Customers (CRM accounts), KYC, contacts

| Item | Why / where used | Format | Need | How it gets in | Evidence |
|---|---|---|---|---|---|
| Account | `accounts`; parent of opportunities | name 2-255 unique per tenant; industry `retail, office, food_and_beverage, healthcare, hospitality, industrial, residential, mixed_use, other`; billing address; email; phone ≤64 | R | `/crm/accounts/new` or PPRF intake; starts KYC `pending` | `mig/20260512100000_third_code_erp_ops_phase_0.sql:47-88`; `st/accounts.ts:43-49`; `dash/crm/accounts/actions.ts:69-128` |
| KYC documents | `account_kyc_artifacts`; gate deal progression | types `afs_year_1`, `afs_year_2`, `afs_year_3`, `bir_2303`, `vat_certificate`, `top_suppliers`, `top_clients`, `other`; uploaded via document pipeline then attached | R-flow (moving a deal past lead) | Upload + attach per account | `mig/20260512100000_third_code_erp_ops_phase_0.sql:58-62,137-146`; `dash/crm/accounts/actions.ts:241-305` |
| Contacts | `contacts` (full name, email unique per account, phone, role title, primary) | — | — | **No create path in the app** (read only) | `mig/20260512100000_third_code_erp_ops_phase_0.sql:105-120`; `api/crm/accounts.service.ts:163-179` |

KYC gate: moving an opportunity to `design`, `bom_submission`, `negotiation`, `contract`,
`won`, `resubmission`, `closed_won` needs both PPRF tracks approved if any track exists,
otherwise account KYC `approved` or `not_required`
(`api/crm/opportunity-stage-transition.service.ts:51-59,300-343`). Creating an opportunity
at any stage other than `lead` needs KYC cleared (`dash/pipeline/actions.ts:140-144`).
Approving KYC does not check that a document is attached (`dash/crm/accounts/actions.ts:148-213`).
A KYC artifact can only reference a document already attached to one of the client's
projects or opportunities; nothing is uploaded from the account page
(`dash/crm/accounts/new/page.tsx:20-23`), so KYC files are uploaded on the deal first.
The account-based create path can also place a deal straight at `negotiation` or
`contract`, checking only account KYC (`dash/pipeline/actions.ts:129-144`).
For pre-existing customers whose KYC is already done offline, finance can set
`not_required` or `approved` per account.

### 2.11 Open opportunities

`opportunities`: stage (`lead`, `site_survey`, `design`, `bom_submission`, `negotiation`,
`contract`, `won`, `lost` plus legacy values), `tcv_cents`, `gp_cents`, probability,
closing date, `area_sqm` (integer), type, remarks, owner (`mig/20260509164536_initial_schema.sql:54-71`;
`mig/20260512120000_third_code_erp_ops_8_stages.sql:10-15`). Create for an account: TCV
₱0-1,000,000,000, GP ±₱1,000,000,000, ≤2 decimals; cannot start at Won; probability comes
from the stage (`dash/pipeline/actions.ts:108-183,390-431`; `st/opportunities.ts:74-90`).
PPRF intake additionally needs site address 2-500, floor area 0-1,000,000, landlord contact
and as-built availability (`web/server/crm/pprf-submission-service.ts:67-96`). Stage moves
are Core-only with no direct fallback (`dash/pipeline/actions.ts:252-262`) and Won→project
needs the convert switch (`api/crm/opportunity-stage-transition.service.ts:161-170`), §2.17.
A deal that already has a linked project (needed to build a BOM before Won) converts only
with a signed contract row or a document typed `contract`
(`api/crm/opportunity-project-conversion.service.ts:385-389,585-620`); no code creates
`contracts` rows, so the team uploads the contract as a `contract` document. No import.
Provide: one row per live deal with account, stage, TCV, GP, closing date, area, owner, and
the signed contract file for deals being moved to Won.

### 2.12 Active projects

`projects`: name and client NOT NULL (`mig/20260509164536_initial_schema.sql:39-52`). Create
form: name 1-255, client 1-255, location ≤500, type `mep`/`fit_out`/`interior`/`structural_civil`,
total sqm positive integer, notes ≤2000 (`dash/projects/new/actions.ts:10-17`).
`project_code` ≤40, unique per tenant, is not on the create form
(`mig/20260813170000_wo_13_award_handoff.sql:9-14`). No contract sum, retention, or
start/end date columns; retention is per invoice (`retention_bps` default 1000) or from the
tax defaults. Won→project creates only name, client and status
(`api/crm/opportunity-project-conversion.service.ts:350-358`). Project create needs the Core
switch `ERP_PROJECT_CREATE_WRITES_*` for the tenant (`docs/erp/trial-flags.json`). No import.
Provide: for each live project, name, client, location, type, floor area, code; its BOQ
(§2.13) and schedule (§2.16).

### 2.13 Quantity takeoff / BOQ files

`POST /api/bom/takeoff-import` from `/projects/[id]/bom/togal`, draft BOM only, needs
`bom.generate` (commit also `bom.edit`) (`web/app/api/bom/takeoff-import/route.ts:12,25-34,121-166`).

- Files: `.csv` or `.xlsx` by extension, ≤25 MB; XLSX reads the first sheet, row 1 is the
  header, formula results are used.
- Limits: 5,000 rows, 2,000,000-byte command, 64 columns, 1,000 chars per cell.
- Headers (exact, case and spaces ignored; remappable on screen): required `Description`,
  `Quantity`, `UOM`; optional `Row`, `Division`, `Location`, `Item No`, `Notes`.
- Units accepted: `sqm, m2, sq.m, m², cu.m, m3, m³, lm, lot, pc, pcs, kg, liter, liters, l, set`.
- Rows with duplicate keys, quantity ≤0, >4 decimals, unknown unit or no division are kept
  and sent to review.
- **Every line is stored at unit cost 0**; prices come from rate cards or manual entry.
- Evidence: `web/lib/operations/integrations/takeoff.ts:29-125,182-218`;
  `st/erp-api/takeoff-import.ts:3-157`; `st/bom/takeoff.ts:42-121`;
  `api/cad/takeoff-import.service.ts:299-603`.
- Trial rule R5: prefer CSV while exposure E2 (in-process `.xlsx` parsing) is open.
- BOQ Excel import/export with rates (#144) is not in this tree; spec only, on branch
  `feat/erp-boq-excel`.

### 2.14 CAD drawings (DXF)

- DXF is parsed in the web app (`web/lib/cad/dxf-extractor.ts`); DWG goes to the Python
  worker only when the tenant is opted in to `ERP_DOCUMENT_PROCESSING_VIA_API`. ASCII DXF
  only; signature check `0\nSECTION` in the first 4 KB (`web/lib/cad/format-detect.ts:23-71`).
- Block names counted as 1 unit each (top-level INSERTs, case-insensitive):
  `FCU|FAN.?COIL`, `AHU|AIR.?HANDL`, `VRF|VRV`, `EXHAUST|EF-`, `BREAKER|MCB|MCCB`,
  `PANEL|MDB|DB-`, `LIGHT|LUX|DOWNLIGHT|TROFFER`, `OUTLET|RECPT|GPO`, `SPRINKLER|SPK`,
  `CCTV|CAMERA`, `SMOKE|DETECTOR|SD-`, `TOILET|WC|LAVATORY`, `SINK|BASIN`
  (`web/lib/cad/dxf-extractor.ts:37-51`). Unmatched blocks are dropped.
- Layer name → system: `HVAC|MECH|AIRCON|AC`, `ELEC|POWER|LIGHTING|LTG`,
  `PLUMB|SANIT|WATER|DRAIN`, `FIRE|SPRINK|FP`, `DATA|IT|COMM|CCTV` (`:53-59`). Unanchored,
  so `FACADE` matches HVAC.
- Closed polylines with ≥3 vertices and area ≥1 are summed per layer as `sqm`; `$INSUNITS`
  is not read, so drawings must be in metres. TEXT/MTEXT of 2-40 non-numeric chars become
  annotations; no room-label or ceiling-height rule.
- **Blocker:** CAD item quantity must be an integer (`st/erp-api/cad.ts:11`) while polyline
  areas are passed through unrounded by design (`web/lib/cad/dxf-extractor.ts:184-187`).
  One fractional area rejects the whole file. Optional switch
  `ERP_CAD_EVIDENCE_COMMIT_WRITES_*` is also needed to commit scope items.
- Provide (optional): DXF in metres, equipment as unexploded named blocks, layers named
  like the sample (`HVAC-EQUIP`, `ELEC-LIGHTING`, `PLUMB-FIXTURES`, `FIRE-SPRINKLER`,
  `DATA-CCTV`, `ROOM-LABELS`; `apps/web/public/samples/mep-sample.dxf`).

### 2.15 Documents

Signed upload: `/api/upload/sign` → storage → `/api/upload/complete`; ≤100 MB per file,
≤500 MB per project (`web/app/api/upload/sign/route.ts:12-23,53-88`). The picker allows
`.dxf .dwg .pdf .jpg .jpeg .png .webp .gif .heic .xlsx .xls .xlsm .xlsb .csv .docx .doc`;
the server has no type allowlist and stores unknown types as `other`
(`web/app/api/upload/complete/route.ts:65-97`). Text extraction stops at 25 MB,
250k characters, 500 PDF pages, 100,000 spreadsheet cells
(`web/lib/document-intake/deterministic-extractor.ts:17-22,309-356`).

### 2.16 Bank statements and schedules

- Bank statement CSV (`/finance/reconciliation/new`): header must contain `date`,
  `reference`, `description`, `amount` in any order, case-insensitive; date `YYYY-MM-DD`;
  one signed amount column, commas allowed, ≤2 decimals, non-zero; description required
  ≤2000; reference ≤120; ≤5,000 lines; UTF-8, BOM stripped
  (`st/erp-api/finance-bank-statement-csv.ts:79-150`). Lines outside the statement period,
  an opening + lines ≠ closing balance, or a duplicate statement reference are rejected
  (`dash/finance/reconciliation/actions.ts:49-84,196-244`). Provide statement opening and
  closing balances with each file.
- Master schedule CSV (`/projects/[id]/progress`): exactly
  `name,start_date,finish_date,predecessor_index,planned_pct_curve`; one bad row rejects the
  file; an import replaces the schedule (`dash/projects/[id]/progress/master-schedule-parser.ts:130-178`).
- MS Project XML (`/projects/[id]/schedule`): ≤1 MiB, ≤500 tasks; `.mpp` refused
  (`st/erp-api/ms-project-xml.ts:5-10`).

### 2.17 Email, sender domain, Core switches (operator side)

| Item | Why | Evidence |
|---|---|---|
| Supabase Auth SMTP, Site URL, exact redirect allowlist | Platform invite and password-reset emails; local config has SMTP commented out and `enable_confirmations = false` | `supabase/config.toml:203,214-219`; `api/platform-admin/platform-identity-admin.service.ts:47-48,105-106` |
| Recovery email template sends `token_hash` + `type=recovery` to `/api/auth/callback` | Server-initiated reset has no PKCE verifier | `web/app/api/auth/callback/route.ts:26-38` |
| `RESEND_API_KEY`, `EMAIL_FROM` on web and API; `ERP_WEB_BASE_URL` on API | App notification email (KYC, RFQ, PO, portal links); invite links | `web/lib/operations/integrations/resend.ts:38-85`; `docs/erp/trial-flags.json` presence |
| `RESEND_FROM_EMAIL`, `PUBLIC_APP_URL` on edge functions | Different variable name; silently skipped if missing | `supabase/functions/_shared/email.ts:25-38` |
| Per-tenant Core switches (`*_ENABLED` + `*_TENANT_IDS`) | Project create/retire, cost entries, invoice draft, stage moves, Won→project, role change, optional CAD commit | `docs/erp/trial-flags.json`; `scripts/check-trial-flags.mjs`; RUNBOOK §6 |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` and a synced Inngest app | RFQs are created only by the `bom/approved` event; there is no "new RFQ" page | `web/lib/inngest-rfq.ts:92-104`; `dash/projects/[id]/bom/actions.ts:1385-1408` |
| API `*_TENANT_IDS` hold exact UUIDs only | A `*` or malformed entry fails env validation and the API does not boot | `api/config/environment.ts:44-53` |

`check-trial-flags` does not check bootstrap master data, `tenant_feature_flags`, Inngest
sync, `DXF_PARSER_URL` or DocuSeal variables.

What the company provides: the email addresses that must receive mail, and permission for
its mail server to accept the platform's sender (allowlist). There is one global sender;
no per-tenant sender domain. API-sent emails are branded "ABI OPS / Actuate Builders Inc."
for every tenant (`api/procurement/notification-email.service.ts:63-66`), which is correct
for ABI and wrong for any other trial company.

### 2.18 Privacy (RA 10173) and terms

Only `tenants.dpo_contact` exists. No consent, terms, privacy-notice or DPA-acceptance
table or column; sign-up has no terms checkbox (`web/app/(auth)/auth/signup/signup-form.tsx:53-65`);
no data-subject request workflow. DPA and privacy notice are GA gate G5 (trial-readiness §6),
so for the trial they are signed on paper and the date recorded in STATE.

## 3. Needed but cannot be imported (or has no screen)

| # | Item | State | Evidence |
|---|---|---|---|
| 1 | RDO, tenant VAT status, registered address, ATP/invoice series, PCAB category/expiry | No column | §2.1 |
| 2 | Client TIN (2307 payor) | No column; prints "N/A" | `bir2307/page.tsx:297,307` |
| 3 | Tax profile | API only, plus flag row and a second approver | §2.2 |
| 4 | `tenant_feature_flags` | SQL only | `api/roadmap/roadmap.service.ts:197-222` |
| 5 | Chart of accounts, fiscal period, cash accounts, units, aliases, warehouse | Script or one-by-one; three inventory keys script/SQL only | §2.5, §2.7 |
| 6 | Users | One at a time | §2.3 |
| 7 | Contacts | No create path | §2.10 |
| 8 | Customers, opportunities, projects, vendors | One at a time | §2.9-§2.12 |
| 9 | Supplier unit prices (rate cards) | One at a time; imports price at 0 | §2.8, §2.13 |
| 10 | Labour, equipment, assembly rate libraries | No screen, no import | §2.8 |
| 11 | Material items | CLI with database access only | §2.8 |
| 12 | BOQ Excel with rates | Not in this tree (#144) | §2.13 |
| 13 | DXF with fractional areas | Rejected | §2.14 |
| 14 | Branches/departments, consent/DPA records | Do not exist | §2.4, §2.18 |

Not covered here: money-policy answers Q1-Q10 (STATE Blockers) and PRD v1.4 §11 open
questions (O-01..O-14). They are decisions, not data the code asks for.
