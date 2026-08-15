#!/usr/bin/env node

/**
 * Source contract gate for WO-08's generic importer and I-10 behavior.
 *
 * This intentionally checks only stable source contracts. Browser and
 * database replay are separate verification layers and must not be implied by
 * this gate.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const paths = {
  parser: join(root, 'apps', 'web', 'src', 'lib', 'operations', 'integrations', 'takeoff.ts'),
  validator: join(root, 'packages', 'shared-types', 'src', 'bom', 'takeoff.ts'),
  route: join(root, 'apps', 'web', 'src', 'app', 'api', 'bom', 'takeoff-import', 'route.ts'),
  wizard: join(root, 'apps', 'web', 'src', 'components', 'bom', 'takeoff-import-wizard.tsx'),
}

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, 'utf8')])),
)

function requireText(key, fragment, message = `WO-08 contract missing ${fragment}`) {
  if (!source[key].includes(fragment)) throw new Error(message)
}

function forbid(key, pattern, message) {
  if (pattern.test(source[key])) throw new Error(message)
}

for (const fragment of [
  "lowerName.endsWith('.csv')",
  "lowerName.endsWith('.xlsx')",
  'parseStructuredTakeoff',
  'buildTakeoffImportKey',
]) {
  requireText('parser', fragment)
}
for (const fragment of [
  'validateTakeoffRows',
  'DUPLICATE_SOURCE_ROW_KEY',
  'INVALID_UOM',
  'MISSING_DIVISION',
]) {
  requireText('validator', fragment)
}
forbid('parser', /togal/i, 'WO-08 generic parser must not be coupled to the Togal producer')

for (const fragment of [
  "mode: 'preview'",
  'takeoffMappingProfiles',
  'onConflictDoUpdate',
  'drawing_revision_id: revision.id',
  'takeoff_import_id: takeoffImport.id',
  'target: [bomLineItems.tenant_id, bomLineItems.takeoff_import_id, bomLineItems.source_row_key]',
  "unit_cost_cents: sql`case when ${bomLineItems.unit_rate_source} = 'dupa'",
  "line_total_cents: sql`case when ${bomLineItems.unit_rate_source} = 'dupa'",
  'takeoffUnresolvedItems',
]) {
  requireText('route', fragment)
}

const lineConflictStart = source.route.indexOf(
  'target: [bomLineItems.tenant_id, bomLineItems.takeoff_import_id, bomLineItems.source_row_key]',
)
const lineConflictEnd = source.route.indexOf('returning({ id: bomLineItems.id })', lineConflictStart)
if (lineConflictStart < 0 || lineConflictEnd < 0) {
  throw new Error('WO-08 importer line upsert region could not be located')
}
const lineConflict = source.route.slice(lineConflictStart, lineConflictEnd)
if (/\bnotes\s*:/.test(lineConflict)) {
  throw new Error('WO-08 re-import conflict set must not overwrite vendor evidence stored in notes')
}
forbid('route', /\.deleteFrom\(|\.delete\(bomLineItems/, 'WO-08 re-import must not delete BOM line items')

for (const fragment of [
  "run = useCallback(async (mode: 'preview' | 'commit')",
  "run('preview')",
  "run('commit')",
  'Takeoff CSV or XLSX',
  'Review before import',
  'Unresolved rows will be imported as draft scope',
]) {
  requireText('wizard', fragment)
}

console.log(
  'PASS WO-08 importer contract: generic CSV/XLSX preview, mapping/validation, drawing binding, source-row upsert, vendor/DUPA preservation, and unresolved review flow',
)
