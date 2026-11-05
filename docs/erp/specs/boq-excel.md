# Spec: BOQ Excel import and export (`boq-export`)

Status: building (2026-11-05)
Depends on: takeoff import (WO-08), D-5 exact quantities, DUPA (WO-07).
Feature flag: none. Import extends an existing path; export is read-only.
**No migration.** Every column used already exists (`unit_rate_source` already
allows `client_boq`; `takeoff_unresolved_items.reason_code` is free text).

Owner goal: "the company can import their excel data estimation inside this
erp system and export also an accurate estimation in an excel format".

## A. Import (extends the takeoff import; no parallel path)

Path stays: wizard -> `POST /api/bom/takeoff-import` (Web parses) -> Core
`POST v1/boms/takeoff-import` (validates, commits). Limits stay: 25 MB file,
5,000 rows, 2 MB command. Only the chosen sheet is read. Parser guards (413
`TAKEOFF_TOO_LARGE`): a declared `Content-Length` over the limit is refused
before the body is read; an .xlsx that inflates past 100 MB (each zip entry
is inflated once, capped at its declared size) or with a sheet `<dimension>`
past 20,000 rows or 64 columns is refused before ExcelJS loads it; only
sheet rows up to header row + 5,001 and 64 columns are read, and content
below that is "more than 5,000 rows". Cell text is cut at 1,000 characters
(a longer number is not a number); CSV rows keep their first 64 cells.

1. **Sheet and header row (.xlsx).** Form fields `sheet` (name, default first
   sheet) and `header_row` (1-50; blank = auto). Auto picks the first row in
   1-50 with a description-like and a quantity-like header, else row 1. The
   Web preview response adds `workbook: { sheets, sheet, headerRow }`.
2. **Mapping.** Existing mapping plus optional `unitRate` and `amount`. A
   mapped header that is not in the file falls back to known aliases
   (`Unit` for UOM, `Unit Rate (PHP)`, `Amount (PHP)`, `Qty`, ...), so a
   system export auto-maps. An optional column sent blank (`""`) is off:
   no alias fallback (the wizard sends a blanked field as `""`).
3. **Rows.** Fully blank rows and rows whose description matches
   `^(sub)?total\b` (case-insensitive) are skipped and counted
   (`skippedRows`). With `section_headers` on (default), a row with no
   quantity, no unit and blank mapped rate and amount cells is a section
   header (a lump sum with a rate or amount imports, and Core queues it as
   `INVALID_QUANTITY`): it is not imported and its
   description (or, when merged from an earlier column, its first text)
   becomes the division of the rows below it until the next header. A
   non-blank division cell wins over the section. Merged-range follower
   cells read as blank. Without a mapped key column a row's key is
   `row-<sheet row number>` (it used to skip blank rows when counting).
4. **Numbers.** Excel numbers go through `toPrecision(15)` (Excel's own
   precision) to a decimal string, so float noise disappears
   (`0.30000000000000004` -> `0.3`). Text accepts `1,234.50`, `₱ 1,234.50`,
   `PHP1234.5`. Then half-up to 4 dp (quantity) or to the centavo (money).
   Formula cells use the cached result. Negative, non-numeric, out-of-range
   or formula-without-result cells become unresolved rows.
   *Deviation from D-5 (Web spreadsheets only):* a quantity with more than
   4 dp is rounded half-up instead of queued, and the preview warns
   (`QUANTITY_ROUNDED`, both values) when real digits were dropped (not for
   float noise). Core still queues such a value from any other caller.
5. **Rate and amount.** A readable rate sends `unitRateCentavos` (integer,
   0..10^12) on the row; Core writes `unit_cost_cents`, `unit_rate_source =
   'client_boq'` and `line_total_cents = lineTotal(rate, qty, 0)`. An
   unreadable rate sends `null` and Core queues `INVALID_UNIT_RATE`
   (cost 0). No rate keeps today's behaviour (cost 0, `manual`) for a new
   line; on re-import a row with no usable rate keeps the line's own rate and
   source (its total re-priced for the new quantity). A line total over PHP
   10 billion queues `INVALID_UNIT_RATE` (5,000 such lines stay below 2^53);
   a BOM total past 2^53 fails the commit with 422. DUPA-priced lines are
   still never overwritten. With `amount` mapped, the preview warns
   (`AMOUNT_MISMATCH`, both numbers) when
   `|round_half_up(qty x rate) - amount| > 1` centavo; the row still imports
   and its total comes from `lineTotal`.
6. **Totals.** Core used to leave BOM totals alone (every imported line cost
   0). Commit now recalculates them in the same transaction with the shared
   `computeBomTotals` (the formula of the Web `recalcBomTotalsInTransaction`:
   top-level lines, cost without markup, TCV = sum of line totals). The
   commit audit entry carries `previous_bom_totals` and `bom_totals`.

## B. Export (new)

1. `GET /api/bom/[id]/export` (Node runtime) -> `.xlsx` attachment
   `BOQ-<project code or name>-v<version>-<yyyymmdd>.xlsx` (sanitized, Manila
   date). Access = the BOM view policy the BOM page uses
   (`getProjectDetailAccess(role).bom`); no new capability. The BOM and its
   project load with `tenant_id = profile.tenantId`; another tenant's BOM is
   404. No audit entry, matching `opportunities-csv`. Private no-store headers.
2. **`BOQ` sheet.** Header block (project, client, BOM version and status,
   export time Asia/Manila, currency PHP), a blank row, then
   `Item No | Code | Description | Division | Location | Unit | Quantity |
   Unit Rate (PHP) | Amount (PHP) | Rate Source | Notes`.
   - Rows follow `topLevelBomLines` (the lines totals count), in BOM page
     order (`sort_order`, grouped by division as the page does). Material
     lines (`parent_line_item_id` set) are **skipped**: their cost lives in
     their work item, so listing them would double count.
   - `is_group` rows are bold section rows (numbers only if they carry cost).
   - Quantity: number from the exact decimal string, `#,##0.0000`. Unit rate:
     stored `unit_cost_cents`. Amount: `lineTotal(unit_cost_cents, qty, 0)`,
     the exact figure `total_cost_cents` adds up. Money format `#,##0.00`.
   - Totals from the stored `boms` columns: total cost, TCV, GP, GP margin
     (`gp_margin_bps` as a percent). Labels start with "Total" so a
     re-import skips them.
   - Accuracy: for a BOM whose totals are current, the sum of the Amount
     cells in centavos equals `total_cost_cents`.
3. **`DUPA` sheet** only when an exported line has a DUPA: one block per line
   with its material, labour and equipment lines, A-C subtotals computed
   exactly from the stored lines (`computeDupa`), and the stored D-H values.
   Lines are shown rounded, so each subtotal carries a one-line note that it
   is computed before rounding.
4. **Text.** Every text cell is a typed string (never a formula, even when it
   starts with `= + - @`, and such cells get `quotePrefix` so editing keeps
   them text); control characters other than tab and newline, U+FFFE/U+FFFF
   and lone surrogates are removed. Bad stored data returns the generic 500.
5. **Round trip.** Exporting and re-importing (auto header row, auto mapping)
   gives the same quantities, units, rates and divisions.
6. **UI.** "Export to Excel" link on the BOM page for users with BOM view
   access; the wizard gains sheet, header row, rate/amount mapping and the
   section-header toggle.

## C. Out of scope

CSV or PDF export, `.xls`, DUPA import, catalogue matching, migrations.
