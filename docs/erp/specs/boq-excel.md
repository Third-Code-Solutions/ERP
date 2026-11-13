# Spec: BOQ Excel import and export (`boq-export`)

Status: building (2026-11-05; review fixes 2026-11-10, 2026-11-11, 2026-11-12
and 2026-11-13)
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

- The body is read as a stream and counted: past 25 MB plus 64 KB of form
  overhead the stream is cancelled and the answer is 413 `FILE_TOO_LARGE`,
  with or without a declared `Content-Length` (a declared length over the
  limit is refused before reading).
- **First filter (.xlsx), in the request thread.** A cheap, linear check
  before the workbook reader, and it fails closed. The zip must be exactly
  what the reader (JSZip) will read: one end record, one
  disk, no zip64, the directory ending where the end record starts (so no
  bytes before or between the parts), exactly the declared number of entries,
  every entry stored or deflated with its data inside the file. Each entry is
  inflated once with its declared size as the output cap and must come out at
  exactly that size. Anything else is refused.
- Whole-workbook limits of the first filter (they say nothing about the sheet
  being imported): 100 MB inflated; 5,000 parts; 32 MB of XML over all parts,
  judged by content (shared strings, styles, comments and drawings expand
  about 12x in ExcelJS; images do not count, but any part the sheet scans
  below read counts, whatever its first byte); 500,000 rows and cells counted
  in the sheet XML over all sheets (a merged range counts every cell it
  covers, and each sheet counts the columns up to the last one a cell is in,
  since ExcelJS creates every one of them); 5,000 merged ranges over the
  workbook. A merged range must be one plain `A1:B2` reference.
- **Every index ExcelJS allocates from is read in full and must lie inside a
  sheet**, or the file is refused: every `sheetId` in a scanned part (a sheet
  part, or any part that holds the word) is an attribute with a quoted
  number of digits up to 65,535, and a part that holds the word any other way
  is refused (see D.10); every
  `<row>` has exactly one `r` of digits from 1 to 1,048,576; a `<c r>` (when
  present) is one reference no further than column XFD and row 1,048,576;
  a `<col>` has one `min` and one `max` from 1 to 16,384; the `<dimension>`
  and every merged range are plain references inside those bounds. Each of
  these tags is read from its name one attribute at a time, in order, with
  no character window (an attribute 2 KB into a tag is still read): only
  `name="value"` or `name='value'` pairs separated by spaces and then `>` or
  `/>`. A tag name ends at the first character that is not an ASCII name
  character (a letter, a digit, `_`, `.`, `:` or `-`) and an attribute name
  is ASCII, so whatever follows a name is read by the scan, never skipped.
  A tag this does not consume exactly (not closed, a stray quote, text
  between attributes, any character after a name that is not a space, tab or
  line break) is refused, and so is a value the scan cannot read (an
  entity in a number, trailing text, a second `r`) or one holding a raw `<`
  or `>` (XML forbids the first and Excel writes the second as `&gt;`; a `>`
  inside a value is how a decoy attribute once hid the real one). A read
  never passes the next `<`, so the scan is linear. `<col>` and
  `<dimension>` are not parsed by ExcelJS (below) and are checked anyway.
- **The scans read XML 1.0.** The parser ExcelJS uses reads U+0085 and
  U+2028 as white space once a part declares XML 1.1, which is how an index
  was once hidden behind one of them. So every XML declaration in a scanned
  part must be a whole, plain version 1.0 declaration (`version`, then an
  optional `encoding` and `standalone`); any other version, or a declaration
  the scan cannot read exactly, is 422 "... a part is not plain XML 1.0."
  Excel writes 1.0. In cell text the two characters are ordinary and import.
- **Reader (.xlsx), in a child process.** ExcelJS runs in a child process
  (`child_process.fork` of `takeoff-xlsx-worker.cjs`, started with
  `--max-old-space-size=512` and none of the server's environment) with a
  15 second wall clock, after which the process is killed (SIGKILL): a thread
  cannot be stopped while V8 runs a builtin loop, a process can. At most 2
  reads run at once per server instance; a read's slot is released only once
  its process is gone, and also when the process fails to start. Over the
  heap cap or the clock is
  413 `TAKEOFF_TOO_LARGE` ("The workbook needs more than 512 MB of memory to
  read." / "The workbook took longer than 15 seconds to read.", each followed
  by "Copy the BOQ sheet to a new workbook and try again."). A third
  concurrent read is 503 `TAKEOFF_BUSY` with `Retry-After: 10` ("Other
  spreadsheets are being read right now. Try again in a few seconds."). A
  read that fails otherwise is 422 "The workbook could not be read: ...".
  The server stays responsive while a read runs.
- ExcelJS parses only the cell data and merged ranges of each sheet. Column
  definitions, data validations, hyperlinks, conditional formats and the other
  sheet nodes are not parsed, and workbook defined names are not expanded
  (ExcelJS builds one object per cell or column for these).
- **Per-sheet limits**, checked in the child process on the chosen sheet only, so an
  unrelated wide or long sheet (a cash-flow sheet, a price list) does not
  refuse the workbook: at most 64 columns ("The sheet "X" uses N columns; the
  import reads at most 64. ..."); rows up to header row + 5,001, content below
  that is "more than 5,000 rows"; about 4 MB of cell text. CSV records keep
  their first 64 cells.
- Cell text is cut at 1,000 characters (a longer number is not a number). A
  cut Description or Notes cell is reported in the preview (`TEXT_TRUNCATED`).
- Rows are counted in bytes as they are built; past the 2 MB command budget
  the parse stops with 413 instead of building the whole command first.

1. **Sheet and header row (.xlsx).** Form fields `sheet` (name, default first
   sheet) and `header_row` (1-50; blank = auto). Auto picks the first row in
   1-50 with a description-like and a quantity-like header, else row 1. The
   Web preview response adds `workbook: { sheets, sheet }` and a top-level
   `headerRow`.
2. **Mapping.** Existing mapping plus optional `unitRate`, `amount` and
   `code` (alias `Code`). A
   mapped header that is not in the file falls back to known aliases
   (`Unit` for UOM, `Unit Rate (PHP)`, `Amount (PHP)`, `Qty`, ...), so a
   system export auto-maps. An optional column sent blank (`""`) is off:
   no alias fallback (the wizard sends a blanked field as `""`).
3. **Rows.** Fully blank rows are skipped. A total row is skipped: its
   description matches `^(grand\s+|sub[\s-]*)?total\b` (case-insensitive:
   Total, Subtotal, Sub-total, Sub Total, Grand Total, Total Cost) **and its
   unit is blank**, so "Total station survey | 1 | lot" imports as a line.
   An amount-only row (an amount above zero, a blank quantity and no rate)
   is skipped too unless its unit is a lump-sum unit (A.5): TOTALS, VAT 12%,
   Overall Total, Contract Price, or a total label in another column with a
   blank description, never become priced lines (owner decision 2026-11-13).
   Skipped rows are counted (`skippedRows`). Every skipped row that carries
   an amount above zero is listed in the preview (`skippedAmountRows`: sheet,
   or null for CSV; row number; label, the description or else the row's
   first text, cut at 80 characters; the amount as an exact peso decimal such
   as `85,000.00`; the reason), and the wizard shows each one, so no total
   leaves the import unseen. A skipped total row that carries a quantity and
   no amount is listed as a warning (`TOTAL_ROW_SKIPPED`), because it may be
   a real line with its unit missing. With `section_headers` on
   (default), a row with no quantity, no unit and blank mapped rate and amount
   cells is a section header (a row with a rate or an amount is not: it is a
   line, or an amount-only row skipped as above, see A.5): it is not imported
   and its
   description (or, when merged from an earlier column, its first text)
   becomes the division of the rows below it until the next header. A
   non-blank division cell wins over the section. A text value merged down
   a column (a Division or Location spanning several rows) fills every row
   it spans; other merged-range followers read as blank, and a number is
   never filled (a merged quantity or amount counts once). A row hidden in
   the sheet imports with a `HIDDEN_ROW` warning in the preview, because
   hidden detail rows under a summary line would double count. Without a
   mapped key column a row's key is
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
   overwritten. With `amount` mapped and a rate on the row, the amount is
   only checked: the preview warns (`AMOUNT_MISMATCH`, both numbers) when
   `|round_half_up(qty x rate) - amount| > 1` centavo; the row still imports
   and its total comes from `lineTotal`. With an amount above zero and no
   rate (no rate column, or a blank rate cell) the amount prices the row, in
   integer centavos and never rounded to fit:
   - quantity read: the rate is `round_half_up(amount / qty)` (BigInt) **only
     if** `lineTotal(rate, qty, 0)` gives back the amount exactly; otherwise
     the rate is sent as `null`, Core queues `INVALID_UNIT_RATE` for review,
     and the preview says why (`AMOUNT_NOT_EXACT`);
   - quantity blank and the unit is `ls`, `l.s.` or `lot` (case-insensitive,
     trimmed): a lump sum, quantity 1 at the amount, the rate being the
     amount exactly (`LUMP_SUM` warning); over the rate cap it imports
     unpriced (`AMOUNT_IGNORED`);
   - quantity blank and any other unit, or none: not a line. The row is
     skipped and listed in `skippedAmountRows` (A.3), so a summary row never
     adds to the BOM total;
   - quantity unreadable: unpriced (`AMOUNT_IGNORED`).
   A rate with no quantity is still a line Core queues as `INVALID_QUANTITY`.
   This rule is applied once, in the Web parser (`classifyRow`); Core never
   sees the amount, only the rate and quantity Web derived from it.

   *Worked example* (columns Item, Description, Quantity, UOM, Unit Rate,
   Amount; no rate except on the first row):

   | Row | Sheet row | Result |
   |---|---|---|
   | `1, Excavation, 10, cu.m, 1,000.00, 10,000.00` | 2 | line: 10 x 1,000.00 = 10,000.00 |
   | `2, Mobilization, , ls, , 50,000.00` | 3 | lump sum: 1 x 50,000.00 |
   | `3, Permits, , LOT, , 12,000.00` | 4 | lump sum: 1 x 12,000.00 |
   | `4, Bonds, , L.S., , 3,000.50` | 5 | lump sum: 1 x 3,000.50 |
   | `5, Formwork, , m2, , 8,000.00` | 6 | skipped, listed: amount with no quantity |
   | `, SUBTOTAL, , , , 83,000.50` | 7 | skipped, listed: total row |
   | `, VAT 12%, , , , 9,960.06` | 8 | skipped, listed: amount with no quantity |
   | `, TOTAL, , , , 92,960.56` | 9 | skipped, listed: total row |
   | `GRAND TOTAL, , , , , 92,960.56` | 10 | skipped, listed: amount with no quantity (label from the Item column) |

   The BOM receives 10,000.00 + 50,000.00 + 12,000.00 + 3,000.50 =
   75,000.50; none of the five listed amounts is added to it.
6. **Totals.** Stored BOM totals have one formula, the shared
   `computeBomTotals` (top-level lines, cost without markup, TCV = sum of
   line totals), always computed over every line of the BOM. It runs in the
   same transaction as: a takeoff commit (the audit entry carries
   `previous_bom_totals` and `bom_totals`), a Togal commit (it used to add to
   the stored figures), adding or deleting a line or approving the BOM in Web,
   and resolving a grain review (nesting a line under a work item, or
   un-nesting it, changes what counts).
7. **Code and notes.** A mapped Code becomes the line's `code` (else the
   Item No, as before). Notes from the file are kept on a line the import
   creates, with every `[VENDOR:...]` token removed until none is left, so
   one hidden inside another cannot reappear (that token marks a vendor
   elsewhere in the system). An opener with no closing `]` is removed with
   the rest of the notes, because the token a later supplier pick appends
   would close it; without notes the line gets `Takeoff source:
   <source>` as before.
8. **Units.** Besides the existing list, `m`, `ls`, `l.s.`, `ea`, `each`,
   `no.`, `no`, `nos`, `unit`, `units`, `bag`, `bags` and `box` are units, so
   the units the app's own forms offer and the export writes re-import.
9. **Importing into a BOM that has lines.** The preview reports
   `existingLineCount` (lines on the BOM) and `matchedLineCount` (rows of this
   file whose key matches a line from an earlier import of the same source
   and file name; the commit updates those). When the BOM has lines, the
   wizard says how many lines the import adds and updates, that nothing is
   replaced or removed, and that the same lines under another file name are
   duplicated; "Import rows" stays disabled until the user ticks "Add N lines
   to this BOM". There is no replace or delete path.

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
   Unit Rate (PHP) | Amount (PHP) | Markup % | Line Total (PHP) | Rate Source
   | Notes`.
   - Rows follow `topLevelBomLines` (the lines totals count), in BOM page
     order (`sort_order`, grouped by division as the page does). Material
     lines (`parent_line_item_id` set) are **skipped**: their cost lives in
     their work item, so listing them would double count.
   - `is_group` rows are bold section rows (numbers only if they carry cost).
   - Quantity: number from the exact decimal string, `#,##0.0000`. Unit rate:
     stored `unit_cost_cents`. Amount (cost): `lineTotal(unit_cost_cents, qty,
     0)`. Markup %: stored `markup_bps` as a percentage. Line Total (selling
     price): stored `line_total_cents`. Money format `#,##0.00`. Storage and
     pricing are unchanged; the sheet shows cost and selling price side by
     side instead of choosing one.
   - Totals are **computed from the exported lines** with `computeBomTotals`:
     total cost, TCV, GP, GP margin. The workbook is internally consistent:
     Total cost sits under Amount and is the sum of the Amount cells; TCV, GP
     and margin sit under Line Total, and TCV is the sum of the Line Total
     cells, in centavos. When the totals
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
   gives the same quantities, units, rates, divisions, codes and notes. A
   line whose description starts with "Total" round-trips when it has a unit.
6. **UI.** "Export to Excel" link on the BOM page for users with BOM view
   access; the wizard gains sheet, header row, rate/amount mapping and the
   section-header toggle, Code and Notes columns, and the confirmation in
   A.9. Changing any mapping field clears the preview, because commit
   re-parses the file with the current mapping.

## C. Out of scope

CSV or PDF export, `.xls`, DUPA import, catalogue matching, migrations.

## D. Known limits

1. **Upload size on Vercel.** The body is counted as it streams (A, parser
   guards), so the 25 MB limit holds on any host, chunked or not. On Vercel
   the platform caps a request body at 4.5 MB, so a file over 4.5 MB cannot
   be imported there at all.
2. **Row keys changed.** Keys are `row-<sheet row number>` (for CSV, the
   record number). A file imported before this change with the old counting
   and imported again does not match its old rows by key, so they are added
   as new lines. The A.9 confirmation shows this (few or no rows updated),
   and the release notes must say it. No code change.
3. **The row cap is also a byte cap.** Every row carries its mapped fields
   and a copy of each source cell (`raw`), and the whole command must stay
   under 2 MB. At about 550 bytes a row (an 11-column sheet) that is reached
   near 3,500 rows, before the 5,000-row limit; a wider sheet reaches it
   sooner. The file is refused with a message to split it. Raising the cap
   means raising Core's request limit, which is not done here.
4. **Memory and time of a read.** ExcelJS loads every sheet and part, so the
   first filter's budgets apply to the whole workbook. The earlier figure of
   "about 250 MB" was wrong: shared strings and similar parts expand about
   12x, and a 185 KB file with 60 MB of rich shared strings exhausted a
   512 MB heap. The 32 MB XML budget now refuses that file up front, and
   whatever passes is bounded by the reader process: 512 MB of old-generation heap
   and 15 seconds per read, at most 2 reads at once, so about 1 GB of reader
   heap per server instance at worst, plus request buffers and each child's own
   Node.js baseline (tens of MB). `--max-old-space-size`
   does not cap the young generation or buffers outside the heap.
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
8. **Tests that need a database.** The re-import SQL, the preview counts
   and the export loader run for real only in the Core takeoff integration
   spec, which needs the disposable database lane
   (`ERP_API_INTEGRATION_EXPECTED=1`).
9. **Reader file location.** The reader starts its child process from
   `<process.cwd()>/src/lib/operations/integrations/takeoff-xlsx-worker.cjs`;
   `next.config.ts` adds that file to the import route's output trace
   (`outputFileTracingIncludes`). A local production `next build` was
   checked on 2026-11-12: the route's trace lists the file and `exceljs`,
   the built route forks it with `--max-old-space-size`, and the reader
   process started from a copy holding only the traced files reads a
   workbook. The built route itself was last run end to end with the
   earlier thread reader; a Vercel deployment and the standalone Docker
   output were not checked. If
   the file is missing the import answers 422 "Workbook reader is not
   installed".
10. **Smaller known gaps.** The export writes no audit entry (as
    `opportunities-csv`). `quotePrefix` does not survive a save as CSV.
    Amount, Line Total and the totals are numbers, not formulas. A numeric
    Item No such as `1.10` reads back as `1.1`. A CSV saved as cp1252 shows
    `m²` as U+FFFD. The `_definedNames` stub relies on an ExcelJS private
    field. Togal answers 409 on a total overflow where the takeoff import
    answers 422. A password-protected or `.xls` file gets a generic "could
    not be read" message. A part that holds the word `sheetId` other than as
    an attribute with a quoted number is refused (422, "a sheet id is
    unreadable or out of range"): that refuses a cell whose text holds that
    word and, by the file format (not checked against a file saved by
    Excel), the change log of a legacy shared workbook, which lists its
    sheets as `<sheetId val="1"/>`. Copying the BOQ sheet to a new workbook
    imports it.
