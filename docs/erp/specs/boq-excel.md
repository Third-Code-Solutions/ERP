# Spec: BOQ Excel import and export (`boq-export`)

Status: building (2026-11-05; review round 2 fixes 2026-11-10)
Depends on: takeoff import (WO-08), D-5 exact quantities, DUPA (WO-07).
Feature flag: none. Import extends an existing path; export is read-only.
**No migration.** Every column used already exists (`unit_rate_source` already
allows `client_boq`; `takeoff_unresolved_items.reason_code` is free text).

Owner goal: "the company can import their excel data estimation inside this
erp system and export also an accurate estimation in an excel format".

## A. Import (extends the takeoff import; no parallel path)

Path stays: wizard -> `POST /api/bom/takeoff-import` (Web parses) -> Core
`POST v1/boms/takeoff-import` (validates, commits). Only the chosen sheet is
read into rows.

**Limits.** 25 MB file; 5,000 rows; about 2 MB of row data, whichever comes
first (see D.3). The import and export routes share the `document-intake`
rate-limit burst with upload completion: 10 requests a minute for a signed-in
user (2 without a session), counted together.

**Parser guards.** Over a size limit is 413 `TAKEOFF_TOO_LARGE` with a message
that says what to do; a file the guard cannot fully account for is 422
`TAKEOFF_PARSE_FAILED`. Nothing is passed on to the workbook reader unchecked.

- A declared `Content-Length` over the limit is refused before the body is
  read (see D.1 for a body with no declared length).
- An .xlsx is checked before ExcelJS loads it, and the check fails closed. The
  zip must be exactly what the reader (JSZip) will read: one end record, one
  disk, no zip64, the directory ending where the end record starts (so no
  bytes before or between the parts), exactly the declared number of entries,
  every entry stored or deflated with its data inside the file. Each entry is
  inflated once with its declared size as the output cap and must come out at
  exactly that size. Anything else is refused.
- Size limits on the checked workbook: 100 MB inflated; 5,000 parts; a sheet
  `<dimension>` of at most 20,000 rows and 64 columns; 500,000 rows and cells
  counted in the sheet XML over all sheets (the declared dimension is not
  trusted, and a merged range counts every cell it covers); 10,000 merged
  ranges per sheet. A merged range must be a plain `A1:B2` reference.
- ExcelJS parses only the cell data and merged ranges of each sheet. Column
  definitions, data validations, hyperlinks, conditional formats and the other
  sheet nodes are not parsed, and workbook defined names are not expanded
  (ExcelJS builds one object per cell or column for these).
- Only sheet rows up to header row + 5,001 and 64 columns are read; content
  below that is "more than 5,000 rows". CSV records keep their first 64 cells.
- Cell text is cut at 1,000 characters (a longer number is not a number). A
  cut Description or Notes cell is reported in the preview (`TEXT_TRUNCATED`).
- Rows are counted in bytes as they are built; past the 2 MB command budget
  the parse stops with 413 instead of building the whole command first.

1. **Sheet and header row (.xlsx).** Form fields `sheet` (name, default first
   sheet) and `header_row` (1-50; blank = auto). Auto picks the first row in
   1-50 with a description-like and a quantity-like header, else row 1. The
   Web preview response adds `workbook: { sheets, sheet, headerRow }`.
2. **Mapping.** Existing mapping plus optional `unitRate` and `amount`. A
   mapped header that is not in the file falls back to known aliases
   (`Unit` for UOM, `Unit Rate (PHP)`, `Amount (PHP)`, `Qty`, ...), so a
   system export auto-maps. An optional column sent blank (`""`) is off:
   no alias fallback (the wizard sends a blanked field as `""`).
3. **Rows.** Fully blank rows are skipped. A total row is skipped: its
   description matches `^(sub)?total\b` (case-insensitive) **and its unit is
   blank**, so "Total station survey | 1 | lot" imports as a line. Skipped
   rows are counted (`skippedRows`); a skipped total row that carries a
   quantity is also listed in the preview (`TOTAL_ROW_SKIPPED`), because it
   may be a real line with its unit missing. With `section_headers` on
   (default), a row with no quantity, no unit and blank mapped rate and amount
   cells is a section header (a lump sum with a rate or amount imports, and
   Core queues it as `INVALID_QUANTITY`): it is not imported and its
   description (or, when merged from an earlier column, its first text)
   becomes the division of the rows below it until the next header. A
   non-blank division cell wins over the section. Merged-range follower
   cells read as blank. Without a mapped key column a row's key is
   `row-<sheet row number>` (it used to skip blank rows when counting; see
   D.2).
   **CSV.** A cell that starts with a quote may hold commas, doubled quotes
   and line breaks, so one record can span lines; a quote later in a cell is
   plain text (`2" PVC pipe`). The row number of a CSV row is its record
   number.
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
   source (its total re-priced for the new quantity, half-up). A line total
   over PHP 10 billion queues `INVALID_UNIT_RATE` (5,000 such lines stay below
   2^53); a re-priced total over that cap, or a BOM total past 2^53, fails the
   commit with 422 and changes nothing. DUPA-priced lines are still never
   overwritten. With `amount` mapped, the preview warns (`AMOUNT_MISMATCH`,
   both numbers) when `|round_half_up(qty x rate) - amount| > 1` centavo; the
   row still imports and its total comes from `lineTotal`. An amount is only
   ever checked, never imported: a row with an amount above zero and no unit
   rate (no rate column, or a blank rate cell) imports unpriced and the
   preview says so (`AMOUNT_IGNORED`).
6. **Totals.** Stored BOM totals have one formula, the shared
   `computeBomTotals` (top-level lines, cost without markup, TCV = sum of
   line totals), always computed over every line of the BOM. It runs in the
   same transaction as: a takeoff commit (the audit entry carries
   `previous_bom_totals` and `bom_totals`), a Togal commit (it used to add to
   the stored figures), adding or deleting a line or approving the BOM in Web,
   and resolving a grain review (nesting a line under a work item, or
   un-nesting it, changes what counts).

## B. Export (new)

1. `GET /api/bom/[id]/export` (Node runtime) -> `.xlsx` attachment
   `BOQ-<project code or name>-v<version>-<yyyymmdd>.xlsx` (sanitized, Manila
   date). Access = what the BOM page needs: `project.read` (the project
   layout) and the BOM view policy (`getProjectDetailAccess(role).bom`); no
   new capability. The BOM and its project load with `tenant_id =
   profile.tenantId`; another tenant's BOM is 404, and so is an archived BOM
   (the page never shows one). A BOM with more than 20,000 lines is 422 with
   the reason. No audit entry, matching `opportunities-csv`. Private no-store
   headers.
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
     stored `unit_cost_cents`. Amount: `lineTotal(unit_cost_cents, qty, 0)`.
     Money format `#,##0.00`.
   - Totals are **computed from the exported lines** with `computeBomTotals`:
     total cost, TCV, GP, GP margin. The workbook is internally consistent:
     Total cost is the sum of the Amount cells, in centavos. When the totals
     stored on the BOM differ, they are printed below as `Total cost stored
     on the BOM (out of date)` / `Total contract value (TCV) stored on the BOM
     (out of date)`, never instead of the computed ones. Labels start with
     "Total" so a re-import skips them.
3. **`DUPA` sheet** only when an exported line has a DUPA: one block per line
   with its material, labour and equipment lines, A-C subtotals computed
   exactly from the stored lines (`computeDupa`), and the stored D-H values.
   Lines are shown rounded, so each subtotal carries a one-line note that it
   is computed before rounding.
4. **Text.** Every text cell is a typed string (never a formula, even when it
   starts with `= + - @` or a tab, and such cells get `quotePrefix` so editing
   keeps them text); control characters other than tab and newline,
   U+FFFE/U+FFFF and lone surrogates are removed. Bad stored data returns the
   generic 500.
5. **Round trip.** Exporting and re-importing (auto header row, auto mapping)
   gives the same quantities, units, rates and divisions. A line whose
   description starts with "Total" round-trips when it has a unit.
6. **UI.** "Export to Excel" link on the BOM page for users with BOM view
   access; the wizard gains sheet, header row, rate/amount mapping and the
   section-header toggle. Changing any mapping field clears the preview,
   because commit re-parses the file with the current mapping.

## C. Out of scope

CSV or PDF export, `.xls`, DUPA import, catalogue matching, migrations.

## D. Known limits

1. **Upload size pre-check.** A chunked body has no `Content-Length`, so the
   pre-check does not apply and `req.formData()` buffers the body before the
   25 MB file check. On Vercel the platform caps a request body at 4.5 MB,
   which bounds this, and also means a file over 4.5 MB cannot be imported
   there at all. No code change.
2. **Row keys changed.** Keys are `row-<sheet row number>` (for CSV, the
   record number). A file imported before this change with the old counting
   and imported again does not match its old rows by key. No code change.
3. **The row cap is also a byte cap.** Every row carries its mapped fields
   and a copy of each source cell (`raw`), and the whole command must stay
   under 2 MB. At about 550 bytes a row (an 11-column sheet) that is reached
   near 3,500 rows, before the 5,000-row limit; a wider sheet reaches it
   sooner. The file is refused with a message to split it. Raising the cap
   means raising Core's request limit, which is not done here.
4. **Workbook size is counted over every sheet.** ExcelJS loads all sheets,
   so the 500,000 rows-and-cells budget and the 100 MB budget apply to the
   workbook, not to the chosen sheet. A large estimate workbook is refused
   with a message to copy the BOQ sheet to a new workbook. Within the budget
   a hostile file can still make the parse hold about 250 MB.
5. **Stale stored totals.** BOMs whose lines were nested before the
   grain-review fix keep their old stored totals until the next of the
   actions in A.6 on that BOM. The export shows both figures.
6. **Other text columns.** Division, location, item number and unit are cut
   at 1,000 characters by Web but limited to 255 (unit: 64) by Core; a longer
   value makes Core refuse the whole command (400). Only Description and
   Notes report a cut.
7. **CSV with an unclosed opening quote.** As in Excel, the cell runs to the
   next quote, across lines. It normally shows up as a `TEXT_TRUNCATED`
   warning on that row.
8. **Tests that need a database.** The re-import SQL and the export loader
   run for real only in the Core takeoff integration spec, which needs the
   disposable database lane (`ERP_API_INTEGRATION_EXPECTED=1`).
