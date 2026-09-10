import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { projectSubmittals, projects, users } from '@third-code-erp/database/schema'
import {
  createProjectSubmittalCommandSchema,
  projectSubmittalCreateResultSchema,
  projectSubmittalDecisionCommandSchema,
  projectSubmittalListQuerySchema,
  projectSubmittalListResultSchema,
  projectSubmittalMutationResultSchema,
  projectSubmittalReviewStartCommandSchema,
  projectSubmittalRowSchema,
  projectSubmittalSubmitCommandSchema,
  updateProjectSubmittalCommandSchema,
  type CreateProjectSubmittalCommand,
  type ProjectSubmittalDecisionCommand,
  type ProjectSubmittalListQuery,
  type ProjectSubmittalListResult,
  type ProjectSubmittalMutationResult,
  type ProjectSubmittalReviewStartCommand,
  type ProjectSubmittalSubmitCommand,
  type ProjectSubmittalRow,
  type UpdateProjectSubmittalCommand,
} from '@third-code-erp/shared-types'
import {
  ERP_ROLES,
  roleHasCapability,
  type ErpCapability,
} from '@third-code-erp/shared-types/authorization'
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../database/database.service'

const rowSelection = {
  id: projectSubmittals.id,
  projectId: projectSubmittals.project_id,
  submittalNumber: projectSubmittals.submittal_number,
  title: projectSubmittals.title,
  description: projectSubmittals.description,
  specSection: projectSubmittals.spec_section,
  discipline: projectSubmittals.discipline,
  planReference: projectSubmittals.plan_reference,
  dueDate: projectSubmittals.due_date,
  status: projectSubmittals.status,
  submissionNotes: projectSubmittals.submission_notes,
  reviewNotes: projectSubmittals.review_notes,
  rejectionReason: projectSubmittals.rejection_reason,
  requestedBy: projectSubmittals.requested_by,
  assignedTo: projectSubmittals.assigned_to,
  submittedAt: projectSubmittals.submitted_at,
  submittedBy: projectSubmittals.submitted_by,
  reviewStartedAt: projectSubmittals.review_started_at,
  reviewStartedBy: projectSubmittals.review_started_by,
  reviewedAt: projectSubmittals.reviewed_at,
  reviewedBy: projectSubmittals.reviewed_by,
  version: projectSubmittals.version,
  createdAt: projectSubmittals.created_at,
  updatedAt: projectSubmittals.updated_at,
}

type ProjectSubmittalDbRow = {
  id: string
  projectId: string
  submittalNumber: string
  title: string
  description: string
  specSection: string
  discipline: string
  planReference: string
  dueDate: string | null
  status: string
  submissionNotes: string
  reviewNotes: string
  rejectionReason: string
  requestedBy: string
  assignedTo: string | null
  submittedAt: Date | null
  submittedBy: string | null
  reviewStartedAt: Date | null
  reviewStartedBy: string | null
  reviewedAt: Date | null
  reviewedBy: string | null
  version: number
  createdAt: Date
  updatedAt: Date
}

function serialize(row: ProjectSubmittalDbRow): ProjectSubmittalRow {
  return projectSubmittalRowSchema.parse({
    ...row,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    reviewStartedAt: row.reviewStartedAt?.toISOString() ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

function sameDraft(
  row: ProjectSubmittalDbRow,
  input: Pick<CreateProjectSubmittalCommand, 'title' | 'description' | 'specSection' | 'discipline' | 'planReference' | 'dueDate' | 'assignedTo'>,
): boolean {
  return row.title === input.title && row.description === input.description && row.specSection === input.specSection && row.discipline === input.discipline && row.planReference === input.planReference && row.dueDate === input.dueDate && row.assignedTo === input.assignedTo
}

@Injectable()
export class ProjectSubmittalsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(projectId: string, query: ProjectSubmittalListQuery, principal: ErpPrincipal): Promise<ProjectSubmittalListResult> {
    const filters = projectSubmittalListQuerySchema.parse(query)
    await this.requireMembership(principal, 'project.submittal.read')
    const [project] = await this.database.client.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenant_id, principal.tenantId), isNull(projects.deleted_at))).limit(1)
    if (!project) throw new NotFoundException('Project not found')
    const predicate = and(
      eq(projectSubmittals.tenant_id, principal.tenantId),
      eq(projectSubmittals.project_id, projectId),
      filters.status ? eq(projectSubmittals.status, filters.status) : undefined,
    )
    const [rows, totals] = await Promise.all([
      this.database.client.select(rowSelection).from(projectSubmittals).where(predicate).orderBy(asc(projectSubmittals.due_date), desc(projectSubmittals.created_at), asc(projectSubmittals.id)).limit(filters.limit).offset((filters.page - 1) * filters.limit),
      this.database.client.select({ total: count() }).from(projectSubmittals).where(predicate),
    ])
    const total = Number(totals[0]?.total ?? 0)
    return projectSubmittalListResultSchema.parse({ projectId, rows: rows.map((row) => serialize(row as ProjectSubmittalDbRow)), total, page: filters.page, limit: filters.limit, totalPages: Math.max(1, Math.ceil(total / filters.limit)) })
  }

  async create(command: CreateProjectSubmittalCommand, principal: ErpPrincipal) {
    const input = createProjectSubmittalCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(transaction, principal, 'project.submittal.manage')
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const [project] = await transaction.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.tenant_id, authorizedPrincipal.tenantId), isNull(projects.deleted_at))).limit(1).for('update')
      if (!project) throw new NotFoundException('Project not found')
      await this.assertAssignedUser(transaction, authorizedPrincipal.tenantId, input.assignedTo)
      const [existingRequest] = await transaction.select(rowSelection).from(projectSubmittals).where(and(eq(projectSubmittals.tenant_id, authorizedPrincipal.tenantId), eq(projectSubmittals.client_request_id, input.clientRequestId))).limit(1).for('update')
      if (existingRequest) {
        const row = existingRequest as ProjectSubmittalDbRow
        if (row.projectId !== input.projectId || !sameDraft(row, input)) throw new ConflictException('Client request id was already used with a different submittal')
        return projectSubmittalCreateResultSchema.parse({ projectId: input.projectId, created: false, changed: false, submittal: serialize(row) })
      }
      const [countRow] = await transaction.select({ total: count() }).from(projectSubmittals).where(and(eq(projectSubmittals.tenant_id, authorizedPrincipal.tenantId), eq(projectSubmittals.project_id, input.projectId)))
      const submittalNumber = `SUB-${String(Number(countRow?.total ?? 0) + 1).padStart(4, '0')}`
      const [created] = await transaction.insert(projectSubmittals).values({ tenant_id: authorizedPrincipal.tenantId, project_id: input.projectId, submittal_number: submittalNumber, title: input.title, description: input.description, spec_section: input.specSection, discipline: input.discipline, plan_reference: input.planReference, due_date: input.dueDate, requested_by: authorizedPrincipal.userId, assigned_to: input.assignedTo, client_request_id: input.clientRequestId, version: 1 }).returning(rowSelection)
      if (!created) throw new InternalServerErrorException('Submittal insert returned no record')
      const submittal = serialize(created as ProjectSubmittalDbRow)
      await this.audit.writeSemantic(transaction, { tenantId: authorizedPrincipal.tenantId, actorId: authorizedPrincipal.userId, entityType: 'project_submittal', entityId: submittal.id, action: 'create', diff: { project_id: input.projectId, submittal_number: submittal.submittalNumber, plan_reference: submittal.planReference } })
      return projectSubmittalCreateResultSchema.parse({ projectId: input.projectId, created: true, changed: true, submittal })
    })
  }

  update(projectId: string, submittalId: string, command: UpdateProjectSubmittalCommand, principal: ErpPrincipal): Promise<ProjectSubmittalMutationResult> {
    return this.mutate(projectId, submittalId, principal, 'update', updateProjectSubmittalCommandSchema.parse(command))
  }

  submit(projectId: string, submittalId: string, command: ProjectSubmittalSubmitCommand, principal: ErpPrincipal): Promise<ProjectSubmittalMutationResult> {
    return this.mutate(projectId, submittalId, principal, 'submit', projectSubmittalSubmitCommandSchema.parse(command))
  }

  startReview(projectId: string, submittalId: string, command: ProjectSubmittalReviewStartCommand, principal: ErpPrincipal): Promise<ProjectSubmittalMutationResult> {
    return this.mutate(projectId, submittalId, principal, 'start_review', projectSubmittalReviewStartCommandSchema.parse(command))
  }

  decide(projectId: string, submittalId: string, command: ProjectSubmittalDecisionCommand, principal: ErpPrincipal): Promise<ProjectSubmittalMutationResult> {
    return this.mutate(projectId, submittalId, principal, 'decide', projectSubmittalDecisionCommandSchema.parse(command))
  }

  private async mutate(
    projectId: string,
    submittalId: string,
    principal: ErpPrincipal,
    target: 'update' | 'submit' | 'start_review' | 'decide',
    command: UpdateProjectSubmittalCommand | ProjectSubmittalSubmitCommand | ProjectSubmittalReviewStartCommand | ProjectSubmittalDecisionCommand,
  ): Promise<ProjectSubmittalMutationResult> {
    const capability: ErpCapability = target === 'start_review' || target === 'decide' ? 'project.submittal.review' : 'project.submittal.manage'
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(transaction, principal, capability)
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const [project] = await transaction.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenant_id, authorizedPrincipal.tenantId), isNull(projects.deleted_at))).limit(1).for('share')
      if (!project) throw new NotFoundException('Project not found')
      const [current] = await transaction.select(rowSelection).from(projectSubmittals).where(and(eq(projectSubmittals.id, submittalId), eq(projectSubmittals.project_id, projectId), eq(projectSubmittals.tenant_id, authorizedPrincipal.tenantId))).limit(1).for('update')
      if (!current) throw new NotFoundException('Project submittal not found')
      const row = current as ProjectSubmittalDbRow
      if (row.version !== command.expectedVersion) throw new ConflictException('Submittal changed; refresh before trying again')
      const before = serialize(row)

      if (target === 'update') {
        if (row.status !== 'draft' && row.status !== 'rejected') throw new ConflictException('Only draft or rejected submittals can be edited')
        const input = updateProjectSubmittalCommandSchema.parse(command)
        await this.assertAssignedUser(transaction, authorizedPrincipal.tenantId, input.assignedTo)
        if (sameDraft(row, input)) return projectSubmittalMutationResultSchema.parse({ projectId, changed: false, submittal: before })
        const [updated] = await transaction.update(projectSubmittals).set({ title: input.title, description: input.description, spec_section: input.specSection, discipline: input.discipline, plan_reference: input.planReference, due_date: input.dueDate, assigned_to: input.assignedTo, version: row.version + 1, updated_at: new Date() }).where(and(eq(projectSubmittals.id, submittalId), eq(projectSubmittals.project_id, projectId), eq(projectSubmittals.tenant_id, authorizedPrincipal.tenantId), eq(projectSubmittals.version, row.version))).returning(rowSelection)
        if (!updated) throw new ConflictException('Submittal changed; refresh before trying again')
        return this.finishMutation(transaction, authorizedPrincipal, projectId, submittalId, before, updated as ProjectSubmittalDbRow, 'update')
      }

      const update: Partial<typeof projectSubmittals.$inferInsert> = { version: row.version + 1, updated_at: new Date() }
      let action: 'status_change' | 'approve' = 'status_change'
      if (target === 'submit') {
        if (row.status !== 'draft' && row.status !== 'rejected') throw new ConflictException('Only draft or rejected submittals can be submitted')
        const input = projectSubmittalSubmitCommandSchema.parse(command)
        update.status = 'submitted'; update.submission_notes = input.submissionNotes; update.submitted_at = new Date(); update.submitted_by = authorizedPrincipal.userId; update.review_started_at = null; update.review_started_by = null; update.reviewed_at = null; update.reviewed_by = null; update.review_notes = ''; update.rejection_reason = ''
      } else if (target === 'start_review') {
        if (row.status === 'under_review') return projectSubmittalMutationResultSchema.parse({ projectId, changed: false, submittal: before })
        if (row.status !== 'submitted') throw new ConflictException('Only submitted submittals can enter review')
        update.status = 'under_review'; update.review_started_at = new Date(); update.review_started_by = authorizedPrincipal.userId
      } else {
        if (row.status !== 'under_review') throw new ConflictException('Only submittals under review can be decided')
        const input = projectSubmittalDecisionCommandSchema.parse(command)
        update.status = input.decision === 'approve' ? 'approved' : 'rejected'; update.review_notes = input.reviewNotes; update.rejection_reason = input.decision === 'reject' ? input.rejectionReason : ''; update.reviewed_at = new Date(); update.reviewed_by = authorizedPrincipal.userId; action = input.decision === 'approve' ? 'approve' : 'status_change'
      }
      const [updated] = await transaction.update(projectSubmittals).set(update).where(and(eq(projectSubmittals.id, submittalId), eq(projectSubmittals.project_id, projectId), eq(projectSubmittals.tenant_id, authorizedPrincipal.tenantId), eq(projectSubmittals.version, row.version))).returning(rowSelection)
      if (!updated) throw new ConflictException('Submittal changed; refresh before trying again')
      return this.finishMutation(transaction, authorizedPrincipal, projectId, submittalId, before, updated as ProjectSubmittalDbRow, action)
    })
  }

  private async finishMutation(transaction: DatabaseTransaction, principal: ErpPrincipal, projectId: string, submittalId: string, before: ProjectSubmittalRow, updated: ProjectSubmittalDbRow, action: 'update' | 'status_change' | 'approve'): Promise<ProjectSubmittalMutationResult> {
    const submittal = serialize(updated)
    await this.audit.writeSemantic(transaction, { tenantId: principal.tenantId, actorId: principal.userId, entityType: 'project_submittal', entityId: submittalId, action, diff: { project_id: projectId, from_status: before.status, to_status: submittal.status, from_version: before.version, to_version: submittal.version } })
    return projectSubmittalMutationResultSchema.parse({ projectId, changed: true, submittal })
  }

  private async assertAssignedUser(client: DatabaseService['client'] | DatabaseTransaction, tenantId: string, userId: string | null): Promise<void> {
    if (!userId) return
    const [assignee] = await client.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.tenant_id, tenantId))).limit(1)
    if (!assignee) throw new NotFoundException('Assigned user not found')
  }

  private async requireMembership(principal: ErpPrincipal, capability: ErpCapability): Promise<ErpPrincipal> {
    return this.requireMembershipOn(this.database.client, principal, capability)
  }

  private async requireMembershipOn(client: DatabaseService['client'] | DatabaseTransaction, principal: ErpPrincipal, capability: ErpCapability): Promise<ErpPrincipal> {
    const [membership] = await client.select({ tenantId: users.tenant_id, role: users.role, email: users.email }).from(users).where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId))).limit(1)
    const role = z.enum(ERP_ROLES).safeParse(membership?.role)
    if (!membership || !role.success || !roleHasCapability(role.data, capability)) throw new ForbiddenException()
    return { userId: principal.userId, tenantId: membership.tenantId, role: role.data, email: membership.email }
  }
}
