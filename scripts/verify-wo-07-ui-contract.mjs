#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const paths = {
  builder: join(root, 'apps', 'web', 'src', 'components', 'bom', 'bom-builder.tsx'),
  row: join(root, 'apps', 'web', 'src', 'components', 'bom', 'bom-line-row.tsx'),
  page: join(root, 'apps', 'web', 'src', 'app', '(dashboard)', 'projects', '[id]', 'bom', 'page.tsx'),
  actions: join(root, 'apps', 'web', 'src', 'app', '(dashboard)', 'projects', '[id]', 'bom', 'actions.ts'),
  breakdown: join(root, 'apps', 'web', 'src', 'lib', 'operations', 'bom-pricing-breakdown.ts'),
  matching: join(root, 'apps', 'web', 'src', 'lib', 'operations', 'bom-supplier-matching.ts'),
}

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, 'utf8')])),
)

function requireText(key, fragment, message = `WO-07 contract missing ${fragment}`) {
  if (!source[key].includes(fragment)) throw new Error(message)
}

function forbid(key, pattern, message) {
  if (pattern.test(source[key])) throw new Error(message)
}

requireText('builder', 'unit_rate_source')
requireText('builder', 'SupplierSwitcherPanel')
forbid('builder', /markup\s*%/i, 'BOM Builder must not expose a line-level MARKUP % input')
forbid('builder', /name\s*=\s*["']markup/i, 'BOM Builder must not expose a markup form field')

requireText('row', 'effectiveUnitRate')
requireText('row', 'dupa.unit_rate_centavos')
requireText('row', 'effectiveLineTotal')
forbid('row', /<input\b/i, 'BOM line rows must not expose an editable derived unit-cost input')
forbid('row', /markup\s*%/i, 'BOM line rows must not expose a line-level markup control')

forbid('page', /scopeItems|scope_items/, 'WO-07 BOM view must not depend on the forbidden scope_items identity')
requireText('page', 'summarizeBomPricing')
requireText('page', 'PricingBreakdown')
requireText('page', 'BomLocationRollup')

requireText('actions', 'catalog_item_id')
requireText('actions', 'inArray(priceHistory.catalog_item_id, catalogItemIds)')
forbid('actions', /inArray\(priceHistory\.description/i, 'Supplier matching must not use description identity')

for (const fragment of ['unpriced', 'unit_rate_source', 'Cost from RAG', 'Cost from Catalog']) {
  requireText('breakdown', fragment)
}
requireText('matching', 'selectCanonicalSupplierOptions')
requireText('matching', 'PRICE_STALE_AFTER_DAYS = 90')

console.log('PASS WO-07 view contract: derived rates, real pricing states, catalog-keyed supplier matching, and no markup UI')
