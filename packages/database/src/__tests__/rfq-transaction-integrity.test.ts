import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { bomPortalTokens, rfqs } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260729152059_rfq_transaction_integrity.sql'
  ),
  'utf8'
).toLowerCase()
const browserWriteSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260729153620_close_rfq_browser_writes.sql'
  ),
  'utf8'
).toLowerCase()

describe('RFQ transaction integrity migration', () => {
  it('rejects pre-existing duplicate tenant/BOM RFQs before enforcement', () => {
    expect(migrationSql).toMatch(
      /from public\.rfqs[\s\S]*?group by tenant_id, bom_id[\s\S]*?having count\(\*\) > 1/
    )
  })

  it('enforces one RFQ per tenant BOM', () => {
    expect(migrationSql).toMatch(
      /create unique index if not exists ux_rfqs_tenant_bom[\s\S]*?on public\.rfqs \(tenant_id, bom_id\)/
    )
  })

  it('enforces a tenant-composite BOM parent', () => {
    expect(migrationSql).toMatch(
      /constraint rfqs_bom_tenant_fk[\s\S]*?foreign key \(tenant_id, bom_id\)[\s\S]*?references public\.boms \(tenant_id, id\)/
    )
    expect(migrationSql).toContain(
      'create unique index if not exists ux_boms_tenant_id_id'
    )
    expect(migrationSql).toContain(
      'drop constraint if exists rfqs_bom_id_fkey'
    )
  })

  it('keeps RFQ workflow writes out of browser roles', () => {
    for (const policy of [
      'rfqs_tenant_insert',
      'rfqs_tenant_update',
      'rfqs_tenant_delete',
      'rfq_quotes_tenant_insert',
      'rfq_quotes_tenant_update',
      'rfq_quotes_tenant_delete',
    ]) {
      expect(browserWriteSql).toContain(
        `drop policy if exists ${policy}`
      )
    }
    expect(browserWriteSql).toMatch(
      /revoke all privileges on table public\.rfqs, public\.rfq_quotes[\s\S]*?from public, anon, authenticated/
    )
    expect(browserWriteSql).toMatch(
      /grant select on table public\.rfqs, public\.rfq_quotes[\s\S]*?to authenticated/
    )
    expect(browserWriteSql).toMatch(
      /grant all privileges on table public\.rfqs, public\.rfq_quotes[\s\S]*?to service_role/
    )
  })

  it('keeps Drizzle aligned with the composite RFQ parent constraint', () => {
    const rfqBomForeignKeys = getTableConfig(rfqs).foreignKeys
      .map((foreignKey) => foreignKey.getName())
      .filter((name) => name.includes('bom'))
    const portalBomForeignKeys = getTableConfig(
      bomPortalTokens
    ).foreignKeys
      .map((foreignKey) => foreignKey.getName())
      .filter((name) => name.includes('_bom_id_'))

    expect(rfqBomForeignKeys).toEqual(['rfqs_bom_tenant_fk'])
    expect(portalBomForeignKeys).toHaveLength(1)
  })
})
