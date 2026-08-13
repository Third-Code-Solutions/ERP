#!/usr/bin/env node

import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { getConfiguredDemoTenantSlug } from './lib/demo-tenant.mjs'

const requireFromDatabasePackage = createRequire(
  new URL('../packages/database/package.json', import.meta.url)
)

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`
}

async function inspectDemoData() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')

  const postgres = requireFromDatabasePackage('postgres')
  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 5 })
  try {
    const tenants = await sql`
      select id::text as id, name, slug, created_at
      from public.tenants
      order by created_at, id
    `
    const demoSlug = getConfiguredDemoTenantSlug()
    const abiCandidates = tenants.filter((tenant) =>
      `${tenant.name} ${tenant.slug}`.toLowerCase().includes('abi')
    )

    const columns = await sql`
      select c.table_name, c.column_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.column_name <> 'tenant_id'
        and c.data_type in ('text', 'character varying', 'character', 'json', 'jsonb')
        and exists (
          select 1
          from information_schema.columns tc
          where tc.table_schema = c.table_schema
            and tc.table_name = c.table_name
            and tc.column_name = 'tenant_id'
        )
      order by c.table_name, c.ordinal_position
    `
    const idColumns = await sql`
      select table_name
      from information_schema.columns
      where table_schema = 'public' and column_name = 'id'
    `
    const tablesWithId = new Set(idColumns.map((row) => row.table_name))
    const groupedColumns = new Map()
    for (const column of columns) {
      groupedColumns.set(column.table_name, [
        ...(groupedColumns.get(column.table_name) ?? []),
        column.column_name,
      ])
    }

    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]))
    const e2eFieldMatches = []
    for (const [table, tableColumns] of groupedColumns) {
      const predicates = tableColumns
        .map(
          (column) =>
            `${quoteIdentifier(column)}::text like 'E2E\\_%' escape '\\'`
        )
        .join(' or ')
      const idSelect = tablesWithId.has(table)
        ? 'id::text as row_id'
        : 'null::text as row_id'
      const valueSelect = tableColumns
        .map((column) => `${quoteIdentifier(column)}::text as ${quoteIdentifier(column)}`)
        .join(', ')
      const rows = await sql.unsafe(
        `select ${idSelect}, tenant_id::text as tenant_id, ${valueSelect}
           from public.${quoteIdentifier(table)}
          where ${predicates}`
      )

      for (const row of rows) {
        const tenant = tenantById.get(row.tenant_id)
        for (const column of tableColumns) {
          const value = row[column]
          if (typeof value === 'string' && value.startsWith('E2E_')) {
            e2eFieldMatches.push({
              tenant_slug: tenant?.slug ?? 'unknown',
              table,
              row_id: row.row_id,
              column,
              value,
            })
          }
        }
      }
    }

    const singleColumnForeignKeys = await sql`
      select child_class.relname as child_table,
             child_column.attname as child_column,
             parent_class.relname as parent_table,
             parent_column.attname as parent_column
      from pg_constraint constraint_row
      join pg_class child_class
        on child_class.oid = constraint_row.conrelid
      join pg_namespace child_namespace
        on child_namespace.oid = child_class.relnamespace
      join pg_class parent_class
        on parent_class.oid = constraint_row.confrelid
      join pg_namespace parent_namespace
        on parent_namespace.oid = parent_class.relnamespace
      join lateral unnest(constraint_row.conkey) with ordinality as child_keys(attnum, position)
        on true
      join lateral unnest(constraint_row.confkey) with ordinality as parent_keys(attnum, position)
        on parent_keys.position = child_keys.position
      join pg_attribute child_column
        on child_column.attrelid = child_class.oid
       and child_column.attnum = child_keys.attnum
      join pg_attribute parent_column
        on parent_column.attrelid = parent_class.oid
       and parent_column.attnum = parent_keys.attnum
      where constraint_row.contype = 'f'
        and child_namespace.nspname = 'public'
        and parent_namespace.nspname = 'public'
        and array_length(constraint_row.conkey, 1) = 1
      order by parent_class.relname, child_class.relname, child_column.attname
    `

    const e2eParentRows = new Map()
    for (const match of e2eFieldMatches) {
      if (!match.row_id) continue
      const key = `${match.table}:${match.row_id}`
      e2eParentRows.set(key, {
        table: match.table,
        row_id: match.row_id,
        tenant_slug: match.tenant_slug,
      })
    }

    const foreignKeyReferences = []
    for (const parentRow of e2eParentRows.values()) {
      const relevantForeignKeys = singleColumnForeignKeys.filter(
        (foreignKey) => foreignKey.parent_table === parentRow.table
      )
      for (const foreignKey of relevantForeignKeys) {
        const referenceRows = await sql.unsafe(
          `select count(*)::int as reference_count
             from public.${quoteIdentifier(foreignKey.child_table)}
            where ${quoteIdentifier(foreignKey.child_column)} = $1`,
          [parentRow.row_id]
        )
        const referenceCount = referenceRows[0]?.reference_count ?? 0
        if (referenceCount > 0) {
          foreignKeyReferences.push({
            parent_tenant_slug: parentRow.tenant_slug,
            parent_table: parentRow.table,
            parent_row_id: parentRow.row_id,
            child_table: foreignKey.child_table,
            child_column: foreignKey.child_column,
            parent_column: foreignKey.parent_column,
            reference_count: referenceCount,
          })
        }
      }
    }

    const phaseMatches = await sql`
      select o.id::text as opportunity_id,
             o.tenant_id::text as tenant_id,
             t.slug as tenant_slug,
             o.stage,
             p.id::text as project_id,
             p.name as project_name,
             o.remarks
      from public.opportunities o
      left join public.projects p
        on p.id = o.project_id
       and p.tenant_id = o.tenant_id
      join public.tenants t on t.id = o.tenant_id
      where p.name = 'TH/RD CODE FINAL PHASE'
         or o.remarks = 'TH/RD CODE FINAL PHASE'
         or p.client = 'TH/RD CODE FINAL PHASE'
      order by t.slug, o.id
    `

    const po0002 = await sql`
      select po.id::text as po_id,
             po.tenant_id::text as tenant_id,
             t.slug as tenant_slug,
             po.po_number,
             po.status,
             po.project_id::text as project_id,
             p.name as project_name,
             po.vendor_id::text as vendor_id,
             v.name as vendor_name,
             po.total_cents
      from public.purchase_orders po
      join public.tenants t on t.id = po.tenant_id
      left join public.projects p
        on p.id = po.project_id
       and p.tenant_id = po.tenant_id
      left join public.vendors v
        on v.id = po.vendor_id
       and v.tenant_id = po.tenant_id
      where po.po_number = 'PO-0002'
      order by t.slug, po.id
    `

    const deliveryRows = await sql`
      select ds.id::text as delivery_id,
             ds.tenant_id::text as tenant_id,
             t.slug as tenant_slug,
             ds.purchase_order_id::text as po_id,
             po.po_number,
             ds.status,
             ds.scheduled_date,
             ds.site_address,
             ds.created_at,
             po.vendor_id::text as vendor_id,
             v.name as vendor_name
      from public.delivery_schedules ds
      join public.tenants t on t.id = ds.tenant_id
      left join public.purchase_orders po
        on po.id = ds.purchase_order_id
       and po.tenant_id = ds.tenant_id
      left join public.vendors v
        on v.id = po.vendor_id
       and v.tenant_id = ds.tenant_id
      where po.po_number = 'PO-0002'
      order by ds.created_at, ds.id
    `

    return {
      read_only: true,
      demo_tenant_slug: demoSlug,
      tenants,
      abi_candidates: abiCandidates,
      e2e_field_match_count: e2eFieldMatches.length,
      e2e_field_matches: e2eFieldMatches,
      foreign_key_reference_count: foreignKeyReferences.reduce(
        (total, reference) => total + reference.reference_count,
        0
      ),
      foreign_key_references: foreignKeyReferences,
      phase_matches: phaseMatches,
      po_0002: po0002,
      deliveries_for_po_0002: deliveryRows,
      delivery_analysis: {
        delivery_row_count: deliveryRows.length,
        distinct_delivery_ids: new Set(deliveryRows.map((row) => row.delivery_id)).size,
        distinct_purchase_order_ids: new Set(deliveryRows.map((row) => row.po_id)).size,
        join_fanout_detected:
          new Set(deliveryRows.map((row) => row.delivery_id)).size !== deliveryRows.length,
      },
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

export { inspectDemoData }

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  inspectDemoData()
    .then((report) => {
      if (process.argv.includes('--json')) {
        console.log(JSON.stringify(report, null, 2))
      } else {
        console.log(`Read-only demo audit: ${report.e2e_field_match_count} E2E field matches`)
        console.log(`ABI-like tenants: ${report.abi_candidates.length}`)
        console.log(
          `E2E foreign-key references: ${report.foreign_key_reference_count} ` +
            `across ${report.foreign_key_references.length} parent/child relationships`
        )
        console.log(
          `PO-0002 deliveries: ${report.delivery_analysis.delivery_row_count}; ` +
            `distinct POs: ${report.delivery_analysis.distinct_purchase_order_ids}; ` +
            `join fanout: ${report.delivery_analysis.join_fanout_detected ? 'YES' : 'NO'}`
        )
      }
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    })
}
