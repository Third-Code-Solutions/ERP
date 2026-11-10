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

- **code**: the trade prefix and a 4-digit number, for example `CN-0001`.
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

### Flags

| Flag | Meaning |
|---|---|
| `NO_SOURCE` | No price was found. The three price fields are blank. |
| `SINGLE_SOURCE` | One source only. |
| `STALE_<year>` | The newest figure found is from that year, before 2026. |
| `NON_NCR` | The source is outside Metro Manila or does not say where it is. |
| `LOW_AUTHORITY` | The only source is a cost blog, a lead-generation site, an aggregator, or a marketplace seller that is not a brand's official store. |

## How the prices were set

1. **No price is invented.** Every number comes from a page that showed it, and
   that page is in `source_url` or named in `notes`. Where nothing was found the
   price is blank and flagged `NO_SOURCE`.
2. **Several sources:** low is the lowest, high is the highest, and the average
   is the mean of what was observed.
3. **One source with a range:** the average is the midpoint.
4. **Sale and regular prices:** where a store shows both, low is the sale price
   and high is the regular price.
5. **Daily wages in Metro Manila** are never below the ₱755 legal minimum (Wage
   Order NCR-28, in force since 2026-09-26). A lower figure from an older source
   is lifted to ₱755, and the note keeps the original.
6. **Nothing is derived.** No price is worked out from an index, and no
   installed rate is built by adding up parts.

### Sources that were not used

- **CWICR** cost data. Its licence does not allow commercial use.
- **The ACEL equipment rental guidebook**, a paid publication, and any copy of it.
- **theprojectestimate.com's equipment rental table.** It is undated and may
  reproduce the ACEL guidebook. Ten earthworks rental rows that came from it were
  blanked. Other pages of that site are used and flagged `LOW_AUTHORITY`.
- Pages behind a login or a paywall, and sites with a placeholder address.

## Summary

| File | Items | Priced | No price | Before 2026 | `LOW_AUTHORITY` | Not Metro Manila |
|---|---:|---:|---:|---:|---:|---:|
| `01-earthworks.csv` | 45 | 19 | 26 | 2 | 15 | 12 |
| `02-concrete.csv` | 50 | 35 | 15 | 7 | 30 | 30 |
| `03-rebar-structural-steel.csv` | 54 | 42 | 12 | 6 | 34 | 39 |
| `04-formwork.csv` | 47 | 37 | 10 | 28 | 32 | 25 |
| `05-masonry.csv` | 45 | 38 | 7 | 5 | 22 | 18 |
| `06-waterproofing.csv` | 42 | 29 | 13 | 1 | 9 | 10 |
| `07-roofing.csv` | 55 | 49 | 6 | 3 | 24 | 23 |
| `08-doors-windows.csv` | 52 | 40 | 12 | 6 | 15 | 15 |
| `09-ceiling-drywall.csv` | 46 | 35 | 11 | 3 | 13 | 13 |
| `10-floor-wall-finishes.csv` | 52 | 41 | 11 | 7 | 12 | 19 |
| `11-paint.csv` | 50 | 39 | 11 | 3 | 9 | 14 |
| `12-plumbing-sanitary.csv` | 60 | 46 | 14 | 7 | 9 | 15 |
| `13-electrical.csv` | 66 | 64 | 2 | 5 | 7 | 8 |
| `14-fire-protection.csv` | 52 | 37 | 15 | 22 | 26 | 31 |
| `15-mechanical-hvac.csv` | 58 | 48 | 10 | 7 | 18 | 19 |
| `16-road-bridge-works.csv` | 60 | 36 | 24 | 29 | 19 | 36 |
| `17-drainage.csv` | 50 | 29 | 21 | 26 | 29 | 29 |
| `18-site-safety.csv` | 57 | 43 | 14 | 6 | 6 | 38 |
| `19-labor.csv` | 37 | 24 | 13 | 7 | 9 | 4 |
| `20-equipment.csv` | 52 | 12 | 40 | 12 | 0 | 12 |
| **Total** | **1,030** | **743** | **287** | **192** | **338** | **410** |

## Where the data is weak

Do not price these from the catalogue. Get a quotation and load it through the
supplier price-list import.

- **Equipment rental (20):** 12 of 52 items have a price, and none is from Metro
  Manila. Rental firms quote on request, and DPWH does not post its rate tables.
  What is here comes from provincial government fee schedules and budget
  ceilings, which are usually below market.
- **Drainage (17):** every priced row comes from one cost-guide site, most of it
  from 2020 or 2025. There is no installed culvert, box culvert, catch basin or
  manhole price.
- **Road and bridge works (16):** no row is a 2026 Metro Manila price for a DPWH
  pay item. Fifteen rows come from a 2013 JICA study.
- **Earthworks (01):** no heavy equipment rental rate (see the sources not used).
- **Concrete pumping (CN-0037 to CN-0040):** from supplier quotations that third
  parties uploaded to Scribd, dated about 2024.

Retail store prices (Wilcon, Electx, Buildmate, Anson's and others) are shelf
prices for single pieces. A contractor buying in volume should expect less.
