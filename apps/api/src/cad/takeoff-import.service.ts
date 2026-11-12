import { createHash } from 'node:crypto'
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import {
  bomLineItems,
  boms,
  boqDivisions,
  documents,
  drawingRevisions,
  projects,
  projectLocations,
  takeoffImports,
  takeoffMappingProfiles,
  takeoffUnresolvedItems,
  users,
} from '@third-code-erp/database/schema'
import {
  takeoffImportCommitResultSchema,
  takeoffImportCommandSchema,
  takeoffImportPreviewResultSchema,
  type TakeoffImportCommand,
  type TakeoffImportResult,
  type TakeoffImportRow,
} from '@third-code-erp/shared-types'
import {
  classifyBomLineKind,
  computeBomTotals,
  TAKEOFF_MAX_LINE_TOTAL_CENTAVOS,
  takeoffCommitPricing,
  takeoffCommitQuantity,
  validateTakeoffRows,
  type TakeoffValidationIssue,
} from '@third-code-erp/shared-types/bom'
import { and, desc, eq, max, sql } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

const TAKEOFF_MAPPING_VERSION = 'stable-v1'

function buildTakeoffImportKey(
  source: string,
  drawingRevisionKey: string
): string {
  return createHash('sha256')
    .update(
      `${source.trim().toLowerCase()}\n${drawingRevisionKey}\n${TAKEOFF_MAPPING_VERSION}`
    )
    .digest('hex')
}

function buildIssues(
  rows: ReadonlyArray<TakeoffImportRow>,
  requiresDupaResolution: boolean
): TakeoffValidationIssue[] {
  const issues = validateTakeoffRows(rows)
  for (const row of rows) {
    if (requiresDupaResolution) {
      issues.push({
        sourceRowKey: row.sourceRowKey,
        code: 'NO_CATALOG_MATCH',
        message:
          'AI-extracted candidates are unpriced. Match a catalog item and attach a DUPA before approval.',
      })
    }
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

/**
 * Notes from the file, kept on a new line. `[VENDOR:<id>:<name>]` in a line's
 * notes is the system's own record of the line's supplier, so a file may not
 * bring one in. Stripped until none is left: removing an inner token must not
 * join the text around it into a new one ("[VEN[VENDOR:x]DOR:id:name]").
 */
function importedNotes(notes: string | null): string | null {
  let text = notes ?? ''
  for (let previous = ''; text !== previous; ) {
    previous = text
    text = text.replace(/\[VENDOR:[^\]]*\]/gi, '')
  }
  return text.trim() || null
}

function issuesByRow(
  issues: ReadonlyArray<TakeoffValidationIssue>
): Map<string, TakeoffValidationIssue[]> {
  const result = new Map<string, TakeoffValidationIssue[]>()
  for (const issue of issues) {
    const rowIssues = result.get(issue.sourceRowKey) ?? []
    rowIssues.push(issue)
    result.set(issue.sourceRowKey, rowIssues)
  }
  return result
}

/**
 * Canonical authority for parsed spreadsheet/CSV takeoff imports. The Web
 * boundary only parses the uploaded file and forwards validated evidence; this
 * service reauthorizes the actor and commits BOM, provenance, and audit data
 * in one transaction.
 */
@Injectable()
export class TakeoffImportService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async execute(
    command: TakeoffImportCommand,
    principal: ErpPrincipal
  ): Promise<TakeoffImportResult> {
    const parsedCommand = takeoffImportCommandSchema.parse(command)
    const source = parsedCommand.source.toLowerCase()
    const sourceKey = buildTakeoffImportKey(
      source,
      parsedCommand.drawingRevisionKey
    )
    const isAiDocumentCandidate = parsedCommand.target === 'ai_document'
    const issues = buildIssues(parsedCommand.rows, isAiDocumentCandidate)
    const rowIssues = issuesByRow(issues)
    const issueRows = new Set(issues.map((issue) => issue.sourceRowKey))

    return this.database.client.transaction(async (transaction) => {
      const [membership] = await transaction
        .select({
          tenantId: users.tenant_id,
          role: users.role,
          email: users.email,
        })
        .from(users)
        .where(
          and(
            eq(users.id, principal.userId),
            eq(users.tenant_id, principal.tenantId)
          )
        )
        .limit(1)
        .for('update')

      const role = membership?.role as ErpRole | undefined
      if (!membership || !role || !roleHasCapability(role, 'bom.generate')) {
        throw new ForbiddenException()
      }
      if (
        parsedCommand.mode === 'commit' &&
        !roleHasCapability(role, 'bom.edit')
      ) {
        throw new ForbiddenException()
      }
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role,
        email: membership.email,
      }
      await this.audit.stampActor(transaction, authorizedPrincipal)

      let bomId: string
      let bomProjectId: string
      let bomStatus: string

      if (isAiDocumentCandidate) {
        if (!roleHasCapability(role, 'document.manage')) {
          throw new ForbiddenException()
        }

        const [project] = await transaction
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.id, parsedCommand.projectId),
              eq(projects.tenant_id, authorizedPrincipal.tenantId)
            )
          )
          .limit(1)
          .for('update')
        if (!project) throw new NotFoundException('Project not found')

        const [document] = await transaction
          .select({ id: documents.id })
          .from(documents)
          .where(
            and(
              eq(documents.id, parsedCommand.documentId),
              eq(documents.tenant_id, authorizedPrincipal.tenantId),
              eq(documents.project_id, project.id)
            )
          )
          .limit(1)
          .for('update')
        if (!document) throw new NotFoundException('Document not found')

        const candidateMarker = `ai_document:${document.id}`
        const [existingCandidate] = await transaction
          .select({
            id: boms.id,
            projectId: boms.project_id,
            status: boms.status,
          })
          .from(boms)
          .where(
            and(
              eq(boms.tenant_id, authorizedPrincipal.tenantId),
              eq(boms.project_id, project.id),
              sql`${boms.notes} like ${`%${candidateMarker}%`}`
            )
          )
          .orderBy(desc(boms.version))
          .limit(1)
          .for('update')

        if (existingCandidate && existingCandidate.status !== 'draft') {
          throw new ConflictException(
            `AI candidate BOM is ${existingCandidate.status}; re-extraction cannot replace it.`
          )
        }

        if (existingCandidate) {
          bomId = existingCandidate.id
          bomProjectId = existingCandidate.projectId
          bomStatus = existingCandidate.status
        } else {
          const [versionRow] = await transaction
            .select({ maxVersion: max(boms.version) })
            .from(boms)
            .where(
              and(
                eq(boms.tenant_id, authorizedPrincipal.tenantId),
                eq(boms.project_id, project.id)
              )
            )
          const [createdBom] = await transaction
            .insert(boms)
            .values({
              tenant_id: authorizedPrincipal.tenantId,
              project_id: project.id,
              created_by: authorizedPrincipal.userId,
              version: (versionRow?.maxVersion ?? 0) + 1,
              label: `AI scope candidates · ${parsedCommand.fileName}`.slice(
                0,
                255
              ),
              status: 'draft',
              total_cost_cents: 0,
              tcv_cents: 0,
              gp_cents: 0,
              gp_margin_bps: 0,
              notes:
                `AI scope candidates; ${candidateMarker}; source_model:${parsedCommand.sourceModel}; ` +
                'all rates require human catalog matching and a DUPA before approval.',
            })
            .returning({
              id: boms.id,
              projectId: boms.project_id,
              status: boms.status,
            })
          if (!createdBom) {
            throw new InternalServerErrorException(
              'AI candidate BOM was not created.'
            )
          }
          bomId = createdBom.id
          bomProjectId = createdBom.projectId
          bomStatus = createdBom.status
        }
      } else {
        const [existingBom] = await transaction
          .select({
            id: boms.id,
            projectId: boms.project_id,
            status: boms.status,
          })
          .from(boms)
          .where(
            and(
              eq(boms.id, parsedCommand.bomId),
              eq(boms.tenant_id, authorizedPrincipal.tenantId)
            )
          )
          .limit(1)
          .for('update')
        if (!existingBom) throw new NotFoundException('BOM not found')
        bomId = existingBom.id
        bomProjectId = existingBom.projectId
        bomStatus = existingBom.status
      }

      if (bomStatus !== 'draft') {
        throw new ConflictException(
          `BOM is ${bomStatus}; takeoff imports are disabled.`
        )
      }

      if (parsedCommand.mode === 'preview') {
        // A commit updates only the lines an earlier import of the same
        // source and file wrote under the same row keys; every other row is
        // added. The preview says how many of each, so the user can see that
        // an import into a BOM that already has lines adds to them.
        const [existingLines] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(bomLineItems)
          .where(
            and(
              eq(bomLineItems.bom_id, bomId),
              eq(bomLineItems.tenant_id, authorizedPrincipal.tenantId)
            )
          )
        const importedKeys = await transaction
          .select({ sourceRowKey: bomLineItems.source_row_key })
          .from(bomLineItems)
          .innerJoin(
            takeoffImports,
            and(
              eq(takeoffImports.id, bomLineItems.takeoff_import_id),
              eq(takeoffImports.tenant_id, authorizedPrincipal.tenantId)
            )
          )
          .where(
            and(
              eq(bomLineItems.bom_id, bomId),
              eq(bomLineItems.tenant_id, authorizedPrincipal.tenantId),
              eq(takeoffImports.bom_id, bomId),
              eq(takeoffImports.source, source),
              eq(takeoffImports.source_key, sourceKey)
            )
          )
        const knownKeys = new Set(importedKeys.map((line) => line.sourceRowKey))
        const matchedLineCount = new Set(
          parsedCommand.rows
            .map((row) => row.sourceRowKey)
            .filter((key) => knownKeys.has(key))
        ).size

        return takeoffImportPreviewResultSchema.parse({
          existingLineCount: existingLines?.count ?? 0,
          matchedLineCount,
          ok: true,
          mode: 'preview',
          tenantId: authorizedPrincipal.tenantId,
          bomId,
          source,
          sourceKey,
          drawingRevisionKey: parsedCommand.drawingRevisionKey,
          contentSha256: parsedCommand.contentSha256,
          rowCount: parsedCommand.rows.length,
          validCount: parsedCommand.rows.length - issueRows.size,
          unresolvedCount: issues.length + parsedCommand.missingColumns.length,
          missingColumns: parsedCommand.missingColumns,
          validationIssues: [
            ...parsedCommand.missingColumns.map((column) => ({
              sourceRowKey: 'file',
              code: 'EMPTY_DESCRIPTION' as const,
              message: `Required column "${column}" is missing.`,
            })),
            ...issues,
          ],
          rows: parsedCommand.rows.map((row) => ({
            sourceRowKey: row.sourceRowKey,
            description: row.description,
            quantity: row.quantity,
            unit: row.unit,
            division: row.division,
            location: row.location,
            itemNo: row.itemNo,
            ...(row.unitRateCentavos === undefined
              ? {}
              : { unitRateCentavos: row.unitRateCentavos }),
          })),
        })
      }

      if (parsedCommand.missingColumns.length > 0) {
        throw new UnprocessableEntityException(
          'The file cannot be committed until required columns are mapped.'
        )
      }

      const now = new Date()
      const [revision] = await transaction
        .insert(drawingRevisions)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: bomProjectId,
          source,
          source_key: parsedCommand.drawingRevisionKey,
          label: `${source} · ${parsedCommand.fileName}`,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoUpdate({
          target: [
            drawingRevisions.tenant_id,
            drawingRevisions.project_id,
            drawingRevisions.source,
            drawingRevisions.source_key,
          ],
          set: {
            label: `${source} · ${parsedCommand.fileName}`,
            updated_at: now,
          },
        })
        .returning({ id: drawingRevisions.id })
      if (!revision) {
        throw new InternalServerErrorException(
          'Drawing revision was not created.'
        )
      }

      const [mappingProfile] = await transaction
        .insert(takeoffMappingProfiles)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          source,
          name: 'default',
          mapping: parsedCommand.mapping,
          created_by: authorizedPrincipal.userId,
          updated_by: authorizedPrincipal.userId,
        })
        .onConflictDoUpdate({
          target: [
            takeoffMappingProfiles.tenant_id,
            takeoffMappingProfiles.source,
            takeoffMappingProfiles.name,
          ],
          set: {
            mapping: parsedCommand.mapping,
            updated_by: authorizedPrincipal.userId,
            updated_at: now,
          },
        })
        .returning({ id: takeoffMappingProfiles.id })
      if (!mappingProfile) {
        throw new InternalServerErrorException(
          'Mapping profile was not created.'
        )
      }

      const [takeoffImport] = await transaction
        .insert(takeoffImports)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          bom_id: bomId,
          project_id: bomProjectId,
          drawing_revision_id: revision.id,
          mapping_profile_id: mappingProfile.id,
          source,
          source_key: sourceKey,
          file_name: parsedCommand.fileName,
          content_sha256: parsedCommand.contentSha256,
          status: issues.length > 0 ? 'partially_resolved' : 'resolved',
          row_count: parsedCommand.rows.length,
          imported_count: parsedCommand.rows.length,
          unresolved_count: issues.length,
          created_by: authorizedPrincipal.userId,
          updated_by: authorizedPrincipal.userId,
        })
        .onConflictDoUpdate({
          target: [
            takeoffImports.tenant_id,
            takeoffImports.bom_id,
            takeoffImports.source,
            takeoffImports.source_key,
          ],
          set: {
            drawing_revision_id: revision.id,
            mapping_profile_id: mappingProfile.id,
            file_name: parsedCommand.fileName,
            content_sha256: parsedCommand.contentSha256,
            status: issues.length > 0 ? 'partially_resolved' : 'resolved',
            row_count: parsedCommand.rows.length,
            imported_count: parsedCommand.rows.length,
            unresolved_count: issues.length,
            updated_by: authorizedPrincipal.userId,
            updated_at: now,
          },
        })
        .returning({ id: takeoffImports.id })
      if (!takeoffImport) {
        throw new InternalServerErrorException(
          'Takeoff import was not created.'
        )
      }

      await transaction
        .update(takeoffUnresolvedItems)
        .set({
          status: 'resolved',
          resolved_by: authorizedPrincipal.userId,
          resolved_at: now,
          updated_at: now,
        })
        .where(
          and(
            eq(takeoffUnresolvedItems.tenant_id, authorizedPrincipal.tenantId),
            eq(takeoffUnresolvedItems.takeoff_import_id, takeoffImport.id),
            eq(takeoffUnresolvedItems.status, 'pending')
          )
        )

      const locations = new Map<string, string>()
      const divisions = new Map<string, string>()
      let linesUpserted = 0

      for (const [index, row] of parsedCommand.rows.entries()) {
        let locationId: string | null = null
        if (row.location) {
          locationId = locations.get(row.location) ?? null
          if (!locationId) {
            const [location] = await transaction
              .insert(projectLocations)
              .values({
                tenant_id: authorizedPrincipal.tenantId,
                project_id: bomProjectId,
                name: row.location,
                level: 'room',
                created_by: authorizedPrincipal.userId,
                updated_by: authorizedPrincipal.userId,
              })
              .onConflictDoNothing({
                target: [
                  projectLocations.tenant_id,
                  projectLocations.project_id,
                  projectLocations.name,
                ],
              })
              .returning({ id: projectLocations.id })
            locationId = location?.id ?? null
            if (!locationId) {
              const [existing] = await transaction
                .select({ id: projectLocations.id })
                .from(projectLocations)
                .where(
                  and(
                    eq(projectLocations.tenant_id, authorizedPrincipal.tenantId),
                    eq(projectLocations.project_id, bomProjectId),
                    eq(projectLocations.name, row.location)
                  )
                )
                .limit(1)
              locationId = existing?.id ?? null
            }
            if (locationId) locations.set(row.location, locationId)
          }
        }

        let divisionId: string | null = null
        if (row.division) {
          const divisionCode = row.division.trim().toLowerCase()
          divisionId = divisions.get(divisionCode) ?? null
          if (!divisionId) {
            const [division] = await transaction
              .insert(boqDivisions)
              .values({
                tenant_id: authorizedPrincipal.tenantId,
                code: divisionCode,
                name: row.division,
                created_by: authorizedPrincipal.userId,
              })
              .onConflictDoNothing({
                target: [boqDivisions.tenant_id, boqDivisions.code],
              })
              .returning({ id: boqDivisions.id })
            divisionId = division?.id ?? null
            if (!divisionId) {
              const [existing] = await transaction
                .select({ id: boqDivisions.id })
                .from(boqDivisions)
                .where(
                  and(
                    eq(boqDivisions.tenant_id, authorizedPrincipal.tenantId),
                    eq(boqDivisions.code, divisionCode)
                  )
                )
                .limit(1)
              divisionId = existing?.id ?? null
            }
            if (divisionId) divisions.set(divisionCode, divisionId)
          }
        }

        const classification = classifyBomLineKind(row.unit)
        const rowValidationIssues = rowIssues.get(row.sourceRowKey) ?? []
        const quantity = takeoffCommitQuantity(row.quantity)
        // AI candidates stay unpriced until a human attaches a DUPA.
        const pricing = takeoffCommitPricing(
          isAiDocumentCandidate ? { quantity: row.quantity } : row
        )
        const [line] = await transaction
          .insert(bomLineItems)
          .values({
            tenant_id: authorizedPrincipal.tenantId,
            bom_id: bomId,
            kind: classification.kind ?? 'work_item',
            location_id: locationId,
            division_id: divisionId,
            item_no: row.itemNo,
            drawing_revision_id: revision.id,
            takeoff_import_id: takeoffImport.id,
            source_row_key: row.sourceRowKey,
            ai_drafted: isAiDocumentCandidate,
            source_model: isAiDocumentCandidate
              ? parsedCommand.sourceModel
              : source,
            extraction_timestamp: now,
            // WO-08A: an AI candidate is unpriced until a human attaches a DUPA.
            ...(isAiDocumentCandidate
              ? { unit_rate_source: 'manual', unit_cost_cents: 0, line_total_cents: 0 }
              : {
                  unit_rate_source: pricing.unitRateSource,
                  unit_cost_cents: pricing.unitCostCents,
                  line_total_cents: pricing.lineTotalCents,
                }),
            classification_status:
              rowValidationIssues.length > 0
                ? 'review'
                : classification.status,
            classification_reason:
              rowValidationIssues.length > 0
                ? rowValidationIssues.map((issue) => issue.message).join(' ')
                : classification.reason,
            sort_order: index,
            is_group: 0,
            code: row.code ?? row.itemNo,
            description:
              row.description || `Unresolved takeoff row ${row.sourceRowKey}`,
            unit: row.unit || null,
            quantity_decimal: quantity,
            markup_bps: 0,
            notes: isAiDocumentCandidate
              ? `AI-extracted scope candidate; document:${parsedCommand.documentId}; model:${parsedCommand.sourceModel}; pricing requires DUPA before approval.`
              : importedNotes(row.notes) ?? `Takeoff source: ${source}`,
          })
          .onConflictDoUpdate({
            target: [
              bomLineItems.tenant_id,
              bomLineItems.takeoff_import_id,
              bomLineItems.source_row_key,
            ],
            set: {
              description: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.description} else excluded.description end`,
              unit: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.unit} else excluded.unit end`,
              quantity_decimal: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.quantity_decimal} else excluded.quantity_decimal end`,
              code: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.code} else excluded.code end`,
              location_id: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.location_id} else excluded.location_id end`,
              division_id: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.division_id} else excluded.division_id end`,
              item_no: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.item_no} else excluded.item_no end`,
              drawing_revision_id: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.drawing_revision_id} else excluded.drawing_revision_id end`,
              ai_drafted: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.ai_drafted} else excluded.ai_drafted end`,
              source_model: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.source_model} else excluded.source_model end`,
              extraction_timestamp: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.extraction_timestamp} else excluded.extraction_timestamp end`,
              classification_status: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.classification_status} else excluded.classification_status end`,
              classification_reason: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.classification_reason} else excluded.classification_reason end`,
              ...(pricing.unitRateSource === 'client_boq'
                ? {
                    unit_rate_source: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.unit_rate_source} else excluded.unit_rate_source end`,
                    unit_cost_cents: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.unit_cost_cents} else excluded.unit_cost_cents end`,
                    line_total_cents: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.line_total_cents} else excluded.line_total_cents end`,
                  }
                : {
                    // No usable rate in this row: the line keeps its own rate
                    // and source, priced for the new quantity (half-up). A
                    // total past the per-line cap becomes cap + 1, so the
                    // bigint cast cannot overflow and the check below fails
                    // the commit instead of Postgres.
                    line_total_cents: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.line_total_cents} else least(round(${bomLineItems.unit_cost_cents} * excluded.quantity_decimal), ${sql.raw(String(TAKEOFF_MAX_LINE_TOTAL_CENTAVOS + 1))})::bigint end`,
                  }),
              markup_bps: sql`case when ${bomLineItems.unit_rate_source} = 'dupa' then ${bomLineItems.markup_bps} else 0 end`,
              updated_at: now,
            },
          })
          .returning({
            id: bomLineItems.id,
            unitRateSource: bomLineItems.unit_rate_source,
            lineTotalCents: bomLineItems.line_total_cents,
          })
        if (!line) {
          throw new InternalServerErrorException(
            `Takeoff line ${row.sourceRowKey} was not persisted.`
          )
        }
        // Imported totals are capped before the upsert, so only a re-priced
        // line (its own rate x the new quantity) can be over the cap here.
        if (
          line.unitRateSource !== 'dupa' &&
          line.lineTotalCents > TAKEOFF_MAX_LINE_TOTAL_CENTAVOS
        ) {
          throw new UnprocessableEntityException(
            `Row ${row.sourceRowKey}: the line's rate times the new quantity exceeds the supported amount range. Lower the quantity or the line's rate.`
          )
        }
        linesUpserted += 1

        for (const issue of rowValidationIssues) {
          await transaction
            .insert(takeoffUnresolvedItems)
            .values({
              tenant_id: authorizedPrincipal.tenantId,
              takeoff_import_id: takeoffImport.id,
              bom_id: bomId,
              bom_line_item_id: line.id,
              source_row_key: row.sourceRowKey,
              reason_code: issue.code,
              reason: issue.message,
              raw_payload: row.raw,
              status: 'pending',
              created_by: authorizedPrincipal.userId,
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
                updated_at: now,
              },
            })
        }
      }

      const [pending] = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(takeoffUnresolvedItems)
        .where(
          and(
            eq(takeoffUnresolvedItems.tenant_id, authorizedPrincipal.tenantId),
            eq(takeoffUnresolvedItems.takeoff_import_id, takeoffImport.id),
            eq(takeoffUnresolvedItems.status, 'pending')
          )
        )
      const unresolvedCount = pending?.count ?? 0

      await transaction
        .update(takeoffImports)
        .set({
          status: unresolvedCount > 0 ? 'partially_resolved' : 'resolved',
          unresolved_count: unresolvedCount,
          updated_by: authorizedPrincipal.userId,
          updated_at: now,
        })
        .where(
          and(
            eq(takeoffImports.id, takeoffImport.id),
            eq(takeoffImports.tenant_id, authorizedPrincipal.tenantId)
          )
        )

      // Imported rates change the BOM, so its stored totals are recomputed
      // here with the same formula Web uses after any line edit.
      const bomLines = await transaction
        .select({
          unit_cost_cents: bomLineItems.unit_cost_cents,
          quantity: bomLineItems.quantity_decimal,
          line_total_cents: bomLineItems.line_total_cents,
          parent_line_item_id: bomLineItems.parent_line_item_id,
        })
        .from(bomLineItems)
        .where(
          and(
            eq(bomLineItems.bom_id, bomId),
            eq(bomLineItems.tenant_id, authorizedPrincipal.tenantId)
          )
        )
      let totals: ReturnType<typeof computeBomTotals>
      try {
        totals = computeBomTotals(bomLines)
      } catch (error) {
        if (!(error instanceof RangeError)) throw error
        throw new UnprocessableEntityException(
          'The BOM total would exceed the supported amount range. Lower the imported rates or quantities.'
        )
      }
      const [previousTotals] = await transaction
        .select({
          total_cost_cents: boms.total_cost_cents,
          tcv_cents: boms.tcv_cents,
          gp_cents: boms.gp_cents,
          gp_margin_bps: boms.gp_margin_bps,
        })
        .from(boms)
        .where(
          and(eq(boms.id, bomId), eq(boms.tenant_id, authorizedPrincipal.tenantId))
        )
      await transaction
        .update(boms)
        .set({ ...totals, updated_at: now })
        .where(
          and(eq(boms.id, bomId), eq(boms.tenant_id, authorizedPrincipal.tenantId))
        )

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'takeoff_import',
        entityId: takeoffImport.id,
        action: 'update',
        diff: {
          source,
          source_key: sourceKey,
          target: parsedCommand.target,
          ...(isAiDocumentCandidate
            ? {
                document_id: parsedCommand.documentId,
                source_model: parsedCommand.sourceModel,
              }
            : {}),
          rows: linesUpserted,
          unresolved_count: unresolvedCount,
          previous_bom_totals: previousTotals ?? null,
          bom_totals: totals,
          authority: 'erp_core',
        },
      })

      return takeoffImportCommitResultSchema.parse({
        ok: true,
        mode: 'commit',
        tenantId: authorizedPrincipal.tenantId,
        importId: takeoffImport.id,
        source,
        sourceKey,
        linesUpserted,
        unresolvedCount,
        bomId,
      })
    })
  }
}
