# Master construction price catalogue: research data

Reference prices for construction materials, labour and equipment in the
Philippines, one CSV per trade. Metro Manila (NCR) comes first; a price from
elsewhere is marked. The prices were researched from free public sources on
2026-11-05, and trade 20 again on 2026-11-10.

This is a starting reference, not a quotation. Check a price with a supplier
before it goes into a bid.

The table design, the seed script and the catalogue page are specified in
[`docs/erp/specs/catalogue.md`](../../docs/erp/specs/catalogue.md).

## What is in each file

Every file has the same 14 columns:

`code,name,trade,specification,unit,price_low_php,price_avg_php,price_high_php,region,price_basis,source_url,date_checked,flag,notes`

- **code**: the trade prefix and a 4-digit number, for example `CN-0001`. Numbers
  are not reused, so a file can have gaps where a row was removed.
- **prices**: pesos as plain numbers, up to 2 decimals. All three are filled, or
  all three are blank.
- **region**: `NCR`, or `National` or a region name when the source is not in
  Metro Manila.
- **price_basis**: `material_supply`, `installed_unit_cost`, `labor`,
  `equipment_rental` or `subcontract`. It may carry `;incl_VAT` or `;excl_VAT`
  when the source says so, and `;budget_ceiling` when the figure is a government
  budget for a purchase, not a price paid.
- **date_checked**: the day the source was read.
- **notes**: which source gave which number, or why the price is blank.

Changing a row after it has been seeded: the item's name, trade, specification
and unit are refreshed on the next seed run unless a person has edited the item
in the app. A row's price observation is never changed, because the history is
append-only. A new observation is recorded only when the region, the date
checked, the link or a price differs; a change to the flag, the notes or the
price basis alone is not applied. To record it, read the source again and give
the row the new `date_checked`.

### Flags

| Flag | Meaning |
|---|---|
| `NO_SOURCE` | No price was found. The three price fields are blank. |
| `SINGLE_SOURCE` | One source only. |
| `STALE_<year>` | The newest figure found is from that year, before 2026. |
| `NON_NCR` | The source is outside Metro Manila or does not say where it is. |
| `LOW_AUTHORITY` | The only source is a cost blog, a lead-generation site, an aggregator, or a marketplace seller that is not a brand's official store. |
| `SNIPPET_ONLY` | The price was read from a search engine's excerpt of the page. The page itself could not be opened to confirm it. |

## How the prices were set

1. **No price is invented.** Every number comes from a page that showed it, and
   that page is in `source_url` or named in `notes`. On 27 rows the number was
   read from a search engine's excerpt of the page, not the page; those rows are
   flagged `SNIPPET_ONLY`. Where nothing was found the price is blank and flagged
   `NO_SOURCE`.
2. **Several sources:** low is the lowest, high is the highest, and the average
   is the mean of what was observed: the ends of each source's range, or each
   source's midpoint. The note says which.
3. **One source with a range:** the average is the midpoint.
4. **Sale and regular prices:** where a store shows both, low is the sale price
   and high is the regular price. Where only one of the two was recorded, the note
   says so.
5. **Daily wages are listed once, in `19-labor.csv`.** The other files keep only
   labour priced per unit of work (per sq.m, per kg, per point). No Metro Manila
   daily wage is below the ₱755 legal minimum (Wage Order NCR-28, in force since
   2026-09-26): a lower figure from an older source is lifted to ₱755, and the
   note keeps the original. Posted monthly salaries are kept as posted, even
   where the low end is below what the daily minimum implies; the note says so.
6. **Nothing is derived.** No price is worked out from an index, and no
   installed rate is built by adding up parts.
7. **One item, one code.** No two rows share a name and a unit. Where two trades
   need the same material under different names (washed sand, 3/4 in gravel),
   both rows carry the same price and each names the other.
8. **Budget ceilings stand alone.** A government budget for a purchase is never
   averaged with shop prices. It has a row of its own marked `;budget_ceiling`,
   or it is named in a shop-price row's notes as not combined.

### Sources that were not used

- **CWICR** cost data. Its licence does not allow commercial use.
- **The ACEL equipment rental guidebook**, a paid publication, and any copy of it.
- **theprojectestimate.com's rental rate tables** (equipment, scaffolding and
  formwork). Their rates carry no date of their own (the pages were last updated
  on 11 July 2025) and may reproduce a paid rate guide. Eighteen rental rows that
  came from them were blanked. The site's purchase price lists are used and
  flagged `LOW_AUTHORITY`.
- **Scribd.** Documents there need a sign-in to read in full, and several were
  private supplier quotations uploaded by third parties. Four concrete pumping
  rows priced from them were blanked.
- Pages behind a login or a paywall, and sites that give a made-up business
  address.

A figure from a source in this list is not quoted anywhere in the files, not even
in the notes of a row whose price is blank.

Cost blogs and lead-generation sites on free hosting **are** used, among them
`metro-manila-leads.vercel.app`, `renovationcalcph.pages.dev` and
`halamanan.pages.dev`. Every row that rests only on such a site is flagged
`LOW_AUTHORITY`.

## Summary

| File | Items | Priced | No price | Before 2026 | `LOW_AUTHORITY` | Not Metro Manila |
|---|---:|---:|---:|---:|---:|---:|
| `01-earthworks.csv` | 40 | 16 | 24 | 2 | 14 | 12 |
| `02-concrete.csv` | 49 | 31 | 18 | 3 | 26 | 28 |
| `03-rebar-structural-steel.csv` | 54 | 42 | 12 | 6 | 34 | 39 |
| `04-formwork.csv` | 46 | 31 | 15 | 23 | 26 | 20 |
| `05-masonry.csv` | 40 | 33 | 7 | 2 | 17 | 15 |
| `06-waterproofing.csv` | 42 | 28 | 14 | 0 | 9 | 9 |
| `07-roofing.csv` | 55 | 49 | 6 | 3 | 24 | 23 |
| `08-doors-windows.csv` | 52 | 40 | 12 | 6 | 15 | 15 |
| `09-ceiling-drywall.csv` | 44 | 33 | 11 | 3 | 11 | 13 |
| `10-floor-wall-finishes.csv` | 49 | 38 | 11 | 5 | 9 | 17 |
| `11-paint.csv` | 49 | 37 | 12 | 2 | 8 | 13 |
| `12-plumbing-sanitary.csv` | 59 | 45 | 14 | 7 | 8 | 15 |
| `13-electrical.csv` | 65 | 63 | 2 | 5 | 6 | 8 |
| `14-fire-protection.csv` | 51 | 37 | 14 | 22 | 26 | 31 |
| `15-mechanical-hvac.csv` | 58 | 48 | 10 | 7 | 18 | 19 |
| `16-road-bridge-works.csv` | 59 | 35 | 24 | 28 | 18 | 34 |
| `17-drainage.csv` | 50 | 26 | 24 | 23 | 26 | 25 |
| `18-site-safety.csv` | 57 | 40 | 17 | 3 | 3 | 35 |
| `19-labor.csv` | 37 | 24 | 13 | 7 | 9 | 4 |
| `20-equipment.csv` | 52 | 12 | 40 | 12 | 0 | 12 |
| **Total** | **1,008** | **708** | **300** | **169** | **307** | **387** |

## Where the data is weak

Do not price these from the catalogue. Get a quotation and record it on the
item page (Record a price). A supplier price-list import is planned, not built.

- **Equipment rental (20):** 12 of 52 items have a price, and none is from Metro
  Manila. Rental firms quote on request, and DPWH does not post its rate tables.
  What is here comes from provincial government fee schedules and budget
  ceilings, which are usually below market.
- **Scaffolding and formwork rental:** the only prices are two from one Taguig
  supplier (SS-0039, SS-0045).
- **Drainage (17):** 23 of the 26 priced rows come from one cost-guide site, most
  of it from 2020 or 2025. There is no installed culvert, box culvert, catch
  basin, manhole, riprap or stone masonry price.
- **Road and bridge works (16):** no row is a 2026 Metro Manila price for a DPWH
  pay item. Fifteen rows come from a 2013 JICA study.
- **Earthworks (01):** no heavy equipment rental rate.
- **Concrete pumping (CN-0037 to CN-0040):** no price.
- **Units the source leaves unclear:** door prices per unit (DW-0001, DW-0002,
  DW-0005, DW-0006, DW-0016, DW-0030), concrete pipe per piece (DR-0001 to
  DR-0014) and EL-0016 per metre are read that way from a page that does not
  say so plainly. Their notes say so.

Retail store prices (Wilcon, Electx, Buildmate, Anson's and others) are shelf
prices for single pieces. A contractor buying in volume should expect less.

## Retired codes

These codes were used and then removed, as duplicates of another row or of a
newer price for the same item. Do not
reuse them.

`EW-0013` `EW-0024` `EW-0043` `EW-0044` `EW-0045` `CN-0009` `FW-0047` `MS-0033`
`MS-0034` `MS-0035` `MS-0044` `MS-0045` `CD-0045` `CD-0046` `FF-0045` `FF-0046`
`FF-0052` `PT-0050` `PL-0060` `EL-0060` `FP-0052` `RB-0059`
