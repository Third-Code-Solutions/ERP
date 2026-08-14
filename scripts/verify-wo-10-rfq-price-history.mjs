import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function assertIncludes(source, pattern, label) {
  if (!source.includes(pattern)) {
    throw new Error(`WO-10 invariant missing: ${label}`)
  }
}

function assertNotMatches(source, pattern, label) {
  if (pattern.test(source)) {
    throw new Error(`WO-10 forbidden pattern: ${label}`)
  }
}

const migration = read('supabase/migrations/20260813110000_rfq_price_history_provenance.sql')
assertNotMatches(migration, /\b(drop|truncate)\s+(table|index|constraint|trigger|function)\b/i, 'destructive migration operation')
assertIncludes(migration, 'add column if not exists source_rfq_id uuid', 'source RFQ column')
assertIncludes(migration, 'add column if not exists source_rfq_quote_id uuid', 'source quote column')
assertIncludes(migration, 'ux_price_history_tenant_rfq_quote', 'idempotent quote-history identity')
assertIncludes(migration, 'price_history_source_rfq_tenant_fk', 'tenant-scoped RFQ foreign key')
assertIncludes(migration, 'price_history_source_rfq_quote_tenant_fk', 'tenant-scoped quote foreign key')

const workflow = read('apps/web/src/lib/procurement/rfq-workflow-service.ts')
assertIncludes(workflow, 'ensureQuotePriceHistory', 'quote history write helper')
assertIncludes(workflow, "source_type: 'quote'", 'quoted source provenance')
assertIncludes(workflow, "source_type: 'award'", 'awarded source provenance')
assertIncludes(workflow, 'awarded_rate_centavos: BigInt(quote.unit_price_cents)', 'centavo award amount')
assertIncludes(workflow, 'current_rate_centavos: BigInt(quote.unit_price_cents)', 'catalog award amount')
assertIncludes(workflow, 'writeAuditLogInTransaction', 'RFQ price audit')
assertIncludes(workflow, 'eq(priceHistory.tenant_id, params.tenantId)', 'tenant-scoped history read')
assertNotMatches(workflow, /parseFloat|\bunit_price_cents\s*\/\s*100\b/, 'floating-point pricing arithmetic')

const bomPage = read('apps/web/src/app/(dashboard)/projects/[id]/bom/page.tsx')
assertIncludes(bomPage, 'priceHistory', 'DUPA price-history read')
assertIncludes(bomPage, 'eq(priceHistory.tenant_id, profile.tenantId)', 'DUPA tenant boundary')
assertIncludes(bomPage, 'priceHistoryByCatalog', 'catalog-to-DUPA suggestion mapping')
assertIncludes(bomPage, 'isPriceHistoryStale', 'ninety-day stale calculation')

const row = read('apps/web/src/components/bom/bom-line-row.tsx')
assertIncludes(row, 'price_suggestions', 'DUPA suggestion view-model field')
assertIncludes(row, 'source_type', 'suggestion source display')
assertIncludes(row, 'occurred_at', 'suggestion date display')
assertIncludes(row, 'stale &gt;90d', 'stale warning display')
assertIncludes(row, 'BigInt', 'integer-safe centavo presentation')

console.log('WO-10 RFQ, award, price-history, DUPA suggestion, and stale-rate invariants passed')
