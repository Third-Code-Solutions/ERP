// CAD auto-draft producer.
//
// CAD extraction creates candidate scope, not commercial pricing. The output
// is persisted through the same takeoff identity, validation, unresolved-row,
// and DUPA-preservation rules as structured imports. Pricing starts only when
// a work item receives a DUPA.

import { createHash } from 'node:crypto'
import { db } from '@third-code-erp/database'
import {
  boms,
  bomLineItems,
  drawingRevisions,
  scopeItems,
  takeoffImports,
  takeoffMappingProfiles,
  takeoffUnresolvedItems,
} from '@third-code-erp/database/schema'
import { and, desc, eq, like, max, or, sql } from 'drizzle-orm'
import { classifyBomLineKind } from '@third-code-erp/shared-types/bom'
import {
  buildTakeoffImportKey,
  validateTakeoffRows,
  type StructuredTakeoffRow,
  type TakeoffValidationIssue,
} from '../operations/integrations/takeoff'

const CAD_SOURCE = 'cad-ai'
const CAD_MAPPING_NAME = 'cad-ai-v1'

export interface AutoBomInput {
  tenantId: string
  projectId: string
  documentId: string
}

export interface AutoBomResult {
  bomId: string | null
  scopeCount: number
  totalCostCents: number
  totalTcvCents: number
  gpCents: number
  gpMarginBps: number
  ragMatches: number
  catalogMatches: number
  aiEstimateMatches: number
  unpriced: number
  reason?: string
}

interface CadScopeRow {
  code: string | null
  description: string
  unit: string
  quantity: number
  notes: string | null
}

function sourceModel(notes: string | null): string {
  return notes?.match(/auto-extracted\s*\(([^)]+)\)/i)?.[1]?.trim() || 'cad-extractor'
}

/** Stable row identity survives scope-item replacement during re-extraction. */
export function buildCadTakeoffRows(scope: ReadonlyArray<CadScopeRow>): StructuredTakeoffRow[] {
  return scope.map((item, index) => ({
    sourceRowKey: item.code?.trim() || `cad-row-${index + 1}`,
    description: item.description.trim(),
    quantity: Number.isFinite(item.quantity) ? item.quantity : null,
    unit: item.unit.trim(),
    division: null,
    location: null,
    itemNo: item.code?.trim() || null,
    notes: item.notes?.trim() || null,
    raw: {
      code: item.code ?? '',
      description: item.description,
      unit: item.unit,
      quantity: String(item.quantity),
      notes: item.notes ?? '',
    },
  }))
}

function buildCadIssues(rows: ReadonlyArray<StructuredTakeoffRow>): TakeoffValidationIssue[] {
  const issues = validateTakeoffRows([...rows])

  for (const row of rows) {
    // CAD extraction is intentionally not a catalog or assembly matcher.
    issues.push({
      sourceRowKey: row.sourceRowKey,
      code: 'NO_CATALOG_MATCH',
      message: 'No commercial rate is accepted from CAD extraction; attach a DUPA before pricing.',
    })

    const classification = classifyBomLineKind(row.unit)
    if (classification.kind === 'material_line') {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'MATERIAL_PARENT_REQUIRED',
        message: 'Material candidates need an explicit parent work item before approval.',
      })
    }
  }

  return issues
}

function contentDigest(scope: ReadonlyArray<CadScopeRow>): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        scope.map((item) => ({
          code: item.code,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          notes: item.notes,
        })),
      ),
    )
    .digest('hex')
}

export async function calcDraftBomFromScope(
  input: AutoBomInput,
): Promise<AutoBomResult> {
  const { tenantId, projectId, documentId } = input

  const scope = await db
    .select({
      code: scopeItems.code,
      description: scopeItems.description,
      unit: scopeItems.unit,
      quantity: scopeItems.quantity,
      notes: scopeItems.notes,
    })
    .from(scopeItems)
    .where(
      and(
        eq(scopeItems.tenant_id, tenantId),
        eq(scopeItems.project_id, projectId),
        like(scopeItems.notes, `%document:${documentId}%`),
      ),
    )
    .orderBy(scopeItems.sort_order)

  if (scope.length === 0) {
    return {
      bomId: null,
      scopeCount: 0,
      totalCostCents: 0,
      totalTcvCents: 0,
      gpCents: 0,
      gpMarginBps: 0,
      ragMatches: 0,
      catalogMatches: 0,
      aiEstimateMatches: 0,
      unpriced: 0,
      reason: 'No scope items found for this document',
    }
  }

  const scopeRows: CadScopeRow[] = scope.map((item) => ({
    code: item.code,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
    notes: item.notes,
  }))
  const takeoffRows = buildCadTakeoffRows(scopeRows)
  const issues = buildCadIssues(takeoffRows)
  const issuesByRow = new Map<string, TakeoffValidationIssue[]>()
  for (const issue of issues) {
    const rowIssues = issuesByRow.get(issue.sourceRowKey) ?? []
    rowIssues.push(issue)
    issuesByRow.set(issue.sourceRowKey, rowIssues)
  }

  const drawingRevisionKey = `document:${documentId}`
  // Keep this identity stable for a drawing revision. The digest is retained
  // as content evidence, but a changed extraction must update the same rows.
  const sourceKey = buildTakeoffImportKey(CAD_SOURCE, drawingRevisionKey, CAD_MAPPING_NAME)
  const contentSha256 = contentDigest(scopeRows)
  const extractedAt = new Date()

  const insertedBomId = await db.transaction(async (tx) => {
    const [existingAutoBom] = await tx
      .select({ id: boms.id, status: boms.status })
      .from(boms)
      .where(
        and(
          eq(boms.tenant_id, tenantId),
          eq(boms.project_id, projectId),
          or(
            like(boms.notes, `%drawing_revision:${documentId}%`),
            like(boms.notes, `%cad_takeoff_source:${CAD_SOURCE}%`),
          ),
        ),
      )
      .orderBy(desc(boms.version))
      .limit(1)

    let targetBomId = existingAutoBom?.status === 'draft' ? existingAutoBom.id : null
    if (!targetBomId) {
      const [versionRow] = await tx
        .select({ max_version: max(boms.version) })
        .from(boms)
        .where(and(eq(boms.tenant_id, tenantId), eq(boms.project_id, projectId)))
      const nextVersion = (versionRow?.max_version ?? 0) + 1

      const [bom] = await tx
        .insert(boms)
        .values({
          tenant_id: tenantId,
          project_id: projectId,
          version: nextVersion,
          status: 'draft',
          label: 'Auto-drafted from CAD upload',
          total_cost_cents: 0,
          tcv_cents: 0,
          gp_cents: 0,
          gp_margin_bps: 0,
          notes: `CAD scope candidate; drawing_revision:${documentId}; cad_takeoff_source:${CAD_SOURCE}; all rates require a DUPA before approval.`,
        })
        .returning({ id: boms.id })

      targetBomId = bom?.id ?? null
    }

    if (!targetBomId) throw new Error('CAD auto-draft BOM was not created.')

    const [revision] = await tx
      .insert(drawingRevisions)
      .values({
        tenant_id: tenantId,
        project_id: projectId,
        source: CAD_SOURCE,
        source_key: drawingRevisionKey,
        label: `CAD extraction - ${documentId}`,
      })
      .onConflictDoUpdate({
        target: [
          drawingRevisions.tenant_id,
          drawingRevisions.project_id,
          drawingRevisions.source,
          drawingRevisions.source_key,
        ],
        set: { updated_at: extractedAt },
      })
      .returning({ id: drawingRevisions.id })

    if (!revision) throw new Error('CAD drawing revision was not created.')

    const [mappingProfile] = await tx
      .insert(takeoffMappingProfiles)
      .values({
        tenant_id: tenantId,
        source: CAD_SOURCE,
        name: CAD_MAPPING_NAME,
        mapping: {
          sourceRowKey: 'scope_item.code-or-order',
          description: 'scope_item.description',
          quantity: 'scope_item.quantity',
          unit: 'scope_item.unit',
          division: 'manual assignment required',
        },
      })
      .onConflictDoUpdate({
        target: [
          takeoffMappingProfiles.tenant_id,
          takeoffMappingProfiles.source,
          takeoffMappingProfiles.name,
        ],
        set: { updated_at: extractedAt },
      })
      .returning({ id: takeoffMappingProfiles.id })

    if (!mappingProfile) throw new Error('CAD mapping profile was not created.')

    const [takeoffImport] = await tx
      .insert(takeoffImports)
      .values({
        tenant_id: tenantId,
        bom_id: targetBomId,
        project_id: projectId,
        drawing_revision_id: revision.id,
        mapping_profile_id: mappingProfile.id,
        source: CAD_SOURCE,
        source_key: sourceKey,
        file_name: `document-${documentId}.cad`,
        content_sha256: contentSha256,
        status: issues.length > 0 ? 'partially_resolved' : 'resolved',
        row_count: takeoffRows.length,
        imported_count: takeoffRows.length,
        unresolved_count: issues.length,
        updated_at: extractedAt,
      })
      .onConflictDoUpdate({
        target: [takeoffImports.tenant_id, takeoffImports.bom_id, takeoffImports.source, takeoffImports.source_key],
        set: {
          drawing_revision_id: revision.id,
          mapping_profile_id: mappingProfile.id,
          content_sha256: contentSha256,
          status: issues.length > 0 ? 'partially_resolved' : 'resolved',
          row_count: takeoffRows.length,
          imported_count: takeoffRows.length,
          unresolved_count: issues.length,
          updated_at: extractedAt,
        },
      })
      .returning({ id: takeoffImports.id })

    if (!takeoffImport) throw new Error('CAD takeoff import was not created.')

    await tx
      .update(takeoffUnresolvedItems)
      .set({
        status: 'resolved',
        resolved_at: extractedAt,
        updated_at: extractedAt,
      })
      .where(
        and(
          eq(takeoffUnresolvedItems.tenant_id, tenantId),
          eq(takeoffUnresolvedItems.takeoff_import_id, takeoffImport.id),
          eq(takeoffUnresolvedItems.status, 'pending'),
        ),
      )

    for (const [index, row] of takeoffRows.entries()) {
      const rowIssues = issuesByRow.get(row.sourceRowKey) ?? []
      const scopeItem = scopeRows[index]!
      const provenance = `AI-drafted CAD scope (${sourceModel(scopeItem.notes)}); pricing requires DUPA.`

      const [line] = await tx
        .insert(bomLineItems)
        .values({
          tenant_id: tenantId,
          bom_id: targetBomId,
          sort_order: index,
          is_group: 0,
          kind: 'work_item',
          code: scopeItem.code,
          description: row.description || `Unresolved CAD row ${row.sourceRowKey}`,
          unit: row.unit || null,
          quantity: Math.max(0, Math.round(row.quantity ?? 0)),
          drawing_revision_id: revision.id,
          takeoff_import_id: takeoffImport.id,
          source_row_key: row.sourceRowKey,
          ai_drafted: true,
          source_model: sourceModel(scopeItem.notes),
          extraction_timestamp: extractedAt,
          unit_rate_source: 'manual',
          classification_status: rowIssues.length > 0 ? 'review' : 'classified',
          classification_reason: rowIssues.length > 0
            ? rowIssues.map((issue) => issue.message).join(' ')
            : 'CAD scope candidate requires estimator review.',
          unit_cost_cents: 0,
          markup_bps: 0,
          line_total_cents: 0,
          notes: provenance,
        })
        .onConflictDoUpdate({
          target: [bomLineItems.tenant_id, bomLineItems.takeoff_import_id, bomLineItems.source_row_key],
          set: {
            code: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.code} else excluded.code end`,
            description: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.description} else excluded.description end`,
            unit: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.unit} else excluded.unit end`,
            quantity: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.quantity} else excluded.quantity end`,
            drawing_revision_id: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.drawing_revision_id} else excluded.drawing_revision_id end`,
            ai_drafted: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.ai_drafted} else true end`,
            source_model: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.source_model} else excluded.source_model end`,
            extraction_timestamp: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.extraction_timestamp} else excluded.extraction_timestamp end`,
            classification_status: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.classification_status} else excluded.classification_status end`,
            classification_reason: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.classification_reason} else excluded.classification_reason end`,
            unit_rate_source: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.unit_rate_source} else 'manual' end`,
            unit_cost_cents: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.unit_cost_cents} else 0 end`,
            markup_bps: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.markup_bps} else 0 end`,
            line_total_cents: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.line_total_cents} else 0 end`,
            // Notes intentionally stay untouched: vendor assignments are
            // mirrored there until a dedicated FK is introduced.
            updated_at: extractedAt,
          },
        })
        .returning({ id: bomLineItems.id })

      if (!line) throw new Error(`CAD row ${row.sourceRowKey} was not persisted.`)

      for (const issue of rowIssues) {
        await tx
          .insert(takeoffUnresolvedItems)
          .values({
            tenant_id: tenantId,
            takeoff_import_id: takeoffImport.id,
            bom_id: targetBomId,
            bom_line_item_id: line.id,
            source_row_key: row.sourceRowKey,
            reason_code: issue.code,
            reason: issue.message,
            raw_payload: row.raw,
            status: 'pending',
          })
          .onConflictDoUpdate({
            target: [
              takeoffUnresolvedItems.tenant_id,
              takeoffUnresolvedItems.takeoff_import_id,
              takeoffUnresolvedItems.source_row_key,
              takeoffUnresolvedItems.reason_code,
            ],
            set: {
              bom_line_item_id: line.id,
              reason: issue.message,
              raw_payload: row.raw,
              status: 'pending',
              resolved_at: null,
              updated_at: extractedAt,
            },
          })
      }
    }

    const [pending] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(takeoffUnresolvedItems)
      .where(
        and(
          eq(takeoffUnresolvedItems.tenant_id, tenantId),
          eq(takeoffUnresolvedItems.takeoff_import_id, takeoffImport.id),
          eq(takeoffUnresolvedItems.status, 'pending'),
        ),
      )
    const unresolvedCount = pending?.count ?? 0

    await tx
      .update(takeoffImports)
      .set({ unresolved_count: unresolvedCount, updated_at: extractedAt })
      .where(and(eq(takeoffImports.id, takeoffImport.id), eq(takeoffImports.tenant_id, tenantId)))

    await tx
      .update(boms)
      .set({
        total_cost_cents: 0,
        tcv_cents: 0,
        gp_cents: 0,
        gp_margin_bps: 0,
        updated_at: extractedAt,
      })
      .where(and(eq(boms.id, targetBomId), eq(boms.tenant_id, tenantId)))

    return targetBomId
  })

  return {
    bomId: insertedBomId,
    scopeCount: scope.length,
    totalCostCents: 0,
    totalTcvCents: 0,
    gpCents: 0,
    gpMarginBps: 0,
    ragMatches: 0,
    catalogMatches: 0,
    aiEstimateMatches: 0,
    unpriced: scope.length,
  }
}
