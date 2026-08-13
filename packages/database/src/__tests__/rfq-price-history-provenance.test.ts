import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { priceHistory } from '../schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260813110000_rfq_price_history_provenance.sql',
  ),
  'utf8',
).toLowerCase()

describe('WO-10 RFQ price-history provenance contract', () => {
  it('adds nullable quote provenance without rewriting historical rows', () => {
    expect(migrationSql).toContain(
      'add column if not exists source_rfq_id uuid',
    )
    expect(migrationSql).toContain(
      'add column if not exists source_rfq_quote_id uuid',
    )
    expect(migrationSql).toContain(
      'create unique index if not exists ux_rfq_quotes_tenant_id_id',
    )
    expect(migrationSql).toMatch(
      /create unique index if not exists ux_price_history_tenant_rfq_quote[\s\S]*?where source_rfq_quote_id is not null/,
    )
  })

  it('enforces tenant-composite RFQ and quote provenance references', () => {
    for (const constraint of [
      'price_history_source_rfq_tenant_fk',
      'price_history_source_rfq_quote_tenant_fk',
    ]) {
      expect(migrationSql).toContain(`constraint ${constraint}`)
      expect(migrationSql).toContain(`validate constraint ${constraint}`)
    }
    expect(migrationSql).toMatch(
      /foreign key \(tenant_id, source_rfq_id\)[\s\S]*?references public\.rfqs \(tenant_id, id\)/,
    )
    expect(migrationSql).toMatch(
      /foreign key \(tenant_id, source_rfq_quote_id\)[\s\S]*?references public\.rfq_quotes \(tenant_id, id\)/,
    )
  })

  it('keeps the Drizzle table aligned with the migration contract', () => {
    const config = getTableConfig(priceHistory)
    const foreignKeys = config.foreignKeys.map((key) => key.getName())
    const indexes = config.indexes.map((index) => index.config.name)

    expect(priceHistory.source_rfq_id.notNull).toBe(false)
    expect(priceHistory.source_rfq_quote_id.notNull).toBe(false)
    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        'price_history_source_rfq_tenant_fk',
        'price_history_source_rfq_quote_tenant_fk',
      ]),
    )
    expect(indexes).toContain('idx_price_history_tenant_rfq')
    expect(indexes).toContain('ux_price_history_tenant_rfq_quote')
  })
})
