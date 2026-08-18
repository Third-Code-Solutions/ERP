#!/usr/bin/env node

/**
 * Source contract gate for WO-08A. AI/CAD output stays evidence-backed and
 * unpriced until a DUPA is attached, regardless of which CAD producer created
 * the draft.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const paths = {
  documentBom: join(root, 'apps', 'api', 'src', 'cad', 'document-processing.bom.ts'),
  coreTakeoffImport: join(root, 'apps', 'api', 'src', 'cad', 'takeoff-import.service.ts'),
  visualExtraction: join(root, 'apps', 'web', 'src', 'lib', 'vision', 'extract-from-visual.ts'),
  actions: join(root, 'apps', 'web', 'src', 'app', '(dashboard)', 'projects', '[id]', 'bom', 'actions.ts'),
  builder: join(root, 'apps', 'web', 'src', 'components', 'bom', 'bom-builder.tsx'),
  migration: join(root, 'supabase', 'migrations', '20260812190000_wo_08_takeoff_importer.sql'),
}

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, 'utf8')])),
)

function requireText(key, fragment, message = `WO-08A contract missing ${fragment}`) {
  if (!source[key].includes(fragment)) throw new Error(message)
}

function forbid(key, pattern, message) {
  if (pattern.test(source[key])) throw new Error(message)
}

// The Web AI extractor is evidence-only. It may read the uploaded document
// and call the model, but all ERP mutations must be delegated to Core.
for (const fragment of [
  'executeTakeoffImportThroughCoreApi',
  "target: 'ai_document'",
  "source: 'ai-document'",
  'sourceModel: VISION_MODEL',
  'drawingRevisionKey: `document:${documentId}`',
  'AI-derived scope candidates are unpriced',
  'attach a DUPA before approval',
]) {
  requireText('visualExtraction', fragment)
}
forbid(
  'visualExtraction',
  /from '@third-code-erp\/database(?:\/schema)?'/,
  'Web AI extraction must not import the ERP database directly',
)
forbid(
  'visualExtraction',
  /\bdb\.(?:insert|update|delete)\(/,
  'Web AI extraction must not persist ERP records outside Core',
)

// ERP Core is the canonical owner of AI-document import, review, provenance,
// upsert, and audit state. Do not restore the removed direct-Web auto-BOM path.
for (const fragment of [
  'takeoffImports',
  'takeoffUnresolvedItems',
  'drawingRevisions',
  'validateTakeoffRows',
  "parsedCommand.target === 'ai_document'",
  "roleHasCapability(role, 'document.manage')",
  'ai_drafted: isAiDocumentCandidate',
  'source_model: isAiDocumentCandidate',
  'extraction_timestamp: now',
  "unit_rate_source: 'manual'",
  'unit_cost_cents: 0',
  'line_total_cents: 0',
  'NO_CATALOG_MATCH',
  'MATERIAL_PARENT_REQUIRED',
  "authority: 'erp_core'",
]) {
  requireText('coreTakeoffImport', fragment)
}
const coreLineStart = source.coreTakeoffImport.indexOf('.insert(bomLineItems)')
const coreLineEnd = source.coreTakeoffImport.indexOf('.returning({ id: bomLineItems.id })', coreLineStart)
if (coreLineStart < 0 || coreLineEnd < 0) {
  throw new Error('ERP Core AI-document BOM line insert could not be located')
}
const coreLine = source.coreTakeoffImport.slice(coreLineStart, coreLineEnd)
if (/recommended_unit_cost_cents/.test(coreLine)) {
  throw new Error('ERP Core AI-document lines must not persist model rate recommendations')
}
forbid(
  'coreTakeoffImport',
  /unit_cost_cents:\s*row\.(?:recommended_)?unit_cost_cents/,
  'ERP Core AI-document import must not copy a source price into the BOM line',
)
forbid(
  'coreTakeoffImport',
  /line_total_cents:\s*lineTotals/,
  'ERP Core AI-document import must not persist a source-computed price',
)

for (const fragment of [
  'takeoffImports',
  'takeoffUnresolvedItems',
  'drawingRevisions',
  'validateTakeoffRows',
  'ai_drafted: true',
  "unit_rate_source: 'manual'",
  'unit_cost_cents: 0',
  'line_total_cents: 0',
  'source_model: sourceModel',
  'extraction_timestamp: extractedAt',
  'recommended_unit_cost_cents: item.recommended_unit_cost_cents',
  'raw_payload: row.raw',
]) {
  requireText('documentBom', fragment)
}
const documentLineStart = source.documentBom.indexOf('.insert(bomLineItems)')
const documentLineEnd = source.documentBom.indexOf('.returning({ id: bomLineItems.id })', documentLineStart)
if (documentLineStart < 0 || documentLineEnd < 0) {
  throw new Error('WO-08A document-processing BOM line insert could not be located')
}
const documentLine = source.documentBom.slice(documentLineStart, documentLineEnd)
forbid('documentBom', /(?:^|[^\w])unit_cost_cents:\s*item\.recommended_unit_cost_cents/, 'document-processing CAD drafts must not persist the model recommendation as price')
forbid('documentBom', /line_total_cents:\s*lineTotals/, 'document-processing CAD drafts must not persist computed line price')
if (/recommended_unit_cost_cents/.test(documentLine)) {
  throw new Error('document-processing CAD line values must not carry recommended_unit_cost_cents')
}

for (const fragment of [
  'eq(bomLineItems.ai_drafted, true)',
  "ne(bomLineItems.unit_rate_source, 'dupa')",
  'Attach a DUPA to every AI-drafted line before approval',
  'eq(takeoffUnresolvedItems.status, \'pending\')',
]) {
  requireText('actions', fragment)
}

requireText('builder', 'hasFlaggedLines')
requireText('builder', 'disabled={isPending || bom.lineItems.length === 0 || hasFlaggedLines}')
requireText('migration', 'create trigger takeoff_ai_draft_guard')
requireText('migration', 'unit_rate_source <> \'dupa\'')
requireText('migration', 'new.unit_cost_cents <> 0 or new.line_total_cents <> 0')
forbid('migration', /drop\s+trigger/i, 'WO-08A must not reintroduce destructive trigger replacement')

console.log(
  'PASS WO-08A AI/CAD contract: Web extraction delegates to ERP Core; retained drafts remain unpriced, enter unresolved review, preserve provenance, and are server-blocked from approval without DUPA',
)
