# 2026-11-03 — Client turnover polish (route-by-route)

Branch: `polish/client-turnover-readiness`. Goal: every route a client user
reaches either works, explains itself in plain language, or is hidden from
roles that cannot use it. Open decisions are in
[`docs/turnover/HANDOVER.md`](../turnover/HANDOVER.md) §8 (items 10–18).

## Fixed — correctness

- **BIR 2307 print**: payee/payor parts were swapped. Part I is now the payee
  (tenant), Part II the payor/withholding agent (client); signature blocks and
  the period (Manila month) follow.
- **Customer portal**
  - Documents: purchase orders and internal "other" files no longer reach the
    client (only contract, BOM, invoice).
  - Photos: page no longer crashes (Server Component passed `onClick`).
  - Billing: drafts/cancelled invoices and draft/cancelled claims excluded;
    "paid" comes from posted cash receipts, so partial payments show.
  - BOM signing: button shows progress, errors, and confirmation.
- **Project billing** totals use billed invoices and posted receipts (same
  rule as the portal, `lib/operations/invoice-collections.ts`).
- **Project audit** no longer crashes on large projects (Core scope capped at
  500 ids, newest scope items dropped first; inline error instead of a throw).
- **Purchase orders**: "Mark Partial Delivery" removed (it set a status the
  receipt guard rejects); receipts drive partial progress. "Receive" now
  appears only on receivable POs for `inventory.manage` roles and opens the
  receipt form on that PO (`?po=`); receipt date defaults to Manila today.
- **PO print** route enforces the PO route role list.
- **Pipeline**: Won/Lost cannot be set from the generic stage control.
- **Coverage** board lists `lead` and `opportunity_creation` stages.
- **Weekly report / inspection print** prints the report frame, not the page
  chrome.
- **COC page**: JSX syntax error in the draft-state actions fixed.
- **Permits**: approved/rejected/released/refunded/cancelled permits no
  longer show "Nd overdue" (`lib/operations/permit-risk.ts`).
- **Timezones**: server-rendered dates across ~80 files now format in
  `Asia/Manila` (the server clock is UTC).

## Fixed — role gating

- BOM builder: "Submit for Client Approval" only for `bom.approve_internal`;
  create/approve/delete/location errors shown inline.
- Progress claims: each transition button shown only to the role that may
  take it (`claim-permissions.ts`), with a hint when none apply.
- COC and turnover: draft/send/compile/attach only for `punchlist.manage`;
  all use `components/shared/action-form.tsx` (pending + inline error).
- Admin → Users: account status column and badge; suspended users show
  **Reactivate** (new audited `reactivateUser` action, Auth unban compensated
  on failure; disabled/invited accounts cannot be reactivated); role editor
  replaced by a plain notice when role-assignment routing is off.
- My Tasks: rows read-only with a plain notice when task-completion routing
  is off for the workspace.
- Finance can open purchase orders (its supplier-bill panel lives there).

## Fixed — copy and UX

- BOM page: environment-variable names and "RAG/pgvector" replaced with plain
  status text; "Past BOMs" pricing label.
- Cost page: "Core … source-of-truth" and "SAP posting" wording replaced;
  voiding a manual cost asks for confirmation.
- Variance banner: "BOE total" → "This BOM total".
- Warranty schedule email: dead confirm link removed; Manila time.
- RFQ complete/cancel: pending state and inline errors (were silent).
- Procurement overview: recent PO rows link to the PO and show labels, not
  raw enums (`lib/operations/po-status.ts` shared by PO list/detail).
- Punchlist rows link to the item; wide tables scroll inside their card.
- Assets filters: empty filter no longer sent as `''`.
- Permit status select has an accessible name.

## Fixed — second pass

Correctness
- **Finance ledger** totals now sum every matching posted line (SQL
  aggregate), not just the 500 rows shown; the limit note says so.
- **Finance overview** draft-journal count covers all drafts, not the 12
  most recent entries.
- **Finance lists (Core mode)**: Cash, Payables and Receivables page through
  every Core page (`lib/operations/core-pages.ts`, max 20 × 500) instead of
  failing the whole view past 500 rows.
- **Reconciliation detail**: read-only roles now see statement lines and
  matches; match/unmatch/finalize/void stay with `finance.manage_cash`.
- **Portal schedule label** uses earned schedule
  (`lib/operations/schedule-variance.ts`): flat 0% mobilization weeks no
  longer read as "N days behind".
- **Portal BOM** shows the recorded BOM total; VAT/retention apply per
  billing (HANDOVER §8 item 16).
- **Portal warranty** ticket numbers retry on a unique clash; CNPS survey
  answers record once.
- **Print**: draft/cancelled invoices and unissued/cancelled POs print with a
  "not valid" banner.
- **Dates**: `manilaToday()` replaces UTC "today" defaults in finance,
  inventory, invoices, budgets, rate cards, RFQ workflow and CSV export.
- **Invoice percentages** show decimals (`bpsToPercentLabel`), not rounded.

Role gating
- PO status buttons follow the capability lists (create/approve/issue).
- Deliveries: site-prep, inspection and cancel controls are read-only for
  roles without `po.issue` / `precon.manage_checklist`; "Schedule delivery"
  is shown only to roles that can open it.
- Inventory receipt/movement actions hidden from roles that cannot post.
- Pre-con checklist status buttons need `precon.manage_checklist`.
- CRM accounts: "+ New account" / "+ New PPRF intake" only for
  `account.create` / `pprf.submit`; the list now pages past 100.
- Assets and vendor-performance links to Inventory/Procurement shown only to
  roles that can open them.
- RFQ detail: estimator/viewer get the comparison built from the quote rows
  they already see, instead of a Core denial (HANDOVER §8 item 18).

Forms
- 14 client forms submit via `submitFormData` (`components/shared`), so
  React 19 no longer clears typed values when the server returns an error.
- Tender forms disable while saving (no double submit) and show a plain
  sentence instead of raw Zod JSON.
- New project returns errors to the form (thrown messages are hidden in
  production builds).
- Invoice issue/reverse ask for confirmation; vendor PO confirmation has an
  explicit submit step.
- Labels tied to inputs on edit-project, create-invoice and add-scope forms.

Copy and UX
- User IDs shown as names on the diary, QA/QC hold-point, RFI and process
  registers (`lib/operations/user-display-names.ts`, tenant-scoped).
- Admin user activity and delivery audit rows read "Status: Draft →
  Issued", with the full JSON behind "Full change record".
- "ERP Core API …" errors now read "The ERP service …"; other "Core" wording
  removed from billing, progress, audit, process and data-quality screens.
- Award panel shows "Open budget" / "Open draft invoice" links, not IDs.
- Dashboard date inputs are labelled as the CSV export range (they never
  filtered the on-screen widgets).
- Project command center: the task card is labelled "Daily tasks · whole
  team" and no longer links to the unrelated pre-con checklist.
- Documents page pages at 100 files with a full count.
- Login shows an expired-link message; `?error=forbidden` bounces show a
  dismissible "you don't have access" notice.
- Asset cost entered in pesos (HANDOVER §8 item 17); portal download links
  last 10 minutes.

## Fixed — third pass

- Public sign-up closed in the app: landing CTAs are one "Open workspace"
  link to login, the login page says accounts come by invitation, and
  `/auth/signup` redirects to login (sign-up form and helpers removed).
  Supabase `enable_signup` still needs turning off (HANDOVER §8 item 10).
- `/roadmap` (internal engineering page) removed with its route registration.
- Permission errors in plain language: "Your role does not have permission
  to do this." / "Your role cannot …" across admin, BOM, claims, CRM, pipeline,
  procurement, project and punchlist actions; `safeActionError` maps
  `AuthError` FORBIDDEN and `Forbidden:` messages to the same copy.

## Fixed — CI and dependency security

- Next.js 15.5.27 → 15.5.28 (critical GHSA-2464-fhr4-w9xw image-optimizer
  RCE and the server-action DoS advisory); `eslint-config-next` to match.
- vite 7.3.7, vitest 4.1.12; overrides for body-parser 2.4.0, multer 2.5.0,
  qs 6.16.1, fast-uri 3.1.9, systeminformation 5.33.16.
- Four advisories waived with written justification in `pnpm-workspace.yaml`
  (HANDOVER §8 item 19).
- Playwright jobs pinned to `ubuntu-24.04`: `ubuntu-latest` moved to 26.04,
  which Playwright Chromium does not support yet.
- WO-11 contract fixture now adds the table import its simulated writer
  needs (the unused `getLatestPprf` helper and import were removed); the API
  upload-complete integration spec expects the new "The ERP service" copy.

## Docs

- `.env.example` now lists all 197 `ERP_*` routing flags used in code
  (75 were missing), defaulting to off.
- HANDOVER §8 items 10–18 and the reactivate step in the acceptance list.

## Verification

- Web `tsc --noEmit`: pass. `eslint --max-warnings=0 apps/web/src`: pass.
- Second pass: full web `vitest run` — 326 files / 2692 tests pass, 3 files
  skipped (no failures, including the suites that timed out earlier).
- Third pass: full web `vitest run` — 324 files / 2687 tests pass, 3 files
  skipped. Root `pnpm lint` and the production gates (`test:web-db-boundary`,
  `test:vitest-no-skips`, `test:playwright-no-skips`, `test:production-ci`,
  `test:production-data-boundary`, `test:production-auth-proof`) pass.
  Package suites: shared-types 561, operations 9, database 318 (198 DB
  integration tests skipped without a database), api 1565 (the
  `stock-receipt.controller` spec timed out under parallel load and passes
  alone).
- Web `vitest run` (319 files, 2672 tests): 11 failures from this branch were
  fixed and rerun green (route-qa mock missing the task-completion selector;
  new client components lacked the `React` import the classic test JSX
  transform needs). The 2 remaining failures are timeouts in suites this
  branch does not touch: `branding-clean-room` (full-repo scan, 50 s) and
  `deterministic-extractor` (workbook parse, cold import). The API suite's
  `stock-receipt.controller` spec times out the same way on a cold Windows run.
- Reactivation is fail-closed: the user row and audit entry are written in
  the transaction before the Auth unban, which runs last. If the unban or the
  commit fails, the ban is re-applied from the committed status, and if that
  also fails the admin is told sign-in access is out of sync.

## Not done (tracked)

See HANDOVER §8: Supabase `enable_signup` flag, production flag review,
pre-award design upload, legacy `partial_delivered` POs.
