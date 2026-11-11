# Spec: master construction price catalogue (`cost-db` extension)

Owner request (2026-11-05): build a master construction materials and price
catalogue for ABI OPS. It needs a Supabase table, a seed script, indexes on name,
trade and code, a catalogue page with search, filters and pagination, admin price
editing, and supplier price-list import from Excel. The supplier import is not
in PR #149 (section 6).

## 1. Scope

The catalogue is a **market reference price book**: what an item costs in a
region, with a low/average/high range, the source and the date it was checked. It
is not a vendor rate card and not the DUPA material list. Those tables stay as
they are:

- `rate_cards` holds vendor-specific agreed prices.
- `material_catalog` holds the DUPA rates set by RFQ awards.
- `price_lists` is the flagged vendor price-list API.

Out of scope here:

- linking catalogue items to `material_items` or `material_catalog`;
- feeding catalogue prices into DUPA or BOQ rates automatically;
- researching regions other than NCR. The seed loads every row with the region
  its source gave: NCR where one was found, otherwise `National` or the region's
  name with the `NON_NCR` flag;
- the Cortex mirror, which the Cortex coverage spec owns.

## 2. Data model (one additive migration)

The extension `pg_trgm` is created in schema `extensions`. It is available on
production but not installed.

### `catalogue_items`

| Column | Type | Rule |
|---|---|---|
| id | uuid pk | default `gen_random_uuid()` |
| tenant_id | uuid not null | fk `tenants` |
| code | text not null | `^[A-Z]{2}-[0-9]{4}$` for seeded rows; `SUP-<n>` is reserved for the supplier import (section 6, not in PR #149); unique `(tenant_id, code)` |
| name | text not null | 1–300 chars, trimmed |
| trade | text not null | one of the 20 trade slugs (section 7), as a CHECK |
| specification | text | ≤ 2,000 chars |
| unit | text not null | 1–20 chars |
| is_active | boolean not null | default true |
| created_at, updated_at | timestamptz not null | default now() |
| created_by, updated_by | uuid | fk `users`, nullable for seed rows |

Indexes:

- unique `(tenant_id, code)`, which is the code index;
- `(tenant_id, trade)`;
- GIN `name gin_trgm_ops` for `ilike '%q%'` search.

### `catalogue_prices` (append-only price observations)

| Column | Type | Rule |
|---|---|---|
| id | uuid pk | |
| tenant_id | uuid not null | |
| item_id | uuid not null | tenant-scoped fk `(tenant_id, item_id)` → `catalogue_items (tenant_id, id)` |
| region | text not null | default `'NCR'`, 1–40 chars |
| price_low_centavos, price_avg_centavos, price_high_centavos | bigint | either all null or all set; `low ≤ avg ≤ high`; each between 0 and 9,999,999,999,999 (`MAX_CATALOGUE_PRICE_CENTAVOS`, PHP 99,999,999,999.99) |
| price_basis | text | ≤ 60 chars, for example `material_supply;incl_VAT` |
| source_kind | text not null | `research` \| `supplier` \| `manual`; `supplier` is reserved for the supplier import (section 6, not in PR #149) |
| source_name | text | ≤ 200 chars (supplier or publisher name) |
| source_url | text | null, or `^https?://`, ≤ 2,000 chars; the app also parses it (see Security) |
| vendor_id | uuid | optional tenant-scoped fk to `vendors`; reserved for the supplier import (section 6, not in PR #149) |
| checked_on | date not null | not after today's date in Manila: `checked_on <= (now() at time zone 'Asia/Manila')::date` |
| flag | text | ≤ 200 chars, `;`-separated tokens |
| notes | text | ≤ 2,000 chars |
| created_at | timestamptz not null | default now() |
| created_by | uuid | fk `users`, null for seed rows |

- Index `idx_catalogue_prices_current`, in the order of the current-price
  reads: `(tenant_id, item_id, lower(trim(region)), (price_avg_centavos is
  null), checked_on desc, created_at desc, id desc)`.
- **Current price** of an item in a region is its newest **priced** row by
  `(checked_on desc, created_at desc, id desc)`; the id only settles two rows
  written at the same instant.
- **A region is its text trimmed and in lower case** (`lower(trim(region))`):
  "NCR", "ncr" and " Ncr " are one region in the list, the region filter, the
  item page's Current chip and the record-price "current" check.
- **A price always beats a "no price found" row.** A row whose three prices are
  null is the current observation only where the item has no priced row in that
  region at all (then the newest such row, which carries the flag and the note).
  However new it is, it never replaces a price: re-running the seed after a
  person recorded a price must not hide that price.
- The list, the item detail and the price-status filter all read this one
  current observation. The order is
  `(price_avg_centavos is null, checked_on desc, created_at desc, id desc)`.
- Rows are never updated or deleted. A row trigger rejects UPDATE and DELETE, the
  way `audit_log` is protected, and a statement trigger rejects TRUNCATE (also
  when it cascades from `catalogue_items`). A correction is a new `manual` row: with the same or a
  later `checked_on` than the other priced rows it becomes the current price.
- A future `checked_on` is refused, because the newest date wins and such a row
  could never be outvoted.

### Security

Added after the security review of PR #146 (2026-11-10).

- **No client access at all.** RLS is enabled on both tables with a tenant SELECT
  policy (`tenant_id = auth_tenant_id()`) as a second layer, but SELECT is revoked
  from `anon` and `authenticated` along with the writes. The browser never reads
  these tables. With a client SELECT grant, any tenant role could read supplier
  prices through the Supabase client whatever `catalogue.read` says.
- There are no client INSERT/UPDATE/DELETE grants or policies, in line with the
  2026-11-04 SEC-01/02 policy that revoked client table writes.
- `service_role` has every privilege on `catalogue_items` but only SELECT and
  INSERT on `catalogue_prices`, which is append-only.
- Every read and write goes through server code (Drizzle as postgres) with an
  explicit `tenant_id` predicate.
- **Every server action checks the flag and the capability itself** (and so
  must the supplier import, when it is built). Hiding the page is not a gate.
- **Text:** these are stripped, and text is trimmed, when it is written (seed,
  edit, record price; the supplier import too, when it is built):
  - control characters (C0 except tab and line breaks, DEL, C1);
  - the soft hyphen (U+00AD) and the combining grapheme joiner (U+034F);
  - the Arabic letter mark (U+061C);
  - the Hangul fillers (U+115F, U+1160, U+3164, U+FFA0);
  - the Khmer inherent vowels (U+17B4, U+17B5);
  - the Mongolian variation selectors and vowel separator (U+180B to U+180F);
  - zero-width spaces, joiners and direction marks (U+200B to U+200F);
  - bidirectional embeddings and overrides (U+202A to U+202E);
  - the word joiner, the invisible operators, the bidirectional isolates and the
    deprecated format controls (U+2060 to U+206F);
  - the blank braille pattern (U+2800) and the byte order mark (U+FEFF);
  - the interlinear annotation marks and the object replacement character
    (U+FFF9 to U+FFFC);
  - tag characters (U+E0000 to U+E007F) and the supplementary variation
    selectors (U+E0100 to U+E01EF);
  - lone surrogates.

  The variation selectors U+FE00 to U+FE0F stay, because emoji use them. Emoji
  are kept except ZWJ sequences: with the zero-width joiner gone, a
  multi-person emoji such as the man mechanic (man, ZWJ, wrench) falls apart
  into 👨 and 🔧, and a subdivision flag (England, Scotland, Wales) loses its
  tag characters. U+2028 and U+2029 count as line breaks: a space in a one-line
  field, a line feed in a multi-line one. Text is never written to a spreadsheet
  as a formula: exports use the quote-prefix utility from the `boq-excel`
  module.
- **Source links:** a URL is accepted only if it parses, its protocol is `http:` or
  `https:`, it carries no user name or password and it has no whitespace. The page
  renders the parsed `href` with `rel="noopener noreferrer"`. The server never
  fetches it.
- The migration is additive and runs under `lock_timeout 5s` and
  `statement_timeout 60s`. Rollback drops only the two new tables, which hold only
  catalogue data.

## 3. Money

- CSV and Excel prices are PHP decimal strings. They are converted to centavos
  **through a decimal-string parser** and rounded half-up at the centavo. Float
  maths (`Math.round(php * 100)`) is not allowed.
- Display uses the shared peso formatter.
- The average is stored as observed (from the source or the CSV) and is never
  recomputed from low and high.

## 4. Seed script

`scripts/seed-catalogue.mjs --tenant <uuid> [--dry-run] [--dir data/catalogue]`

- Reads every `NN-<trade>.csv` with the header in section 7 and validates each
  row. An invalid row stops the run with its file:line, so a partial load is
  impossible.
- Runs in one transaction:
  - upsert items by `(tenant_id, code)`, which updates name, spec, unit and trade
    **only on rows no person has edited** (`updated_by` is null). Rows an admin
    changed are left alone, counted and printed;
  - insert a `research` price row for each priced row unless an identical row
    exists for `(item, region, checked_on, source_url, low, avg, high)`; the
    region compares as `lower(trim(region))`, as everywhere in the app;
  - an unpriced (`NO_SOURCE`) row creates the item and one observation whose three
    prices are null. That keeps its region, the `NO_SOURCE` flag, the note that
    says why nothing was found, and any link, so the page can show them.
- It is idempotent: a second run inserts 0 rows.
- A CSV change to a row's flag, notes or price basis alone is not applied: the
  observation already matches on item, region, date, link and prices, and
  observations are never updated. The script says so after each run; the row
  needs a new `date_checked` to be recorded.
- Its dry run prints per-trade counts.
- Each real run writes one `audit_log` entry with its counts and its source: the
  OS user who ran it, the data directory (its path in the repository, or only
  its name when it is outside), the SHA-256 of the bytes of each CSV as they
  were parsed and the git commit when there is one. Never the `DATABASE_URL`.
- `DATABASE_URL` comes from the environment only.
- **After a real run commits, the script runs `ANALYZE` on `catalogue_items`
  and `catalogue_prices`** and prints that it did (or, if it failed, the
  statements to run by hand). Until the planner has statistics for the seeded
  tenant it joins the current-observation subquery to the items row by row.
  Measured on the local
  database with the 1,008 seeded items: a list page took 73 ms straight after
  seeding and 5 ms after `ANALYZE`. For a tenant the statistics did not
  describe at all (a test tenant seeded inside a transaction), each list
  request took 1 to 2 s.

## 5. Catalogue page (`/catalogue`)

- Server component. Copy the paging pattern from `lib/account-queries.ts`
  (ilike search, limit ≤ 100, offset paging) and the UI from
  `app/(dashboard)/assets/page.tsx` (a GET filter form and previous/next links).
- Search matches code or name (`ilike`, trigram-backed). The filters are trade,
  region and price status (priced / no source / stale / low authority, read from
  the flag tokens of the current observation; an item with no observation at all
  counts as no source). The region filter ignores letter case and surrounding spaces, and keeps only
  items with an observation in that region; with "no source" it also lists the
  items never observed there. 50 rows per page; the URL holds the search state.
- The search term is capped at 100 characters, and `%`, `_` and `\` in it are
  escaped before the `ilike` pattern is built. The page number is capped.
- Columns:
  - code, name, trade, specification (truncated, with the full text on hover or
    expand) and unit;
  - current low/avg/high in PHP (numbers right-aligned, tabular figures);
  - region;
  - source, as an external link with `rel="noopener noreferrer"`;
  - checked date;
  - flags, as labelled chips that do not rely on colour alone.
- An item detail view shows the price history: every observation, newest first,
  up to the newest 500 (the page says when older ones are left out).
  The entry that is current in its region carries a "Current" chip, in words.
  Which entry is current is read from all of the item's observations, not only
  the 500 shown, by the same `DISTINCT ON` rule as the list. A current entry
  older than the 500 shown is pinned above them, marked Current, and the cap
  note says so.
- Gate: `catalogue.read`. The page returns not-found while `ERP_CATALOGUE_ENABLED`
  is not `true` (default off). Flags go on only after `smoke:prod` passes.

## 6. Admin

- **Capability `catalogue.manage`,** granted to the same roles as
  `admin.rate_card`. `catalogue.read` goes to every role that has `bom.generate`,
  `procurement.read` or `admin.rate_card.read`. Both are added to
  `shared-types/src/authorization.ts` and its tests.
- **Edit item:** name, specification, unit, trade and active. A zod-validated
  server action updates the row and writes an `audit_log` entry with the before
  and after values.
- **Record price:** a server action inserts a `manual` price row (low/avg/high or
  a single price, region, basis, source name or URL, checked date) and writes
  `audit_log`.

### Supplier price-list import: Not in PR #149

Nothing below is built yet. PR #149 ships the tables, the seed, the catalogue
pages, item editing and recording a price by hand. Reserved for this import, and
written by nothing in PR #149:

- the `supplier` value of `catalogue_prices.source_kind`;
- the `catalogue_prices.vendor_id` column;
- the `SUP-<n>` item code format.

The planned import (Excel or CSV):

- Reuse the spreadsheet utilities from the `boq-excel` module (sheet picker,
  header row, decimal-safe number parsing). Do not copy them.
- Mapped columns: code (optional), name, unit, price, or low and high; plus
  supplier (an existing vendor or a free-text name), price-list date and region.
- Matching:
  - an exact code within the tenant;
  - otherwise normalised name (lower-case, collapsed spaces) plus unit, exact;
  - otherwise unmatched.
- The preview shows matched, new and unmatched rows. On commit, the user picks
  one trade for new items (or skips them).
- The commit inserts `supplier` price rows (low = avg = high when the file has
  one price) in one transaction, with one `audit_log` entry per import that
  carries the counts.
- Limits: 25 MB, 5,000 rows.
- Text is never written back as a formula.
- **The commit does not trust the preview.** The file is sent again with the
  commit and parsed again on the server; matched rows from the browser are never
  written as they stand. This is how the takeoff import already works.
- The file passes the same guards as the takeoff import before it is opened:
  file type by content, the zip and merged-range limits, and the sheet size
  limits. The route sits in the same rate-limit bucket as the takeoff import.
- The `audit_log` entry carries the file's SHA-256, name and size.
- **A repeated commit writes nothing.** The commit carries an idempotency key,
  and a second commit of the same file for the same supplier and date inserts
  no duplicate price rows.
- New `SUP-<n>` codes are allocated inside the commit transaction under a
  per-tenant lock, so two imports cannot take the same code.

## 7. CSV contract (`data/catalogue/NN-<trade>.csv`)

Header:
`code,name,trade,specification,unit,price_low_php,price_avg_php,price_high_php,region,price_basis,source_url,date_checked,flag,notes`

Trade slugs and code prefixes:

| Slug | Prefix | Slug | Prefix |
|---|---|---|---|
| earthworks | EW | paint | PT |
| concrete | CN | plumbing-sanitary | PL |
| rebar-structural-steel | RS | electrical | EL |
| formwork | FW | fire-protection | FP |
| masonry | MS | mechanical-hvac | MH |
| waterproofing | WP | road-bridge-works | RB |
| roofing | RF | drainage | DR |
| doors-windows | DW | site-safety | SS |
| ceiling-drywall | CD | labor | LB |
| floor-wall-finishes | FF | equipment | EQ |

Flag tokens: `NO_SOURCE`, `SINGLE_SOURCE`, `STALE_<yyyy>`, `NON_NCR`,
`LOW_AUTHORITY`, `SNIPPET_ONLY` (the price was read from a search engine's excerpt
of the page, not the page). The meanings are in `data/catalogue/README.md`.

Codes are not reused, so a file can have gaps in its numbering.

## 8. Tests

- **Rules and CSV (`apps/web/src/lib/catalogue/rules.test.ts`, `csv.test.ts`):**
  - the trades and their code prefixes;
  - the PHP → centavos conversion (half-up, commas, ₱, no float noise, the
    ceiling);
  - the low ≤ avg ≤ high check;
  - flag tokens;
  - text hygiene (controls, hidden characters, separators);
  - the source URL and the checked date;
  - the CSV records (quoting, line breaks, the line a record starts on) and the
    contract (the header, the column count, the trade/prefix match, flags and
    prices, repeated codes).
- **SQL shape (`queries.sql.test.ts`):** the real Drizzle builder against a fake
  client. It checks the tenant predicate on every read, the `DISTINCT ON` and
  `ORDER BY` of the current price in the list and on the item page, the region
  match and the history cap. `queries.test.ts` covers the filters, the gate and
  the row mapping with a mocked builder.
- **Seed (`scripts/seed-catalogue.test.mjs`):** the research files load, a bad
  row stops the load, the command line, the statements a run sends, the audit
  entry and the ANALYZE that follows the load.
- **DB (gated on `DATABASE_URL` like the other DB tests):**
  - `packages/database/src/__tests__/catalogue-price-book.test.ts` reads the
    migration and, on a database, checks the item and price constraints, the
    tenant-scoped foreign keys, RLS between tenants, that browser roles cannot
    read or write, that `service_role` can only read and add prices, that
    prices cannot be updated, deleted or truncated, and that the seed runs
    twice with 0 rows the second time;
  - `apps/web/src/lib/catalogue/catalogue.database.test.ts` (in CI) runs the
    list and item reads and the two actions against the seeded tables, including
    which observation is current;
  - `apps/web/src/app/(dashboard)/catalogue/pages.database.test.tsx` (local
    only, see e2e below) renders both pages.
- **Route and action:**
  - without the capability → 403;
  - the flag off → 404;
  - another tenant's item → 404;
  - edit and record-price write `audit_log`: proven on a real database in
    `apps/web/src/lib/catalogue/catalogue.database.test.ts` (the item row and
    its `updated_by`, one `catalogue_item` and one `catalogue_price` entry, no
    entry for a save that changes nothing, and a later seed run keeps the edit).
- **e2e (gated): deferred.** Search, filter and paging on the page need a
  signed-in Supabase stack with the catalogue seeded and `ERP_CATALOGUE_ENABLED`
  on in the server; the e2e setup has no such fixture yet. Until it does, the
  page is rendered on the server against the seeded local tenant by
  `apps/web/src/app/(dashboard)/catalogue/pages.database.test.tsx` (local only).
