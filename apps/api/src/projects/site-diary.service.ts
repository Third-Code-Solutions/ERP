import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { projects, siteDiaryEntries, users } from '@third-code-erp/database/schema'
import {
  createSiteDiaryCommandSchema,
  siteDiaryCreateResultSchema,
  siteDiaryListQuerySchema,
  siteDiaryListResultSchema,
  siteDiaryMutationResultSchema,
  siteDiaryRowSchema,
  submitSiteDiaryCommandSchema,
  updateSiteDiaryCommandSchema,
  type CreateSiteDiaryCommand,
  type SiteDiaryCreateResult,
  type SiteDiaryListQuery,
  type SiteDiaryListResult,
  type SiteDiaryMutationResult,
  type SubmitSiteDiaryCommand,
  type UpdateSiteDiaryCommand,
} from '@third-code-erp/shared-types'
import {
  ERP_ROLES,
  roleHasCapability,
  type ErpCapability,
} from '@third-code-erp/shared-types/authorization'
import { and, asc, count, desc, eq, gte, isNull, lte } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../database/database.service'

const rowSelection = {
  id: siteDiaryEntries.id,
  projectId: siteDiaryEntries.project_id,
  diaryDate: siteDiaryEntries.diary_date,
  status: siteDiaryEntries.status,
  weather: siteDiaryEntries.weather,
  manpowerCount: siteDiaryEntries.manpower_count,
  workCompleted: siteDiaryEntries.work_completed,
  constraints: siteDiaryEntries.constraints,
  safetyNotes: siteDiaryEntries.safety_notes,
  createdBy: siteDiaryEntries.created_by,
  submittedAt: siteDiaryEntries.submitted_at,
  submittedBy: siteDiaryEntries.submitted_by,
  version: siteDiaryEntries.version,
  createdAt: siteDiaryEntries.created_at,
  updatedAt: siteDiaryEntries.updated_at,
}

type SiteDiaryDbRow = {
  id: string
  projectId: string
  diaryDate: string
  status: string
  weather: string
  manpowerCount: number
  workCompleted: string
  constraints: string
  safetyNotes: string
  createdBy: string
  submittedAt: Date | null
  submittedBy: string | null
  version: number
  createdAt: Date
  updatedAt: Date
}

function serialize(row: SiteDiaryDbRow) {
  return siteDiaryRowSchema.parse({
    ...row,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

function sameDraft(
  row: SiteDiaryDbRow,
  input: Pick<
    CreateSiteDiaryCommand,
    'weather' | 'manpowerCount' | 'workCompleted' | 'constraints' | 'safetyNotes'
  >,
): boolean {
  return (
    row.weather === input.weather &&
    row.manpowerCount === input.manpowerCount &&
    row.workCompleted === input.workCompleted &&
    row.constraints === input.constraints &&
    row.safetyNotes === input.safetyNotes
  )
}

@Injectable()
export class SiteDiaryService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(
    projectId: string,
    query: SiteDiaryListQuery,
    principal: ErpPrincipal,
  ): Promise<SiteDiaryListResult> {
    const filters = siteDiaryListQuerySchema.parse(query)
    await this.requireMembership(principal, 'project.diary.read')
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
      eq(siteDiaryEntries.tenant_id, principal.tenantId),
      eq(siteDiaryEntries.project_id, projectId),
      filters.status ? eq(siteDiaryEntries.status, filters.status) : undefined,
      filters.fromDate ? gte(siteDiaryEntries.diary_date, filters.fromDate) : undefined,
      filters.toDate ? lte(siteDiaryEntries.diary_date, filters.toDate) : undefined,
    )
    const [rows, totals] = await Promise.all([
      this.database.client
        .select(rowSelection)
        .from(siteDiaryEntries)
        .where(predicate)
        .orderBy(desc(siteDiaryEntries.diary_date), asc(siteDiaryEntries.id))
        .limit(filters.limit)
        .offset((filters.page - 1) * filters.limit),
      this.database.client
        .select({ total: count() })
        .from(siteDiaryEntries)
        .where(predicate),
    ])
    const total = Number(totals[0]?.total ?? 0)
    return siteDiaryListResultSchema.parse({
      projectId,
      rows: rows.map((row) => serialize(row as SiteDiaryDbRow)),
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    })
  }

  async create(
    command: CreateSiteDiaryCommand,
    principal: ErpPrincipal,
  ): Promise<SiteDiaryCreateResult> {
    const input = createSiteDiaryCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(
        transaction,
        principal,
        'project.diary.manage',
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

      const [existingRequest] = await transaction
        .select(rowSelection)
        .from(siteDiaryEntries)
        .where(
          and(
            eq(siteDiaryEntries.tenant_id, authorizedPrincipal.tenantId),
            eq(siteDiaryEntries.client_request_id, input.clientRequestId),
          ),
        )
        .limit(1)
        .for('update')
      if (existingRequest) {
        const row = existingRequest as SiteDiaryDbRow
        if (
          row.projectId !== input.projectId ||
          row.diaryDate !== input.diaryDate ||
          !sameDraft(row, input)
        ) {
          throw new ConflictException('Client request id was already used with a different diary')
        }
        return siteDiaryCreateResultSchema.parse({
          projectId: input.projectId,
          created: false,
          changed: false,
          entry: serialize(row),
        })
      }

      const [existingDate] = await transaction
        .select(rowSelection)
        .from(siteDiaryEntries)
        .where(
          and(
            eq(siteDiaryEntries.tenant_id, authorizedPrincipal.tenantId),
            eq(siteDiaryEntries.project_id, input.projectId),
            eq(siteDiaryEntries.diary_date, input.diaryDate),
          ),
        )
        .limit(1)
        .for('update')
      if (existingDate) {
        throw new ConflictException('A site diary already exists for this project date')
      }

      const [created] = await transaction
        .insert(siteDiaryEntries)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: input.projectId,
          diary_date: input.diaryDate,
          weather: input.weather,
          manpower_count: input.manpowerCount,
          work_completed: input.workCompleted,
          constraints: input.constraints,
          safety_notes: input.safetyNotes,
          created_by: authorizedPrincipal.userId,
          client_request_id: input.clientRequestId,
          version: 1,
        })
        .returning(rowSelection)
      if (!created) {
        throw new InternalServerErrorException('Site diary insert returned no record')
      }
      const entry = serialize(created as SiteDiaryDbRow)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'site_diary_entry',
        entityId: entry.id,
        action: 'create',
        diff: {
          project_id: input.projectId,
          diary_date: input.diaryDate,
          manpower_count: input.manpowerCount,
        },
      })
      return siteDiaryCreateResultSchema.parse({
        projectId: input.projectId,
        created: true,
        changed: true,
        entry,
      })
    })
  }

  async update(
    projectId: string,
    entryId: string,
    command: UpdateSiteDiaryCommand,
    principal: ErpPrincipal,
  ): Promise<SiteDiaryMutationResult> {
    const input = updateSiteDiaryCommandSchema.parse(command)
    return this.mutate(projectId, entryId, principal, 'update', input)
  }

  async submit(
    projectId: string,
    entryId: string,
    command: SubmitSiteDiaryCommand,
    principal: ErpPrincipal,
  ): Promise<SiteDiaryMutationResult> {
    const input = submitSiteDiaryCommandSchema.parse(command)
    return this.mutate(projectId, entryId, principal, 'submit', input)
  }

  private async mutate(
    projectId: string,
    entryId: string,
    principal: ErpPrincipal,
    target: 'update' | 'submit',
    command: UpdateSiteDiaryCommand | SubmitSiteDiaryCommand,
  ): Promise<SiteDiaryMutationResult> {
    const expectedVersion = command.expectedVersion
    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(
        transaction,
        principal,
        'project.diary.manage',
      )
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
        .from(siteDiaryEntries)
        .where(
          and(
            eq(siteDiaryEntries.id, entryId),
            eq(siteDiaryEntries.project_id, projectId),
            eq(siteDiaryEntries.tenant_id, authorizedPrincipal.tenantId),
          ),
        )
        .limit(1)
        .for('update')
      if (!current) throw new NotFoundException('Site diary entry not found')
      const row = current as SiteDiaryDbRow
      if (row.version !== expectedVersion) {
        throw new ConflictException('Site diary changed; refresh before trying again')
      }
      if (row.status === 'submitted') {
        throw new ConflictException('Submitted site diary entries are immutable')
      }
      const before = serialize(row)

      if (target === 'update') {
        const updateInput = updateSiteDiaryCommandSchema.parse(command)
        if (sameDraft(row, updateInput)) {
          return siteDiaryMutationResultSchema.parse({ projectId, changed: false, entry: before })
        }
        const now = new Date()
        const [updated] = await transaction
          .update(siteDiaryEntries)
          .set({
            weather: updateInput.weather,
            manpower_count: updateInput.manpowerCount,
            work_completed: updateInput.workCompleted,
            constraints: updateInput.constraints,
            safety_notes: updateInput.safetyNotes,
            version: row.version + 1,
            updated_at: now,
          })
          .where(
            and(
              eq(siteDiaryEntries.id, entryId),
              eq(siteDiaryEntries.project_id, projectId),
              eq(siteDiaryEntries.tenant_id, authorizedPrincipal.tenantId),
              eq(siteDiaryEntries.version, row.version),
            ),
          )
          .returning(rowSelection)
        if (!updated) throw new ConflictException('Site diary changed; refresh before trying again')
        const entry = serialize(updated as SiteDiaryDbRow)
        await this.audit.writeSemantic(transaction, {
          tenantId: authorizedPrincipal.tenantId,
          actorId: authorizedPrincipal.userId,
          entityType: 'site_diary_entry',
          entityId: entryId,
          action: 'update',
          diff: {
            project_id: projectId,
            diary_date: entry.diaryDate,
            from_version: before.version,
            to_version: entry.version,
            manpower_count: entry.manpowerCount,
          },
        })
        return siteDiaryMutationResultSchema.parse({ projectId, changed: true, entry })
      }

      if (!row.workCompleted.trim()) {
        throw new BadRequestException('Record completed work before submitting the diary')
      }
      const now = new Date()
      const [updated] = await transaction
        .update(siteDiaryEntries)
        .set({
          status: 'submitted',
          submitted_at: now,
          submitted_by: authorizedPrincipal.userId,
          version: row.version + 1,
          updated_at: now,
        })
        .where(
          and(
            eq(siteDiaryEntries.id, entryId),
            eq(siteDiaryEntries.project_id, projectId),
            eq(siteDiaryEntries.tenant_id, authorizedPrincipal.tenantId),
            eq(siteDiaryEntries.version, row.version),
          ),
        )
        .returning(rowSelection)
      if (!updated) throw new ConflictException('Site diary changed; refresh before trying again')
      const entry = serialize(updated as SiteDiaryDbRow)
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'site_diary_entry',
        entityId: entryId,
        action: 'status_change',
        diff: {
          project_id: projectId,
          diary_date: entry.diaryDate,
          from_version: before.version,
          to_version: entry.version,
        },
      })
      return siteDiaryMutationResultSchema.parse({ projectId, changed: true, entry })
    })
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
      .select({
        tenantId: users.tenant_id,
        role: users.role,
        email: users.email,
      })
      .from(users)
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.tenant_id, principal.tenantId),
        ),
      )
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
