import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  boms,
  bomLineItems,
  boqDivisions,
  drawingRevisions,
  projectLocations,
  takeoffImports,
  takeoffMappingProfiles,
  takeoffUnresolvedItems,
} from '@third-code-erp/database/schema'
import { classifyBomLineKind } from '@third-code-erp/shared-types/bom'
import { writeAuditLogInTransaction } from '@/lib/audit'
import { safeActionError } from '@/lib/safe-action-error'
import {
  buildTakeoffImportKey,
  parseStructuredTakeoff,
  sha256Digest,
  validateTakeoffRows,
  type TakeoffColumnMapping,
  type TakeoffValidationIssue,
} from '@/lib/operations/integrations/takeoff'

const MAX_FILE_BYTES = 25 * 1024 * 1024

const mappingSchema = z.object({
  sourceRowKey: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1),
  quantity: z.string().trim().min(1),
  unit: z.string().trim().min(1),
  division: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),
  itemNo: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
})

const DEFAULT_MAPPING: TakeoffColumnMapping = {
  sourceRowKey: 'row',
  description: 'description',
  quantity: 'quantity',
  unit: 'uom',
  division: 'division',
  location: 'location',
  itemNo: 'item no',
  notes: 'notes',
}

interface TakeoffPreviewResponse {
  ok: true
  mode: 'preview'
  source: string
  sourceKey: string
  drawingRevisionKey: string
  contentSha256: string
  rowCount: number
  validCount: number
  unresolvedCount: number
  missingColumns: string[]
  validationIssues: TakeoffValidationIssue[]
  rows: Array<{
    sourceRowKey: string
    description: string
    quantity: number | null
    unit: string
    division: string | null
    location: string | null
    itemNo: string | null
  }>
}

interface TakeoffCommitResponse {
  ok: true
  mode: 'commit'
  importId: string
  source: string
  sourceKey: string
  linesUpserted: number
  unresolvedCount: number
  bomId: string
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status },
  )
}

function getFormString(form: FormData, key: string): string | null {
  const value = form.get(key)
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function parseMapping(value: string | null): { mapping: TakeoffColumnMapping } | { error: string } {
  if (!value) return { mapping: DEFAULT_MAPPING }
  let candidate: unknown
  try {
    candidate = JSON.parse(value)
  } catch {
    return { error: 'mapping must be valid JSON' }
  }
  const parsed = mappingSchema.safeParse(candidate)
  return parsed.success ? { mapping: parsed.data } : { error: 'mapping is invalid' }
}

function buildIssues(
  rows: Awaited<ReturnType<typeof parseStructuredTakeoff>>['rows'],
): TakeoffValidationIssue[] {
  const issues = validateTakeoffRows(rows)
  for (const row of rows) {
    const classification = classifyBomLineKind(row.unit)
    if (classification.kind === 'material_line') {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'MATERIAL_PARENT_REQUIRED',
        message: 'Material lines need an explicit parent work item before approval.',
      })
    }
  }
  return issues
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let profile
  try {
    profile = await requireUserProfile()
  } catch {
    return errorResponse(401, 'UNAUTHENTICATED', 'Authentication is required.')
  }

  if (!can(profile.role, 'bom.generate')) {
    return errorResponse(403, 'FORBIDDEN', `Role "${profile.role}" cannot import takeoffs.`)
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return errorResponse(400, 'INVALID_MULTIPART', 'Expected multipart/form-data body.')
  }

  const file = form.get('file')
  if (!(file instanceof File)) return errorResponse(400, 'FILE_REQUIRED', 'file is required.')
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(413, 'FILE_TOO_LARGE', `file must be <= ${MAX_FILE_BYTES} bytes.`)
  }

  const bomId = getFormString(form, 'bom_id')
  if (!bomId || !z.string().uuid().safeParse(bomId).success) {
    return errorResponse(422, 'INVALID_BOM_ID', 'bom_id must be a UUID.')
  }

  const source = (getFormString(form, 'source') ?? 'generic').toLowerCase()
  const requestedDrawingKey = getFormString(form, 'drawing_revision_key')
  const mode = getFormString(form, 'mode') ?? 'preview'
  if (mode !== 'preview' && mode !== 'commit') {
    return errorResponse(422, 'INVALID_MODE', 'mode must be preview or commit.')
  }

  const parsedMapping = parseMapping(getFormString(form, 'mapping'))
  if ('error' in parsedMapping) return errorResponse(422, 'INVALID_MAPPING', parsedMapping.error)

  const buffer = Buffer.from(await file.arrayBuffer())
  const contentSha256 = sha256Digest(buffer)
  const drawingRevisionKey = requestedDrawingKey ?? file.name
  // The selected drawing revision is the import identity. Content SHA is
  // retained as evidence, but changing a file for the same revision must
  // update its rows instead of creating a second downstream identity.
  const sourceKey = buildTakeoffImportKey(source, drawingRevisionKey, 'stable-v1')

  let parsed
  try {
    parsed = await parseStructuredTakeoff(buffer, file.name, parsedMapping.mapping)
  } catch (error) {
    console.error('[takeoff-import] parse failed', error)
    return errorResponse(
      422,
      'TAKEOFF_PARSE_FAILED',
      safeActionError(error, 'The takeoff could not be parsed.'),
    )
  }

  const issues = buildIssues(parsed.rows)
  const issuesByRow = new Set(issues.map((issue) => issue.sourceRowKey))

  const [bom] = await db
    .select({ id: boms.id, project_id: boms.project_id, status: boms.status })
    .from(boms)
    .where(and(eq(boms.id, bomId), eq(boms.tenant_id, profile.tenantId)))
    .limit(1)

  if (!bom) return errorResponse(404, 'BOM_NOT_FOUND', 'BOM not found.')
  if (bom.status === 'locked' || bom.status === 'archived') {
    return errorResponse(409, 'BOM_IMMUTABLE', `BOM is ${bom.status}; takeoff imports are disabled.`)
  }

  if (mode === 'preview') {
    const response: TakeoffPreviewResponse = {
      ok: true,
      mode,
      source,
      sourceKey,
      drawingRevisionKey,
      contentSha256,
      rowCount: parsed.rows.length,
      validCount: parsed.rows.length - issuesByRow.size,
      unresolvedCount: issues.length + parsed.missingColumns.length,
      missingColumns: parsed.missingColumns,
      validationIssues: [
        ...parsed.missingColumns.map((column) => ({
          sourceRowKey: 'file',
          code: 'EMPTY_DESCRIPTION' as const,
          message: `Required column "${column}" is missing.`,
        })),
        ...issues,
      ],
      rows: parsed.rows.map((row) => ({
        sourceRowKey: row.sourceRowKey,
        description: row.description,
        quantity: row.quantity,
        unit: row.unit,
        division: row.division,
        location: row.location,
        itemNo: row.itemNo,
      })),
    }
    return NextResponse.json(response)
  }

  if (parsed.missingColumns.length > 0) {
    return errorResponse(422, 'MISSING_COLUMNS', 'The file cannot be committed until required columns are mapped.', parsed.missingColumns)
  }
  if (!can(profile.role, 'bom.edit')) {
    return errorResponse(403, 'FORBIDDEN', `Role "${profile.role}" cannot commit takeoff lines.`)
  }

  try {
    const mappingRecord = Object.fromEntries(
      Object.entries(parsedMapping.mapping).filter(([, value]) => value !== undefined),
    ) as Record<string, string>
    const response = await db.transaction(async (tx) => {
      const [revision] = await tx
        .insert(drawingRevisions)
        .values({
          tenant_id: profile.tenantId,
          project_id: bom.project_id,
          source,
          source_key: drawingRevisionKey,
          label: `${source} · ${file.name}`,
          created_by: profile.user.id,
        })
        .onConflictDoUpdate({
          target: [
            drawingRevisions.tenant_id,
            drawingRevisions.project_id,
            drawingRevisions.source,
            drawingRevisions.source_key,
          ],
          set: { label: `${source} · ${file.name}`, updated_at: new Date() },
        })
        .returning({ id: drawingRevisions.id })

      if (!revision) throw new Error('Drawing revision was not created.')

      const [mappingProfile] = await tx
        .insert(takeoffMappingProfiles)
        .values({
          tenant_id: profile.tenantId,
          source,
          name: 'default',
          mapping: mappingRecord,
          created_by: profile.user.id,
          updated_by: profile.user.id,
        })
        .onConflictDoUpdate({
          target: [
            takeoffMappingProfiles.tenant_id,
            takeoffMappingProfiles.source,
            takeoffMappingProfiles.name,
          ],
          set: { mapping: mappingRecord, updated_by: profile.user.id, updated_at: new Date() },
        })
        .returning({ id: takeoffMappingProfiles.id })

      if (!mappingProfile) throw new Error('Mapping profile was not created.')

      const [takeoffImport] = await tx
        .insert(takeoffImports)
        .values({
          tenant_id: profile.tenantId,
          bom_id: bom.id,
          project_id: bom.project_id,
          drawing_revision_id: revision.id,
          mapping_profile_id: mappingProfile.id,
          source,
          source_key: sourceKey,
          file_name: file.name,
          content_sha256: contentSha256,
          status: 'committed',
          row_count: parsed.rows.length,
          imported_count: parsed.rows.length,
          unresolved_count: issues.length,
          created_by: profile.user.id,
          updated_by: profile.user.id,
        })
        .onConflictDoUpdate({
          target: [takeoffImports.tenant_id, takeoffImports.bom_id, takeoffImports.source, takeoffImports.source_key],
          set: {
            drawing_revision_id: revision.id,
            mapping_profile_id: mappingProfile.id,
            file_name: file.name,
            content_sha256: contentSha256,
            status: issues.length > 0 ? 'partially_resolved' : 'resolved',
            row_count: parsed.rows.length,
            imported_count: parsed.rows.length,
            unresolved_count: issues.length,
            updated_by: profile.user.id,
            updated_at: new Date(),
          },
        })
        .returning({ id: takeoffImports.id })

      if (!takeoffImport) throw new Error('Takeoff import was not created.')

      await tx
        .update(takeoffUnresolvedItems)
        .set({
          status: 'resolved',
          resolved_by: profile.user.id,
          resolved_at: new Date(),
          updated_at: new Date(),
        })
        .where(
          and(
            eq(takeoffUnresolvedItems.tenant_id, profile.tenantId),
            eq(takeoffUnresolvedItems.takeoff_import_id, takeoffImport.id),
            eq(takeoffUnresolvedItems.status, 'pending'),
          ),
        )

      const locations = new Map<string, string>()
      const divisions = new Map<string, string>()
      let linesUpserted = 0

      for (const row of parsed.rows) {
        let locationId: string | null = null
        if (row.location) {
          const [location] = await tx
            .insert(projectLocations)
            .values({
              tenant_id: profile.tenantId,
              project_id: bom.project_id,
              name: row.location,
              level: 'room',
              created_by: profile.user.id,
              updated_by: profile.user.id,
            })
            .onConflictDoNothing({
              target: [projectLocations.tenant_id, projectLocations.project_id, projectLocations.name],
            })
            .returning({ id: projectLocations.id })
          locationId = location?.id ?? locations.get(row.location) ?? null
          if (!locationId) {
            const [existing] = await tx
              .select({ id: projectLocations.id })
              .from(projectLocations)
              .where(and(
                eq(projectLocations.tenant_id, profile.tenantId),
                eq(projectLocations.project_id, bom.project_id),
                eq(projectLocations.name, row.location),
              ))
              .limit(1)
            locationId = existing?.id ?? null
          }
          if (locationId) locations.set(row.location, locationId)
        }

        let divisionId: string | null = null
        if (row.division) {
          const divisionCode = row.division.trim().toLowerCase()
          const [division] = await tx
            .insert(boqDivisions)
            .values({
              tenant_id: profile.tenantId,
              code: divisionCode,
              name: row.division,
              created_by: profile.user.id,
            })
            .onConflictDoNothing({
              target: [boqDivisions.tenant_id, boqDivisions.code],
            })
            .returning({ id: boqDivisions.id })
          divisionId = division?.id ?? divisions.get(divisionCode) ?? null
          if (!divisionId) {
            const [existing] = await tx
              .select({ id: boqDivisions.id })
              .from(boqDivisions)
              .where(and(eq(boqDivisions.tenant_id, profile.tenantId), eq(boqDivisions.code, divisionCode)))
              .limit(1)
            divisionId = existing?.id ?? null
          }
          if (divisionId) divisions.set(divisionCode, divisionId)
        }

        const classification = classifyBomLineKind(row.unit)
        const rowIssues = issues.filter((issue) => issue.sourceRowKey === row.sourceRowKey)
        const quantity = Math.max(0, Math.round(row.quantity ?? 0))
        const [line] = await tx
          .insert(bomLineItems)
          .values({
            tenant_id: profile.tenantId,
            bom_id: bom.id,
            kind: classification.kind ?? 'work_item',
            location_id: locationId,
            division_id: divisionId,
            item_no: row.itemNo,
            drawing_revision_id: revision.id,
            takeoff_import_id: takeoffImport.id,
            source_row_key: row.sourceRowKey,
            ai_drafted: false,
            source_model: source,
            extraction_timestamp: new Date(),
            unit_rate_source: 'manual',
            classification_status: classification.status,
            classification_reason: rowIssues.length > 0
              ? rowIssues.map((issue) => issue.message).join(' ')
              : classification.reason,
            sort_order: parsed.rows.indexOf(row),
            is_group: 0,
            code: row.itemNo,
            description: row.description || `Unresolved takeoff row ${row.sourceRowKey}`,
            unit: row.unit || null,
            quantity,
            unit_cost_cents: 0,
            markup_bps: 0,
            line_total_cents: 0,
            notes: `Takeoff source: ${source}`,
          })
          .onConflictDoUpdate({
            target: [bomLineItems.tenant_id, bomLineItems.takeoff_import_id, bomLineItems.source_row_key],
            set: {
              description: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.description} else excluded.description end`,
              unit: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.unit} else excluded.unit end`,
              quantity: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.quantity} else excluded.quantity end`,
              code: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.code} else excluded.code end`,
              location_id: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.location_id} else excluded.location_id end`,
              division_id: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.division_id} else excluded.division_id end`,
              item_no: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.item_no} else excluded.item_no end`,
              drawing_revision_id: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.drawing_revision_id} else excluded.drawing_revision_id end`,
              source_model: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.source_model} else excluded.source_model end`,
              extraction_timestamp: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.extraction_timestamp} else excluded.extraction_timestamp end`,
              classification_status: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.classification_status} else excluded.classification_status end`,
              classification_reason: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.classification_reason} else excluded.classification_reason end`,
              unit_rate_source: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.unit_rate_source} else 'manual' end`,
              unit_cost_cents: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.unit_cost_cents} else 0 end`,
              markup_bps: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.markup_bps} else 0 end`,
              line_total_cents: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.line_total_cents} else 0 end`,
              updated_at: new Date(),
            },
          })
          .returning({ id: bomLineItems.id })

        if (!line) throw new Error(`Takeoff line ${row.sourceRowKey} was not persisted.`)
        linesUpserted += 1

        for (const issue of rowIssues) {
          await tx
            .insert(takeoffUnresolvedItems)
            .values({
              tenant_id: profile.tenantId,
              takeoff_import_id: takeoffImport.id,
              bom_id: bom.id,
              bom_line_item_id: line.id,
              source_row_key: row.sourceRowKey,
              reason_code: issue.code,
              reason: issue.message,
              raw_payload: row.raw,
              status: 'pending',
              created_by: profile.user.id,
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
                resolved_by: null,
                resolved_at: null,
                updated_at: new Date(),
              },
            })
        }
      }

      const pendingRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(takeoffUnresolvedItems)
        .where(and(
          eq(takeoffUnresolvedItems.tenant_id, profile.tenantId),
          eq(takeoffUnresolvedItems.takeoff_import_id, takeoffImport.id),
          eq(takeoffUnresolvedItems.status, 'pending'),
        ))
      const unresolvedCount = pendingRows[0]?.count ?? 0

      await tx
        .update(takeoffImports)
        .set({
          status: unresolvedCount > 0 ? 'partially_resolved' : 'resolved',
          unresolved_count: unresolvedCount,
          updated_by: profile.user.id,
          updated_at: new Date(),
        })
        .where(and(eq(takeoffImports.id, takeoffImport.id), eq(takeoffImports.tenant_id, profile.tenantId)))

      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'takeoff_import',
        entityId: takeoffImport.id,
        action: 'update',
        diff: {
          source,
          source_key: sourceKey,
          rows: linesUpserted,
          unresolved_count: unresolvedCount,
        },
      })

      const result: TakeoffCommitResponse = {
        ok: true,
        mode: 'commit',
        importId: takeoffImport.id,
        source,
        sourceKey,
        linesUpserted,
        unresolvedCount,
        bomId: bom.id,
      }
      return result
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error('[takeoff-import] commit failed', {
      tenantId: profile.tenantId,
      bomId,
      source,
      error: error instanceof Error ? error.message : String(error),
    })
    return errorResponse(500, 'TAKEOFF_COMMIT_FAILED', 'The takeoff could not be committed.')
  }
}
