# Spec: master construction price catalogue (`cost-db` extension)

Owner request (2026-11-05): build a master construction materials and price
catalogue for ABI OPS. It needs a Supabase table, a seed script, indexes on name,
trade and code, a catalogue page with search, filters and pagination, admin price
editing, and supplier price-list import from Excel.

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
- regions other than NCR in the seed;
- the Cortex mirror, which the Cortex coverage spec owns.

## 2. Data model (one additive migration)

The extension `pg_trgm` is created in schema `extensions`. It is available on
production but not installed.

### `catalogue_items`

| Column | Type | Rule |
|---|---|---|
| id | uuid pk | default `gen_random_uuid()` |
| tenant_id | uuid not null | fk `tenants` |
| code | text not null | `^[A-Z]{2}-[0-9]{4}$` for seeded rows; supplier-created rows use `SUP-<n>`; unique `(tenant_id, code)` |
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
| price_low_centavos, price_avg_centavos, price_high_centavos | bigint | either all null or all set; `0 ≤ low ≤ avg ≤ high` |
| price_basis | text | ≤ 60 chars, for example `material_supply;incl_VAT` |
| source_kind | text not null | `research` \| `supplier` \| `manual` |
| source_name | text | ≤ 200 chars (supplier or publisher name) |
| source_url | text | null, or `^https?://`, ≤ 2,000 chars; the app also parses it (see Security) |
| vendor_id | uuid | optional tenant-scoped fk to `vendors`, for supplier imports |
| checked_on | date not null | not after today's date in Manila: `checked_on <= (now() at time zone 'Asia/Manila')::date` |
| flag | text | ≤ 200 chars, `;`-separated tokens |
| notes | text | ≤ 2,000 chars |
| created_at | timestamptz not null | default now() |
| created_by | uuid | fk `users`, null for seed rows |

- Index: `(tenant_id, item_id, region, checked_on desc, created_at desc)`.
- **Current price** of an item in a region is the newest row by
  `(checked_on desc, created_at desc)`.
- Rows are never updated or deleted. A trigger rejects UPDATE and DELETE, the way
  `audit_log` is protected. A correction is a new `manual` row: with the same or a
  later `checked_on` it becomes the current price.
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
- Every read and write goes through server code (Drizzle as postgres) with an
  explicit `tenant_id` predicate.
- **Every server action and the import check the flag and the capability
  themselves.** Hiding the page is not a gate.
- **Text:** control characters are stripped and text is trimmed when it is written
  (seed, edit, record price, import). Text is never written to a spreadsheet as a
  formula: exports use the quote-prefix utility from the `boq-excel` module.
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
    exists for `(item, region, checked_on, source_url, low, avg, high)`;
  - unpriced (`NO_SOURCE`) rows create the item with no price row.
- It is idempotent: a second run inserts 0 rows.
- Its dry run prints per-trade counts.
- Each real run writes one `audit_log` entry with its counts.
- `DATABASE_URL` comes from the environment only.

## 5. Catalogue page (`/catalogue`)

- Server component. Copy the paging pattern from `lib/account-queries.ts`
  (ilike search, limit ≤ 100, offset paging) and the UI from
  `app/(dashboard)/assets/page.tsx` (a GET filter form and previous/next links).
- Search matches code or name (`ilike`, trigram-backed). The filters are trade,
  region and price status (priced / no source / stale / low authority, read from
  the flag tokens). 50 rows per page; the URL holds the search state.
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
- An item detail view shows the price history: every observation, newest first.
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
- **Supplier price-list import (Excel or CSV):**
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

Flag tokens: `NO_SOURCE`, `SINGLE_SOURCE`, `STALE_<yyyy>`, `NON_NCR`, `LOW_AUTHORITY`.

## 8. Tests

- **Unit:**
  - the CSV parser (quoting, the column count, the trade/prefix match, flag tokens);
  - the PHP → centavos conversion (half-up, commas, ₱, no float noise);
  - the low ≤ avg ≤ high check;
  - supplier matching (code, name+unit, unmatched);
  - current-price selection.
- **DB (gated like the other DB tests):**
  - the constraints;
  - the composite fk blocks cross-tenant links;
  - RLS: tenant B sees no rows of tenant A;
  - clients cannot write;
  - the seed runs twice and inserts 0 rows the second time.
- **Route and action:**
  - without the capability → 403;
  - the flag off → 404;
  - another tenant's item → 404;
  - edit and record-price write `audit_log`.
- **e2e (gated):** search and filter on the page, and pagination.
