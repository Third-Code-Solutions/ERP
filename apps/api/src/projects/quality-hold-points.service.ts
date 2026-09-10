import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  documents,
  projects,
  punchlistItems,
  qualityHoldPointPunchlistHandoffs,
  qualityHoldPoints,
  users,
} from '@third-code-erp/database/schema'
import { createHash } from 'node:crypto'
import {
  createQualityHoldPointCommandSchema,
  qualityHoldPointAcceptCommandSchema,
  qualityHoldPointListQuerySchema,
  qualityHoldPointListResultSchema,
  qualityHoldPointMutationResultSchema,
  qualityHoldPointReadyCommandSchema,
  qualityHoldPointRejectCommandSchema,
  qualityHoldPointRowSchema,
  qualityHoldPointSubmitCommandSchema,
  updateQualityHoldPointCommandSchema,
  qualityHoldPointCreateResultSchema,
  qualityHoldPointPunchlistHandoffCommandSchema,
  qualityHoldPointPunchlistHandoffResultSchema,
  qualityHoldPointPunchlistItemRowSchema,
  type CreateQualityHoldPointCommand,
  type QualityHoldPointAcceptCommand,
  type QualityHoldPointListQuery,
  type QualityHoldPointListResult,
  type QualityHoldPointMutationResult,
  type QualityHoldPointReadyCommand,
  type QualityHoldPointRejectCommand,
  type QualityHoldPointSubmitCommand,
  type QualityHoldPointPunchlistHandoffCommand,
  type QualityHoldPointPunchlistHandoffResult,
  type QualityHoldPointPunchlistSource,
  type UpdateQualityHoldPointCommand,
} from '@third-code-erp/shared-types'
import {
  ERP_ROLES,
  roleHasCapability,
  type ErpCapability,
} from '@third-code-erp/shared-types/authorization'
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../database/database.service'

const rowSelection = {
  id: qualityHoldPoints.id,
  projectId: qualityHoldPoints.project_id,
  iwrNumber: qualityHoldPoints.iwr_number,
  title: qualityHoldPoints.title,
  description: qualityHoldPoints.description,
  discipline: qualityHoldPoints.discipline,
  location: qualityHoldPoints.location,
  planReference: qualityHoldPoints.plan_reference,
  holdPoint: qualityHoldPoints.hold_point,
  inspectionDate: qualityHoldPoints.inspection_date,
  status: qualityHoldPoints.status,
  requestNotes: qualityHoldPoints.request_notes,
  findings: qualityHoldPoints.findings,
  rejectionReason: qualityHoldPoints.rejection_reason,
  acceptanceNotes: qualityHoldPoints.acceptance_notes,
  requestedBy: qualityHoldPoints.requested_by,
  assignedTo: qualityHoldPoints.assigned_to,
  submittedAt: qualityHoldPoints.submitted_at,
  submittedBy: qualityHoldPoints.submitted_by,
  acceptedAt: qualityHoldPoints.accepted_at,
  acceptedBy: qualityHoldPoints.accepted_by,
  rejectedAt: qualityHoldPoints.rejected_at,
  rejectedBy: qualityHoldPoints.rejected_by,
  punchlistHandoffAt: qualityHoldPoints.punchlist_handoff_at,
  punchlistHandoffBy: qualityHoldPoints.punchlist_handoff_by,
  version: qualityHoldPoints.version,
  createdAt: qualityHoldPoints.created_at,
  updatedAt: qualityHoldPoints.updated_at,
}

const handoffSelection = {
  id: qualityHoldPointPunchlistHandoffs.id,
  tenantId: qualityHoldPointPunchlistHandoffs.tenant_id,
  projectId: qualityHoldPointPunchlistHandoffs.project_id,
  qualityHoldPointId: qualityHoldPointPunchlistHandoffs.quality_hold_point_id,
  clientRequestId: qualityHoldPointPunchlistHandoffs.client_request_id,
  requestHash: qualityHoldPointPunchlistHandoffs.request_hash,
  sourceIwrNumber: qualityHoldPointPunchlistHandoffs.source_iwr_number,
  sourceFindings: qualityHoldPointPunchlistHandoffs.source_findings,
  sourceRejectionReason: qualityHoldPointPunchlistHandoffs.source_rejection_reason,
  planDocumentId: qualityHoldPointPunchlistHandoffs.plan_document_id,
  createdBy: qualityHoldPointPunchlistHandoffs.created_by,
  createdAt: qualityHoldPointPunchlistHandoffs.created_at,
}

const punchlistItemSelection = {
  id: punchlistItems.id,
  projectId: punchlistItems.project_id,
  description: punchlistItems.description,
  location: punchlistItems.location,
  trade: punchlistItems.trade,
  priority: punchlistItems.priority,
  status: punchlistItems.status,
  dueDate: punchlistItems.due_date,
  assignedToUserId: punchlistItems.assigned_to_user_id,
  assignedToText: punchlistItems.assigned_to_text,
  createdAt: punchlistItems.created_at,
  createdBy: punchlistItems.created_by,
  sourceHandoffId: punchlistItems.source_handoff_id,
}

type QualityHoldPointDbRow = {
  id: string
  projectId: string
  iwrNumber: string
  title: string
  description: string
  discipline: string
  location: string
  planReference: string
  holdPoint: boolean
  inspectionDate: string | null
  status: string
  requestNotes: string
  findings: string
  rejectionReason: string
  acceptanceNotes: string
  requestedBy: string
  assignedTo: string | null
  submittedAt: Date | null
  submittedBy: string | null
  acceptedAt: Date | null
  acceptedBy: string | null
  rejectedAt: Date | null
  rejectedBy: string | null
  punchlistHandoffAt: Date | null
  punchlistHandoffBy: string | null
  version: number
  createdAt: Date
  updatedAt: Date
}

type QualityHoldPointPunchlistHandoffDbRow = {
  id: string
  tenantId: string
  projectId: string
  qualityHoldPointId: string
  clientRequestId: string
  requestHash: string
  sourceIwrNumber: string
  sourceFindings: string
  sourceRejectionReason: string
  planDocumentId: string | null
  createdBy: string
  createdAt: Date
}

type PunchlistItemDbRow = {
  id: string
  projectId: string
  description: string
  location: string | null
  trade: string | null
  priority: string
  status: string
  dueDate: Date | null
  assignedToUserId: string | null
  assignedToText: string | null
  createdAt: Date
  createdBy: string | null
  sourceHandoffId: string | null
}

function serialize(row: QualityHoldPointDbRow) {
  return qualityHoldPointRowSchema.parse({
    ...row,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    punchlistHandoffAt: row.punchlistHandoffAt?.toISOString() ?? null,
    punchlistHandoffBy: row.punchlistHandoffBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

function requestHash(input: QualityHoldPointPunchlistHandoffCommand): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(value)
}

function serializePunchlistItem(row: PunchlistItemDbRow) {
  return qualityHoldPointPunchlistItemRowSchema.parse({
    ...row,
    dueDate: row.dueDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    sourceHandoffId: row.sourceHandoffId,
  })
}

function sourceFromHandoff(
  row: QualityHoldPointPunchlistHandoffDbRow,
): QualityHoldPointPunchlistSource {
  return {
    qualityHoldPointId: row.qualityHoldPointId,
    iwrNumber: row.sourceIwrNumber,
    findings: row.sourceFindings,
    rejectionReason: row.sourceRejectionReason,
    planDocumentId: row.planDocumentId,
  }
}

function sameDraft(
  row: QualityHoldPointDbRow,
  input: Pick<
    CreateQualityHoldPointCommand,
    | 'title'
    | 'description'
    | 'discipline'
    | 'location'
    | 'planReference'
    | 'holdPoint'
    | 'inspectionDate'
    | 'assignedTo'
  >,
): boolean {
  return (
    row.title === input.title &&
    row.description === input.description &&
    row.discipline === input.discipline &&
    row.location === input.location &&
    row.planReference === input.planReference &&
    row.holdPoint === input.holdPoint &&
    row.inspectionDate === input.inspectionDate &&
    row.assignedTo === input.assignedTo
  )
}

@Injectable()
export class QualityHoldPointsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(
    projectId: string,
    query: QualityHoldPointListQuery,
    principal: ErpPrincipal,
  ): Promise<QualityHoldPointListResult> {
    const filters = qualityHoldPointListQuerySchema.parse(query)
    await this.requireMembership(principal, 'project.quality.read')
    const [project] = await this.database.client
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.tenant_id, principal.tenantId),
          isNull(projects.deleted_at),
        ),
      )
      .limit(1)
    if (!project) throw new NotFoundException('Project not found')

    const predicate = and(
      eq(qualityHoldPoints.tenant_id, principal.tenantId),
      eq(qualityHoldPoints.project_id, projectId),
      filters.status ? eq(qualityHoldPoints.status, filters.status) : undefined,
      filters.holdPoint === undefined
        ? undefined
        : eq(qualityHoldPoints.hold_point, filters.holdPoint),
    )
    const [rows, totals] = await Promise.all([
      this.database.client
        .select(rowSelection)
        .from(qualityHoldPoints)
        .where(predicate)
        .orderBy(desc(qualityHoldPoints.inspection_date), desc(qualityHoldPoints.created_at), asc(qualityHoldPoints.id))
        .limit(filters.limit)
        .offset((filters.page - 1) * filters.limit),
      this.database.client
        .select({ total: count() })
        .from(qualityHoldPoints)
        .where(predicate),
    ])
    const total = Number(totals[0]?.total ?? 0)
    return qualityHoldPointListResultSchema.parse({
      projectId,
      rows: rows.map((row) => serialize(row as QualityHoldPointDbRow)),
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    })
  }

  async create(
    command: CreateQualityHoldPointCommand,
    principal: ErpPrincipal,
  ) {
    const input = createQualityHoldPointCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(
        transaction,
        principal,
        'project.quality.manage',
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId),
            isNull(projects.deleted_at),
          ),
        )
        .limit(1)
        .for('update')
      if (!project) throw new NotFoundException('Project not found')
      await this.assertAssignedUser(transaction, authorizedPrincipal.tenantId, input.assignedTo)

      const [existingRequest] = await transaction
        .select(rowSelection)
        .from(qualityHoldPoints)
        .where(
          and(
            eq(qualityHoldPoints.tenant_id, authorizedPrincipal.tenantId),
            eq(qualityHoldPoints.client_request_id, input.clientRequestId),
          ),
        )
        .limit(1)
        .for('update')
      if (existingRequest) {
        const row = existingRequest as QualityHoldPointDbRow
        if (row.projectId !== input.projectId || !sameDraft(row, input)) {
          throw new ConflictException('Client request id was already used with a different quality request')
        }
        return qualityHoldPointCreateResultSchema.parse({
          projectId: input.projectId,
          created: false,
          changed: false,
          entry: serialize(row),
        })
      }

      const [countRow] = await transaction
        .select({ total: count() })
        .from(qualityHoldPoints)
        .where(
          and(
            eq(qualityHoldPoints.tenant_id, authorizedPrincipal.tenantId),
            eq(qualityHoldPoints.project_id, input.projectId),
          ),
        )
      const iwrNumber = `IWR-${String(Number(countRow?.total ?? 0) + 1).padStart(4, '0')}`
      const [created] = await transaction
        .insert(qualityHoldPoints)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: input.projectId,
          iwr_number: iwrNumber,
          title: input.title,
          description: input.description,
          discipline: input.discipline,
          location: input.location,
          plan_reference: input.planReference,
          hold_point: input.holdPoint,
          inspection_date: input.inspectionDate,
          requested_by: authorizedPrincipal.userId,
          assigned_to: input.assignedTo,
          client_request_id: input.clientRequestId,
          version: 1,
        })
        .returning(rowSelection)
      if (!created) throw new InternalServerErrorException('Quality request insert returned no record')
      const entry = serialize(created as QualityHoldPointDbRow)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'quality_hold_point',
        entityId: entry.id,
        action: 'create',
        diff: {
          project_id: input.projectId,
          iwr_number: entry.iwrNumber,
          hold_point: entry.holdPoint,
          plan_reference: entry.planReference,
        },
      })
      return qualityHoldPointCreateResultSchema.parse({
        projectId: input.projectId,
        created: true,
        changed: true,
        entry,
      })
    })
  }

  async handoffToPunchlist(
    projectId: string,
    entryId: string,
    command: QualityHoldPointPunchlistHandoffCommand,
    principal: ErpPrincipal,
  ): Promise<QualityHoldPointPunchlistHandoffResult> {
    const input = qualityHoldPointPunchlistHandoffCommandSchema.parse(command)
    const hash = requestHash(input)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(
        transaction,
        principal,
        'punchlist.manage',
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`quality-punchlist-handoff:${authorizedPrincipal.tenantId}:${input.clientRequestId}`}, 0))`)

      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId),
            isNull(projects.deleted_at),
          ),
        )
        .limit(1)
        .for('update')
      if (!project) throw new NotFoundException('Project not found')

      const [source] = await transaction
        .select({
          id: qualityHoldPoints.id,
          projectId: qualityHoldPoints.project_id,
          status: qualityHoldPoints.status,
          iwrNumber: qualityHoldPoints.iwr_number,
          findings: qualityHoldPoints.findings,
          rejectionReason: qualityHoldPoints.rejection_reason,
          punchlistHandoffAt: qualityHoldPoints.punchlist_handoff_at,
        })
        .from(qualityHoldPoints)
        .where(
          and(
            eq(qualityHoldPoints.id, entryId),
            eq(qualityHoldPoints.project_id, projectId),
            eq(qualityHoldPoints.tenant_id, authorizedPrincipal.tenantId),
          ),
        )
        .limit(1)
        .for('update')
      if (!source) throw new NotFoundException('Quality request not found')
      if (source.status !== 'rejected') {
        throw new ConflictException('Only rejected IWRs can be handed off to punchlist')
      }

      if (source.punchlistHandoffAt) {
        const [existing] = await transaction
          .select(handoffSelection)
          .from(qualityHoldPointPunchlistHandoffs)
          .where(
            and(
              eq(qualityHoldPointPunchlistHandoffs.tenant_id, authorizedPrincipal.tenantId),
              eq(qualityHoldPointPunchlistHandoffs.quality_hold_point_id, entryId),
            ),
          )
          .limit(1)
          .for('update')
        if (!existing) {
          throw new InternalServerErrorException('IWR punchlist lock has no handoff record')
        }
        const handoff = existing as QualityHoldPointPunchlistHandoffDbRow
        if (handoff.clientRequestId !== input.clientRequestId || handoff.requestHash !== hash) {
          throw new ConflictException('Rejected IWR is already linked to punchlist')
        }
        return this.loadPunchlistHandoffResult(transaction, handoff, false)
      }

      const [existingRequest] = await transaction
        .select(handoffSelection)
        .from(qualityHoldPointPunchlistHandoffs)
        .where(
          and(
            eq(qualityHoldPointPunchlistHandoffs.tenant_id, authorizedPrincipal.tenantId),
            eq(qualityHoldPointPunchlistHandoffs.client_request_id, input.clientRequestId),
          ),
        )
        .limit(1)
        .for('update')
      if (existingRequest) {
        const handoff = existingRequest as QualityHoldPointPunchlistHandoffDbRow
        if (
          handoff.projectId !== projectId ||
          handoff.qualityHoldPointId !== entryId ||
          handoff.requestHash !== hash
        ) {
          throw new ConflictException('Client request id was already used with a different punchlist handoff')
        }
        return this.loadPunchlistHandoffResult(transaction, handoff, false)
      }

      if (input.planDocumentId) {
        const [planDocument] = await transaction
          .select({ id: documents.id })
          .from(documents)
          .where(
            and(
              eq(documents.id, input.planDocumentId),
              eq(documents.tenant_id, authorizedPrincipal.tenantId),
              eq(documents.project_id, projectId),
            ),
          )
          .limit(1)
          .for('share')
        if (!planDocument) throw new NotFoundException('Plan document not found in project')
      }
      await this.assertPunchlistAssignees(
        transaction,
        authorizedPrincipal.tenantId,
        input.items.map((item) => item.assignedToUserId),
      )

      const [createdHandoff] = await transaction
        .insert(qualityHoldPointPunchlistHandoffs)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: projectId,
          quality_hold_point_id: entryId,
          client_request_id: input.clientRequestId,
          request_hash: hash,
          source_iwr_number: source.iwrNumber,
          source_findings: source.findings,
          source_rejection_reason: source.rejectionReason,
          plan_document_id: input.planDocumentId,
          created_by: authorizedPrincipal.userId,
        })
        .returning(handoffSelection)
      if (!createdHandoff) {
        throw new InternalServerErrorException('Punchlist handoff insert returned no record')
      }
      const handoff = createdHandoff as QualityHoldPointPunchlistHandoffDbRow

      const [createdItems] = await Promise.all([
        transaction
          .insert(punchlistItems)
          .values(
            input.items.map((item) => ({
              tenant_id: authorizedPrincipal.tenantId,
              project_id: projectId,
              description: item.description,
              location: item.location,
              trade: item.trade,
              priority: item.priority,
              due_date: toDate(item.dueDate),
              assigned_to_user_id: item.assignedToUserId,
              assigned_to_text: item.assignedToText,
              created_by: authorizedPrincipal.userId,
              source_handoff_id: handoff.id,
            })),
          )
          .returning(punchlistItemSelection),
      ])
      if (createdItems.length !== input.items.length) {
        throw new InternalServerErrorException('Punchlist item insert returned an incomplete result')
      }

      const now = new Date()
      const [lockedSource] = await transaction
        .update(qualityHoldPoints)
        .set({
          punchlist_handoff_at: now,
          punchlist_handoff_by: authorizedPrincipal.userId,
        })
        .where(
          and(
            eq(qualityHoldPoints.id, entryId),
            eq(qualityHoldPoints.project_id, projectId),
            eq(qualityHoldPoints.tenant_id, authorizedPrincipal.tenantId),
            eq(qualityHoldPoints.status, 'rejected'),
            isNull(qualityHoldPoints.punchlist_handoff_at),
          ),
        )
        .returning({ id: qualityHoldPoints.id })
      if (!lockedSource) {
        throw new ConflictException('Rejected IWR changed; retry the handoff')
      }

      const items = createdItems.map((row) => serializePunchlistItem(row as PunchlistItemDbRow))
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'quality_hold_point_punchlist_handoff',
        entityId: handoff.id,
        action: 'create',
        diff: {
          project_id: projectId,
          quality_hold_point_id: entryId,
          iwr_number: source.iwrNumber,
          source_findings: source.findings,
          source_rejection_reason: source.rejectionReason,
          plan_document_id: input.planDocumentId,
          punchlist_item_ids: items.map((item) => item.id),
        },
      })
      return qualityHoldPointPunchlistHandoffResultSchema.parse({
        projectId,
        qualityHoldPointId: entryId,
        handoffId: handoff.id,
        created: true,
        changed: true,
        source: sourceFromHandoff(handoff),
        items,
      })
    })
  }

  private async loadPunchlistHandoffResult(
    transaction: DatabaseTransaction,
    handoff: QualityHoldPointPunchlistHandoffDbRow,
    created: boolean,
  ): Promise<QualityHoldPointPunchlistHandoffResult> {
    const rows = await transaction
      .select(punchlistItemSelection)
      .from(punchlistItems)
      .where(
        and(
          eq(punchlistItems.tenant_id, handoff.tenantId),
          eq(punchlistItems.project_id, handoff.projectId),
          eq(punchlistItems.source_handoff_id, handoff.id),
        ),
      )
      .orderBy(punchlistItems.created_at, punchlistItems.id)
    if (rows.length === 0) {
      throw new InternalServerErrorException('Punchlist handoff has no linked items')
    }
    return qualityHoldPointPunchlistHandoffResultSchema.parse({
      projectId: handoff.projectId,
      qualityHoldPointId: handoff.qualityHoldPointId,
      handoffId: handoff.id,
      created,
      changed: created,
      source: sourceFromHandoff(handoff),
      items: rows.map((row) => serializePunchlistItem(row as PunchlistItemDbRow)),
    })
  }

  private async assertPunchlistAssignees(
    client: DatabaseService['client'] | DatabaseTransaction,
    tenantId: string,
    userIds: Array<string | null>,
  ): Promise<void> {
    const requested = [...new Set(userIds.filter((userId): userId is string => userId !== null))]
    if (requested.length === 0) return
    const rows = await client
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenant_id, tenantId), inArray(users.id, requested)))
    const found = new Set(rows.map((row) => row.id))
    if (requested.some((userId) => !found.has(userId))) {
      throw new NotFoundException('Assigned punchlist user not found')
    }
  }

  update(
    projectId: string,
    entryId: string,
    command: UpdateQualityHoldPointCommand,
    principal: ErpPrincipal,
  ): Promise<QualityHoldPointMutationResult> {
    return this.mutate(projectId, entryId, principal, 'update', updateQualityHoldPointCommandSchema.parse(command))
  }

  prepare(
    projectId: string,
    entryId: string,
    command: QualityHoldPointReadyCommand,
    principal: ErpPrincipal,
  ): Promise<QualityHoldPointMutationResult> {
    return this.mutate(projectId, entryId, principal, 'prepare', qualityHoldPointReadyCommandSchema.parse(command))
  }

  submit(
    projectId: string,
    entryId: string,
    command: QualityHoldPointSubmitCommand,
    principal: ErpPrincipal,
  ): Promise<QualityHoldPointMutationResult> {
    return this.mutate(projectId, entryId, principal, 'submit', qualityHoldPointSubmitCommandSchema.parse(command))
  }

  accept(
    projectId: string,
    entryId: string,
    command: QualityHoldPointAcceptCommand,
    principal: ErpPrincipal,
  ): Promise<QualityHoldPointMutationResult> {
    return this.mutate(projectId, entryId, principal, 'accept', qualityHoldPointAcceptCommandSchema.parse(command))
  }

  reject(
    projectId: string,
    entryId: string,
    command: QualityHoldPointRejectCommand,
    principal: ErpPrincipal,
  ): Promise<QualityHoldPointMutationResult> {
    return this.mutate(projectId, entryId, principal, 'reject', qualityHoldPointRejectCommandSchema.parse(command))
  }

  private async mutate(
    projectId: string,
    entryId: string,
    principal: ErpPrincipal,
    target: 'update' | 'prepare' | 'submit' | 'accept' | 'reject',
    command:
      | UpdateQualityHoldPointCommand
      | QualityHoldPointReadyCommand
      | QualityHoldPointSubmitCommand
      | QualityHoldPointAcceptCommand
      | QualityHoldPointRejectCommand,
  ): Promise<QualityHoldPointMutationResult> {
    const expectedVersion = command.expectedVersion
    const capability: ErpCapability = target === 'accept'
      ? 'project.quality.approve'
      : 'project.quality.manage'
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(transaction, principal, capability)
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.tenant_id, authorizedPrincipal.tenantId),
            isNull(projects.deleted_at),
          ),
        )
        .limit(1)
        .for('share')
      if (!project) throw new NotFoundException('Project not found')

      const [current] = await transaction
        .select(rowSelection)
        .from(qualityHoldPoints)
        .where(
          and(
            eq(qualityHoldPoints.id, entryId),
            eq(qualityHoldPoints.project_id, projectId),
            eq(qualityHoldPoints.tenant_id, authorizedPrincipal.tenantId),
          ),
        )
        .limit(1)
        .for('update')
      if (!current) throw new NotFoundException('Quality request not found')
      const row = current as QualityHoldPointDbRow
      if (row.punchlistHandoffAt) {
        throw new ConflictException('Rejected IWR is locked after punchlist handoff')
      }
      if (row.version !== expectedVersion) {
        throw new ConflictException('Quality request changed; refresh before trying again')
      }
      const before = serialize(row)
      if (target === 'update') {
        if (row.status !== 'planned' && row.status !== 'rejected') {
          throw new ConflictException('Only planned or rejected quality requests can be edited')
        }
        const input = updateQualityHoldPointCommandSchema.parse(command)
        await this.assertAssignedUser(transaction, authorizedPrincipal.tenantId, input.assignedTo)
        if (sameDraft(row, input)) {
          return qualityHoldPointMutationResultSchema.parse({ projectId, changed: false, entry: before })
        }
        const [updated] = await transaction
          .update(qualityHoldPoints)
          .set({
            title: input.title,
            description: input.description,
            discipline: input.discipline,
            location: input.location,
            plan_reference: input.planReference,
            hold_point: input.holdPoint,
            inspection_date: input.inspectionDate,
            assigned_to: input.assignedTo,
            version: row.version + 1,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(qualityHoldPoints.id, entryId),
              eq(qualityHoldPoints.project_id, projectId),
              eq(qualityHoldPoints.tenant_id, authorizedPrincipal.tenantId),
              eq(qualityHoldPoints.version, row.version),
            ),
          )
          .returning(rowSelection)
        if (!updated) throw new ConflictException('Quality request changed; refresh before trying again')
        const entry = serialize(updated as QualityHoldPointDbRow)
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'quality_hold_point',
          entityId: entryId,
          action: 'update',
          diff: { project_id: projectId, from_version: before.version, to_version: entry.version },
        })
        return qualityHoldPointMutationResultSchema.parse({ projectId, changed: true, entry })
      }

      const update: Record<string, unknown> = {
        version: row.version + 1,
        updated_at: new Date(),
      }
      let auditAction: 'status_change' | 'approve' = 'status_change'
      let nextStatus: 'ready' | 'submitted' | 'accepted' | 'rejected' = 'ready'
      if (target === 'prepare') {
        if (row.status === 'ready') {
          return qualityHoldPointMutationResultSchema.parse({ projectId, changed: false, entry: before })
        }
        if (row.status !== 'planned' && row.status !== 'rejected') {
          throw new ConflictException('Only planned or rejected quality requests can be prepared')
        }
        update.status = 'ready'
        update.rejected_at = null
        update.rejected_by = null
        update.rejection_reason = ''
        update.findings = ''
      } else if (target === 'submit') {
        if (row.status !== 'ready') throw new ConflictException('Only ready quality requests can be submitted')
        const input = qualityHoldPointSubmitCommandSchema.parse(command)
        nextStatus = 'submitted'
        update.status = nextStatus
        update.request_notes = input.requestNotes
        update.submitted_at = new Date()
        update.submitted_by = authorizedPrincipal.userId
      } else if (target === 'accept') {
        if (row.status !== 'submitted') throw new ConflictException('Only submitted quality requests can be accepted')
        const input = qualityHoldPointAcceptCommandSchema.parse(command)
        nextStatus = 'accepted'
        auditAction = 'approve'
        update.status = nextStatus
        update.findings = input.findings
        update.acceptance_notes = input.acceptanceNotes
        update.accepted_at = new Date()
        update.accepted_by = authorizedPrincipal.userId
      } else {
        if (row.status !== 'submitted') throw new ConflictException('Only submitted quality requests can be rejected')
        const input = qualityHoldPointRejectCommandSchema.parse(command)
        nextStatus = 'rejected'
        update.status = nextStatus
        update.findings = input.findings
        update.rejection_reason = input.reason
        update.rejected_at = new Date()
        update.rejected_by = authorizedPrincipal.userId
      }

      const [updated] = await transaction
        .update(qualityHoldPoints)
        .set(update)
        .where(
          and(
            eq(qualityHoldPoints.id, entryId),
            eq(qualityHoldPoints.project_id, projectId),
            eq(qualityHoldPoints.tenant_id, authorizedPrincipal.tenantId),
            eq(qualityHoldPoints.version, row.version),
          ),
        )
        .returning(rowSelection)
      if (!updated) throw new ConflictException('Quality request changed; refresh before trying again')
      const entry = serialize(updated as QualityHoldPointDbRow)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'quality_hold_point',
        entityId: entryId,
        action: auditAction,
        diff: {
          project_id: projectId,
          from_status: before.status,
          to_status: entry.status,
          from_version: before.version,
          to_version: entry.version,
          reason: entry.rejectionReason || undefined,
        },
      })
      return qualityHoldPointMutationResultSchema.parse({ projectId, changed: true, entry })
    })
  }

  private async assertAssignedUser(
    client: DatabaseService['client'] | DatabaseTransaction,
    tenantId: string,
    userId: string | null,
  ): Promise<void> {
    if (!userId) return
    const [assignee] = await client
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenant_id, tenantId)))
      .limit(1)
    if (!assignee) throw new NotFoundException('Assigned user not found')
  }

  private async requireMembership(
    principal: ErpPrincipal,
    capability: ErpCapability,
  ): Promise<ErpPrincipal> {
    return this.requireMembershipOn(this.database.client, principal, capability)
  }

  private async requireMembershipOn(
    client: DatabaseService['client'] | DatabaseTransaction,
    principal: ErpPrincipal,
    capability: ErpCapability,
  ): Promise<ErpPrincipal> {
    const [membership] = await client
      .select({ tenantId: users.tenant_id, role: users.role, email: users.email })
      .from(users)
      .where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId)))
      .limit(1)
    const role = z.enum(ERP_ROLES).safeParse(membership?.role)
    if (!membership || !role.success || !roleHasCapability(role.data, capability)) {
      throw new ForbiddenException()
    }
    return {
      userId: principal.userId,
      tenantId: membership.tenantId,
      role: role.data,
      email: membership.email,
    }
  }
}
