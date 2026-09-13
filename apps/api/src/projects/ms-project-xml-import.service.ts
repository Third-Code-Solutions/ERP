import { createHash } from 'node:crypto'
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { auditLog, projects, projectScheduleTasks, tenants, users } from '@third-code-erp/database/schema'
import {
  msProjectXmlCommitCommandSchema, msProjectXmlPreviewCommandSchema,
  msProjectXmlImportReceiptSchema, msProjectXmlImportResultSchema,
  msProjectXmlPreviewResultSchema, type MsProjectXmlImportResult, type MsProjectXmlPreviewResult, type MsProjectXmlTaskMapping,
} from '@third-code-erp/shared-types'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { AuditService } from '../audit/audit.service'
import { roleHasCapability } from '../auth/capability.guard'
import { ERP_ROLES, type ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService, type DatabaseTransaction } from '../database/database.service'
import { parseMsProjectXmlSource } from './ms-project-xml-parser'

const levels = { l1: 1, l2: 2, l3: 3, l4: 4 }
const uuid = z.string().uuid().transform(value => value.toLowerCase())
const receiptEnvelope = z.object({ commandHash: z.string().regex(/^[a-f0-9]{64}$/), receipt: msProjectXmlImportReceiptSchema })

function taskRequestId(tenantId: string, projectId: string, requestId: string, sourceUid: number): string {
  // RFC 4122 name-based UUID in the URL namespace; no extra dependency.
  const bytes = createHash('sha1').update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex'))
    .update(JSON.stringify(['thirdcode:ms-project-xml', tenantId, projectId, requestId, sourceUid])).digest()
  bytes[6] = (bytes[6]! & 0x0f) | 0x50
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

@Injectable()
export class MsProjectXmlImportService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(AuditService) private readonly audit: AuditService) {}

  async preview(projectId: string, command: unknown, principal: ErpPrincipal): Promise<MsProjectXmlPreviewResult> {
    const parsed = msProjectXmlPreviewCommandSchema.safeParse(command)
    const project = uuid.safeParse(projectId)
    if (!parsed.success || !project.success || parsed.data.projectId.toLowerCase() !== project.data) throw new BadRequestException('Invalid XML preview request')
    return this.database.client.transaction(async tx => {
      const actor = await this.admit(tx, principal)
      await this.project(tx, project.data, actor.tenantId, false)
      return msProjectXmlPreviewResultSchema.parse({ preview: parseMsProjectXmlSource(parsed.data), tenantId: actor.tenantId, actorId: actor.userId, projectId: project.data })
    })
  }

  async import(projectId: string, command: unknown, principal: ErpPrincipal): Promise<MsProjectXmlImportResult> {
    const parsed = msProjectXmlCommitCommandSchema.safeParse(command)
    const project = uuid.safeParse(projectId)
    if (!parsed.success || !project.success || parsed.data.projectId.toLowerCase() !== project.data) throw new BadRequestException('Invalid reviewed XML import request')
    const input = { ...parsed.data, projectId: project.data, requestId: parsed.data.requestId.toLowerCase(), mappings: parsed.data.mappings.map(row => ({ ...row, ownerId: row.ownerId?.toLowerCase() ?? null })).sort((a, b) => a.sourceUid - b.sourceUid) }
    const commandHash = createHash('sha256').update(JSON.stringify({ projectId: input.projectId, sourceHash: input.sourceHash, parserVersion: input.parserVersion, mappings: input.mappings })).digest('hex')
    return this.database.client.transaction(async tx => {
      const actor = await this.admit(tx, principal)
      const preview = parseMsProjectXmlSource({ sourceBase64: input.sourceBase64 })
      if (!preview.canImport || !preview.tasks.length || preview.sourceHash !== input.sourceHash || preview.parserVersion !== input.parserVersion) throw new BadRequestException('XML source does not match an importable reviewed preview; preview again')
      // Older schedule writers acquire project then audit. Both admissions must
      // fail fast, rather than wait while holding the opposite lock.
      if (!await this.audit.tryLockTenantChain(tx, actor.tenantId)) throw new ConflictException('Project writes are busy; retry the unchanged import')
      await this.project(tx, input.projectId, actor.tenantId, true)
      const prior = await tx.select({ actorId: auditLog.actor_id, diff: auditLog.diff }).from(auditLog).where(and(eq(auditLog.tenant_id, actor.tenantId), eq(auditLog.entity_type, 'project_schedule_import'), eq(auditLog.entity_id, input.requestId), eq(auditLog.action, 'create'))).limit(2)
      if (prior.length) {
        const stored = receiptEnvelope.safeParse(prior[0]!.diff)
        if (prior.length !== 1 || !stored.success) throw new InternalServerErrorException('Stored XML import receipt is invalid')
        if (prior[0]!.actorId !== actor.userId || stored.data.commandHash !== commandHash || stored.data.receipt.projectId !== input.projectId) throw new ConflictException('Request id was already used for another XML import command')
        if (stored.data.receipt.tenantId !== actor.tenantId || stored.data.receipt.actorId !== actor.userId || stored.data.receipt.requestId !== input.requestId || stored.data.receipt.sourceHash !== input.sourceHash || stored.data.receipt.parserVersion !== input.parserVersion) throw new InternalServerErrorException('Stored XML import receipt scope is invalid')
        return msProjectXmlImportResultSchema.parse({ ok: true, projectId: input.projectId, requestId: input.requestId, sourceHash: input.sourceHash, parserVersion: input.parserVersion, created: false, changed: false, receipt: stored.data.receipt })
      }

      // Task codes are editable; immutable provenance is the final authority
      // for one-shot source identity even after all imported rows are renamed.
      const [sourceReceipt] = await tx.select({ id: auditLog.id }).from(auditLog).where(and(
        eq(auditLog.tenant_id, actor.tenantId), eq(auditLog.entity_type, 'project_schedule_import'), eq(auditLog.action, 'create'),
        sql`${auditLog.diff}->'receipt'->>'projectId' = ${input.projectId}`,
        sql`${auditLog.diff}->'receipt'->>'sourceHash' = ${input.sourceHash}`,
      )).limit(1)
      if (sourceReceipt) throw new ConflictException('This XML source was already imported into this project; existing task edits were preserved')

      const mappings = new Map(input.mappings.map(row => [row.sourceUid, row]))
      if (mappings.size !== preview.tasks.length || preview.tasks.some(task => mappings.get(task.sourceUid)?.sourceOutlineLevel !== task.outlineLevel)) throw new BadRequestException('Review a mapping for every source task and its exact outline depth')
      const byUid = new Map(preview.tasks.map(task => [task.sourceUid, task]))
      for (const task of preview.tasks) {
        const mapping = mappings.get(task.sourceUid)!
        if (task.parentSourceUid !== null) {
          const parent = mappings.get(task.parentSourceUid)
          if (!parent || levels[parent.level] >= levels[mapping.level]) throw new BadRequestException('Mapped parent must be at a higher schedule level')
        }
        if (task.predecessor && mappings.get(task.predecessor.predecessorUid)?.level !== mapping.level) throw new BadRequestException('Mapped predecessors must remain at the same schedule level')
      }
      await this.owners(tx, actor.tenantId, input.mappings)
      const codes = new Map(preview.tasks.map(task => [task.sourceUid, `MSP-${input.sourceHash.slice(0, 24)}-${task.sourceUid}`]))
      const collisions = await tx.select({ id: projectScheduleTasks.id }).from(projectScheduleTasks).where(and(eq(projectScheduleTasks.tenant_id, actor.tenantId), eq(projectScheduleTasks.project_id, input.projectId), inArray(projectScheduleTasks.task_code, [...codes.values()]))).limit(1)
      if (collisions.length) throw new ConflictException('This XML source conflicts with existing imported task codes; existing tasks were preserved')
      await this.audit.stampActor(tx, actor)
      const inserted = new Map<number, { taskId: string; version: number }>()
      const remaining = new Set(preview.tasks.map(task => task.sourceUid))
      while (remaining.size) {
        let progressed = false
        for (const sourceUid of remaining) {
          const task = byUid.get(sourceUid)!
          if (task.parentSourceUid !== null && !inserted.has(task.parentSourceUid)) continue
          if (task.predecessor && !inserted.has(task.predecessor.predecessorUid)) continue
          const mapping = mappings.get(sourceUid)!
          const [created] = await tx.insert(projectScheduleTasks).values({
            tenant_id: actor.tenantId, project_id: input.projectId, source: 'ms_project',
            client_request_id: taskRequestId(actor.tenantId, input.projectId, input.requestId, sourceUid), request_hash: commandHash,
            created_by: actor.userId, level: mapping.level, owner_id: mapping.ownerId, task_code: codes.get(sourceUid)!, name: task.name,
            parent_task_id: task.parentSourceUid === null ? null : inserted.get(task.parentSourceUid)!.taskId,
            predecessor_task_id: task.predecessor ? inserted.get(task.predecessor.predecessorUid)!.taskId : null,
            planned_start: task.sourceStart.calendarDate, planned_finish: task.sourceFinish.calendarDate,
            status: 'planned', percent_complete: 0, planned_labor_minutes: 0, actual_labor_minutes: 0, commitment_status: 'not_set',
          }).returning({ taskId: projectScheduleTasks.id, version: projectScheduleTasks.version })
          if (!created) throw new InternalServerErrorException('XML task insertion was not confirmed')
          inserted.set(sourceUid, created)
          remaining.delete(sourceUid)
          progressed = true
        }
        if (!progressed) throw new BadRequestException('XML relationships contain an unsupported cycle')
      }
      const receipt = msProjectXmlImportReceiptSchema.parse({ tenantId: actor.tenantId, actorId: actor.userId, projectId: input.projectId, requestId: input.requestId, sourceHash: input.sourceHash, parserVersion: input.parserVersion, mappings: input.mappings, tasks: preview.tasks.map(task => ({ sourceUid: task.sourceUid, ...inserted.get(task.sourceUid)!, level: mappings.get(task.sourceUid)!.level, ownerId: mappings.get(task.sourceUid)!.ownerId })) })
      await this.audit.writeSemantic(tx, { tenantId: actor.tenantId, actorId: actor.userId, entityType: 'project_schedule_import', entityId: input.requestId, action: 'create', diff: { commandHash, receipt } })
      return msProjectXmlImportResultSchema.parse({ ok: true, projectId: input.projectId, requestId: input.requestId, sourceHash: input.sourceHash, parserVersion: input.parserVersion, created: true, changed: true, receipt })
    })
  }

  private async admit(tx: DatabaseTransaction, principal: ErpPrincipal): Promise<ErpPrincipal> {
    await tx.execute(sql`select set_config('lock_timeout', '3s', true)`)
    const [actor] = await tx.select({ role: users.role, status: users.account_status, email: users.email }).from(users).where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId))).limit(1).for('share', { noWait: true })
    const role = z.enum(ERP_ROLES).safeParse(actor?.role)
    if (!actor || actor.status !== 'active' || !role.success || !roleHasCapability(role.data, 'project.schedule.manage')) throw new ForbiddenException('Current account cannot manage schedules')
    const [tenant] = await tx.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, principal.tenantId)).limit(1).for('share', { noWait: true })
    if (tenant?.status !== 'active') throw new ForbiddenException('Current tenant is not active')
    return { userId: principal.userId.toLowerCase(), tenantId: principal.tenantId.toLowerCase(), email: actor.email, role: role.data }
  }

  private async project(tx: DatabaseTransaction, projectId: string, tenantId: string, write: boolean): Promise<void> {
    const [project] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId), isNull(projects.deleted_at))).limit(1).for(write ? 'update' : 'share', { noWait: true })
    if (!project) throw new NotFoundException('Project not found')
  }

  private async owners(tx: DatabaseTransaction, tenantId: string, mappings: MsProjectXmlTaskMapping[]): Promise<void> {
    const ids = [...new Set(mappings.flatMap(row => row.ownerId ? [row.ownerId] : []))].sort()
    for (const id of ids) {
      const [owner] = await tx.select({ status: users.account_status }).from(users).where(and(eq(users.id, id), eq(users.tenant_id, tenantId))).limit(1).for('share', { noWait: true })
      if (owner?.status !== 'active') throw new BadRequestException('Select an active owner from the current tenant, or leave the owner unassigned')
    }
  }
}
