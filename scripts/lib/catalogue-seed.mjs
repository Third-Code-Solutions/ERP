/**
 * Database half of scripts/seed-catalogue.mjs. `sql` is a postgres.js
 * transaction handle: the caller owns the transaction, so a failure anywhere
 * leaves nothing behind (and a test can roll the whole run back).
 *
 * `rows` are already validated by apps/web/src/lib/catalogue/csv.ts.
 */

// Insert new items; refresh an existing one only when no person has edited it
// (updated_by is null) and the research text actually differs.
const UPSERT_ITEMS = `
  insert into public.catalogue_items (tenant_id, code, name, trade, specification, unit)
  select $1::uuid, r.code, r.name, r.trade, r.specification, r.unit
    from jsonb_to_recordset($2::jsonb)
      as r(code text, name text, trade text, specification text, unit text)
  on conflict (tenant_id, code) do update
     set name = excluded.name,
         trade = excluded.trade,
         specification = excluded.specification,
         unit = excluded.unit,
         updated_at = now()
   where catalogue_items.updated_by is null
     and (catalogue_items.name, catalogue_items.trade,
          catalogue_items.specification, catalogue_items.unit)
         is distinct from
         (excluded.name, excluded.trade, excluded.specification, excluded.unit)
  returning (xmax = 0) as inserted
`

const COUNT_EDITED_ITEMS = `
  select count(*)::int as count
    from public.catalogue_items item
   where item.tenant_id = $1::uuid
     and item.updated_by is not null
     and item.code in (
       select r.code from jsonb_to_recordset($2::jsonb) as r(code text)
     )
`

// One research observation per priced row, unless the identical observation
// (item, region, checked_on, source_url, low, avg, high) is already there.
const INSERT_PRICES = `
  insert into public.catalogue_prices (
    tenant_id, item_id, region,
    price_low_centavos, price_avg_centavos, price_high_centavos,
    price_basis, source_kind, source_url, checked_on, flag, notes
  )
  select $1::uuid, item.id, r.region, r.low, r.avg, r.high,
         r.price_basis, 'research', r.source_url, r.checked_on, r.flag, r.notes
    from jsonb_to_recordset($2::jsonb)
      as r(code text, region text, low bigint, avg bigint, high bigint,
           price_basis text, source_url text, checked_on date, flag text, notes text)
    join public.catalogue_items item
      on item.tenant_id = $1::uuid
     and item.code = r.code
   where not exists (
     select 1
       from public.catalogue_prices existing
      where existing.tenant_id = $1::uuid
        and existing.item_id = item.id
        and existing.region = r.region
        and existing.checked_on = r.checked_on
        and existing.source_url is not distinct from r.source_url
        and existing.price_low_centavos = r.low
        and existing.price_avg_centavos = r.avg
        and existing.price_high_centavos = r.high
   )
  returning id
`

// Same chain formula and tenant lock as public.audit_log_trigger():
// sha256(prev_hash || entity_type || entity_key || action || created_at::text).
const LOCK_AUDIT_CHAIN = `
  select pg_advisory_xact_lock(hashtextextended('audit_log:' || $1::text, 0))
`
const INSERT_AUDIT_ENTRY = `
  insert into public.audit_log (
    tenant_id, actor_id, entity_type, entity_id, entity_key,
    action, diff, prev_hash, hash, created_at
  )
  select $1::uuid, null, 'catalogue_seed', entry.id, entry.id::text,
         'create', $2::jsonb, previous.hash,
         encode(
           sha256(convert_to(
             previous.hash || 'catalogue_seed' || entry.id::text || 'create'
               || entry.created_at::text,
             'UTF8'
           )),
           'hex'
         ),
         entry.created_at
    from (select gen_random_uuid() as id, clock_timestamp() as created_at) entry,
         (select coalesce(
            (select hash from public.audit_log
              where tenant_id = $1::uuid order by id desc limit 1),
            'genesis'
          ) as hash) previous
`

/**
 * @param {{ unsafe: (query: string, parameters?: unknown[]) => Promise<any[]> }} sql
 * @param {{ tenantId: string, rows: Array<Record<string, any>> }} input
 */
export async function seedCatalogue(sql, { tenantId, rows }) {
  const [tenant] = await sql.unsafe(
    'select id from public.tenants where id = $1::uuid',
    [tenantId]
  )
  if (!tenant) throw new Error(`Tenant ${tenantId} does not exist`)

  const items = JSON.stringify(
    rows.map(({ code, name, trade, specification, unit }) => ({
      code, name, trade, specification, unit,
    }))
  )
  const priced = rows.filter((row) => row.price)
  const prices = JSON.stringify(
    priced.map((row) => ({
      code: row.code,
      region: row.region,
      low: row.price.low,
      avg: row.price.avg,
      high: row.price.high,
      price_basis: row.price_basis,
      source_url: row.source_url,
      checked_on: row.checked_on,
      flag: row.flag,
      notes: row.notes,
    }))
  )

  const [edited] = await sql.unsafe(COUNT_EDITED_ITEMS, [tenantId, items])
  const upserted = await sql.unsafe(UPSERT_ITEMS, [tenantId, items])
  const insertedPrices = await sql.unsafe(INSERT_PRICES, [tenantId, prices])

  const itemsInserted = upserted.filter((row) => row.inserted).length
  const itemsUpdated = upserted.length - itemsInserted
  const counts = {
    items: rows.length,
    itemsInserted,
    itemsUpdated,
    // Edited by a person since the last seed: never overwritten.
    itemsKeptEdited: edited.count,
    itemsUnchanged: rows.length - itemsInserted - itemsUpdated - edited.count,
    pricedRows: priced.length,
    pricesInserted: insertedPrices.length,
    pricesAlreadyPresent: priced.length - insertedPrices.length,
  }

  await sql.unsafe(LOCK_AUDIT_CHAIN, [tenantId])
  await sql.unsafe(INSERT_AUDIT_ENTRY, [tenantId, JSON.stringify(counts)])
  return counts
}
