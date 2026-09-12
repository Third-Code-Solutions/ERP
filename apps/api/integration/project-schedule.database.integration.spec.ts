import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import {
  auditLog,
  db,
  masterSchedules,
  projectScheduleTasks,
  projects,
  tenants,
  users,
} from '@third-code-erp/database'
import {
  createProjectScheduleTaskCommandSchema,
  projectScheduleTaskStatusCommandSchema,
  updateProjectScheduleTaskCommandSchema,
} from '@third-code-erp/shared-types'
import { and, asc, eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import { DatabaseService } from '../src/database/database.service'
import { ProjectScheduleService } from '../src/projects/project-schedule.service'

const expected = process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = expected ? describe : describe.skip

// Independent transactions must see committed fixtures to exercise the project
// row lock. UUID-isolated synthetic rows live until the disposable lane resets;
// deleting their audit trail would violate its append-only contract.
beforeAll(() => {
  if (!expected) return
  const connection = process.env.DATABASE_URL
  if (!connection) throw new Error('Schedule database proof requires the disposable DATABASE_URL')
  const target = new URL(connection)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
    throw new Error('Schedule database proof accepts only a loopback disposable PostgreSQL target')
  }
})

const legacyTasks = [
  { name: 'Install finishes', start_date: '2026-09-15', finish_date: '2026-09-18', predecessor_index: 2, planned_pct_curve: [0, 25, 75, 100] },
  { name: 'Mobilize', start_date: '2026-09-12', finish_date: '2026-09-12', predecessor_index: null, planned_pct_curve: [0, 100] },
  { name: 'Prepare surfaces', start_date: '2026-09-13', finish_date: '2026-09-14', predecessor_index: 1, planned_pct_curve: [0, 50, 100] },
]

async function fixture() {
  const tenantId = randomUUID()
  const userId = randomUUID()
  const projectId = randomUUID()
  const sourceScheduleId = randomUUID()
  const principal: ErpPrincipal = {
    tenantId, userId, role: 'admin', email: `schedule-${userId}@integration.test`,
  }
  await db.transaction(async (transaction) => {
    await transaction.insert(tenants).values({ id: tenantId, name: 'Schedule integration', slug: `schedule-integration-${tenantId}` })
    await transaction.insert(users).values({ id: userId, tenant_id: tenantId, email: principal.email, full_name: 'Schedule integration admin', role: 'admin' })
    await transaction.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Schedule integration project', client: 'Synthetic client', status: 'active', project_type: 'mep', created_by: userId })
    await transaction.insert(masterSchedules).values({ id: sourceScheduleId, tenant_id: tenantId, project_id: projectId, tasks: legacyTasks, imported_by: userId })
  })
  const audit = new AuditService()
  const service = new ProjectScheduleService(new DatabaseService(), audit)
  const preview = await service.previewLegacy(projectId, principal)
  const command = { sourceScheduleId, sourceHash: preview.sourceHash }
  return { tenantId, userId, projectId, sourceScheduleId, principal, audit, service, command }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

async function snapshot(context: Fixture) {
  const [tasks, source, audits] = await Promise.all([
    db.select().from(projectScheduleTasks).where(and(eq(projectScheduleTasks.tenant_id, context.tenantId), eq(projectScheduleTasks.project_id, context.projectId))).orderBy(asc(projectScheduleTasks.task_code)),
    db.select().from(masterSchedules).where(and(eq(masterSchedules.tenant_id, context.tenantId), eq(masterSchedules.id, context.sourceScheduleId))),
    db.select().from(auditLog).where(eq(auditLog.tenant_id, context.tenantId)).orderBy(asc(auditLog.id)),
  ])
  return { tasks, source, audits }
}

suite('Project schedule import PostgreSQL integration', () => {
  it('persists every task with forward and backward predecessor FKs and one semantic audit per task and import', async () => {
    const context = await fixture()
    const before = await snapshot(context)
    const result = await context.service.importLegacy(context.projectId, context.command, context.principal)
    const after = await snapshot(context)

    expect(result).toMatchObject({ created: true, changed: true, projectId: context.projectId, sourceScheduleId: context.sourceScheduleId })
    expect(after.tasks).toHaveLength(3)
    expect(after.tasks.map((task) => task.id)).toEqual(result.rows.map((task) => task.id))
    expect(after.tasks.map((task) => task.predecessor_task_id)).toEqual([result.rows[2]!.id, null, result.rows[1]!.id])
    expect(after.tasks.map((task) => ({ name: task.name, start: task.planned_start, finish: task.planned_finish }))).toEqual(legacyTasks.map((task) => ({ name: task.name, start: task.start_date, finish: task.finish_date })))
    for (const task of after.tasks) {
      expect(task).toMatchObject({ tenant_id: context.tenantId, project_id: context.projectId, created_by: context.userId, source: 'legacy_l1', level: 'l1', status: 'planned', version: 1 })
    }
    expect(after.source).toEqual(before.source)
    expect(after.source[0]!.tasks).toEqual(legacyTasks)
    const addedAudits = after.audits.filter((entry) => !before.audits.some((prior) => prior.id === entry.id))
    const semanticTaskAudits = addedAudits.filter((entry) => entry.entity_type === 'project_schedule_task')
    expect(semanticTaskAudits.map((entry) => entry.entity_id).sort()).toEqual(result.rows.map((row) => row.id).sort())
    expect(semanticTaskAudits.every((entry) => entry.actor_id === context.userId && entry.action === 'create')).toBe(true)
    expect(addedAudits.filter((entry) => entry.entity_type === 'master_schedule')).toEqual([
      expect.objectContaining({ entity_id: context.sourceScheduleId, actor_id: context.userId, action: 'create', diff: expect.objectContaining({ operation: 'import_to_schedule', task_count: 3, source_hash: context.command.sourceHash }) }),
    ])
  })

  it('returns tenant-scoped parent and predecessor choices with literal search and incompatible selection', async () => {
    const context = await fixture()
    const imported = await context.service.importLegacy(context.projectId, context.command, context.principal)
    const l1 = imported.rows[0]!
    const l2 = (await context.service.create({
      projectId: context.projectId,
      clientRequestId: randomUUID(),
      level: 'l2',
      taskCode: 'L2-001',
      name: 'Electrical package',
      description: '',
      parentTaskId: l1.id,
      predecessorTaskId: null,
      plannedStart: '2026-09-15',
      plannedFinish: '2026-09-18',
      plannedLaborMinutes: 480,
      ownerId: null,
      commitmentWeek: null,
      commitmentStatus: 'not_set',
      constraintReason: '',
    }, context.principal)).task
    const current = (await context.service.create({
      projectId: context.projectId,
      clientRequestId: randomUUID(),
      level: 'l3',
      taskCode: 'L3-001',
      name: 'Current detail task',
      description: '',
      parentTaskId: l2.id,
      predecessorTaskId: null,
      plannedStart: '2026-09-19',
      plannedFinish: '2026-09-20',
      plannedLaborMinutes: 240,
      ownerId: null,
      commitmentWeek: null,
      commitmentStatus: 'not_set',
      constraintReason: '',
    }, context.principal)).task
    const candidate = (await context.service.create({
      projectId: context.projectId,
      clientRequestId: randomUUID(),
      level: 'l3',
      taskCode: 'L3-999',
      name: 'QA 100%_literal',
      description: '',
      parentTaskId: l2.id,
      predecessorTaskId: current.id,
      plannedStart: '2026-09-21',
      plannedFinish: '2026-09-22',
      plannedLaborMinutes: 240,
      ownerId: null,
      commitmentWeek: null,
      commitmentStatus: 'not_set',
      constraintReason: '',
    }, context.principal)).task

    await db.insert(projectScheduleTasks).values(Array.from({ length: 101 }, (_, index) => ({
      id: randomUUID(),
      tenant_id: context.tenantId,
      project_id: context.projectId,
      level: 'l3' as const,
      task_code: `L3-${String(index + 10).padStart(3, '0')}`,
      name: `Detail ${index + 10}`,
      description: '',
      parent_task_id: l2.id,
      predecessor_task_id: null,
      planned_start: '2026-09-23',
      planned_finish: '2026-09-24',
      planned_labor_minutes: 0,
      owner_id: null,
      commitment_week: null,
      commitment_status: 'not_set' as const,
      constraint_reason: '',
      source: 'manual' as const,
      client_request_id: randomUUID(),
      request_hash: 'a'.repeat(64),
      version: 1,
      created_by: context.userId,
    })))

    const parents = await context.service.dependencyOptions(context.projectId, {
      kind: 'parent',
      level: 'l3',
      excludeTaskId: current.id,
      selectedTaskId: l2.id,
      page: 1,
      limit: 1,
    }, context.principal)
    expect(parents.selected).toMatchObject({ id: l2.id, level: 'l2' })
    expect(parents.rows).not.toContainEqual(expect.objectContaining({ id: l2.id }))
    expect(parents.rows.every((row) => row.level === 'l1' || row.level === 'l2')).toBe(true)
    expect(parents.rows.some((row) => row.id === current.id)).toBe(false)

    const pagedPredecessors = await context.service.dependencyOptions(context.projectId, {
      kind: 'predecessor',
      level: 'l3',
      excludeTaskId: current.id,
      selectedTaskId: candidate.id,
      page: 1,
      limit: 100,
    }, context.principal)
    expect(pagedPredecessors).toMatchObject({ total: 102, totalPages: 2, selected: { id: candidate.id, level: 'l3' } })
    expect(pagedPredecessors.rows).toHaveLength(100)
    expect(pagedPredecessors.rows.some((row) => row.id === candidate.id)).toBe(false)

    const predecessors = await context.service.dependencyOptions(context.projectId, {
      kind: 'predecessor',
      level: 'l3',
      excludeTaskId: current.id,
      selectedTaskId: l2.id,
      search: '100%_literal',
      page: 1,
      limit: 25,
    }, context.principal)
    expect(predecessors).toMatchObject({
      rows: [{ id: candidate.id, projectId: context.projectId, level: 'l3', taskCode: 'L3-999', name: 'QA 100%_literal' }],
      selected: { id: l2.id, level: 'l2' },
      total: 1,
      totalPages: 1,
    })
  })

  it('rejects dependency lookups across tenants and forged current membership', async () => {
    const context = await fixture()
    const foreign = await fixture()
    const query = { kind: 'predecessor' as const, level: 'l1' as const, page: 1, limit: 25 }
    const foreignTasks = await foreign.service.importLegacy(foreign.projectId, foreign.command, foreign.principal)
    const isolated = await context.service.dependencyOptions(context.projectId, { ...query, selectedTaskId: foreignTasks.rows[0]!.id }, context.principal)
    expect(isolated.selected).toBeNull()
    expect(isolated.rows).toEqual([])
    await expect(context.service.dependencyOptions(context.projectId, query, foreign.principal)).rejects.toBeInstanceOf(NotFoundException)
    await expect(context.service.dependencyOptions(context.projectId, query, { ...foreign.principal, tenantId: context.tenantId })).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('retries without writes and preserves subsequent operational edits', async () => {
    const context = await fixture()
    const initial = await context.service.importLegacy(context.projectId, context.command, context.principal)
    const row = initial.rows[0]!
    await context.service.update(context.projectId, row.id, updateProjectScheduleTaskCommandSchema.parse({
      expectedVersion: row.version, level: row.level, taskCode: row.taskCode, name: 'Revised site sequence',
      description: 'Owner edit after migration', predecessorTaskId: row.predecessorTaskId,
      plannedStart: row.plannedStart, plannedFinish: '2026-09-20', plannedLaborMinutes: 480, ownerId: context.userId,
      parentTaskId: null, commitmentWeek: null, commitmentStatus: 'not_set',
    }), context.principal)
    await context.service.updateStatus(context.projectId, row.id, projectScheduleTaskStatusCommandSchema.parse({
      expectedVersion: 2, status: 'in_progress', percentComplete: 35, actualStart: '2026-09-15', actualLaborMinutes: 120,
      actualFinish: null, commitmentWeek: null, commitmentStatus: 'not_set',
    }), context.principal)
    const before = await snapshot(context)
    const replay = await context.service.importLegacy(context.projectId, context.command, context.principal)
    expect(replay).toMatchObject({ created: false, changed: false })
    expect(replay.rows[0]).toMatchObject({ id: row.id, name: 'Revised site sequence', version: 3, status: 'in_progress', percentComplete: 35, plannedLaborMinutes: 480, actualLaborMinutes: 120, ownerId: context.userId })
    expect(await snapshot(context)).toEqual(before)
  })

  it('serializes simultaneous imports on independent PostgreSQL connections without duplicate rows or semantic audits', async () => {
    const context = await fixture()
    const stampActor = context.audit.stampActor.bind(context.audit)
    const backendPids = new Set<number>()
    let release = () => {}
    const bothStarted = new Promise<void>((resolve) => { release = resolve })
    const stamp = vi.spyOn(context.audit, 'stampActor').mockImplementation(async (transaction, principal) => {
      await stampActor(transaction, principal)
      const [backend] = await transaction.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)
      backendPids.add(backend!.pid)
      if (backendPids.size === 2) release()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([bothStarted, new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Two independent import transactions did not start')), 5000)
        })])
      } finally { clearTimeout(timer) }
    })
    try {
      const outcomes = await Promise.allSettled([
        context.service.importLegacy(context.projectId, context.command, context.principal),
        context.service.importLegacy(context.projectId, context.command, context.principal),
      ])
      expect(backendPids.size).toBe(2)
      const results = outcomes.map((outcome) => {
        if (outcome.status === 'rejected') throw outcome.reason
        return outcome.value
      })
      expect(results.map((result) => result.created).sort()).toEqual([false, true])
      expect(results[0]!.rows).toEqual(results[1]!.rows)
      const after = await snapshot(context)
      expect(after.tasks).toHaveLength(3)
      expect(after.audits.filter((entry) => entry.entity_type === 'project_schedule_task')).toHaveLength(3)
      expect(after.audits.filter((entry) => entry.entity_type === 'master_schedule')).toHaveLength(1)
    } finally { stamp.mockRestore() }
  }, 20000)

  it('denies cross-tenant project access and forged membership without any writes', async () => {
    const context = await fixture()
    const foreign = await fixture()
    const before = await snapshot(context)
    const foreignBefore = await snapshot(foreign)
    await expect(context.service.importLegacy(context.projectId, context.command, foreign.principal)).rejects.toBeInstanceOf(NotFoundException)
    await expect(context.service.importLegacy(context.projectId, context.command, { ...foreign.principal, tenantId: context.tenantId })).rejects.toBeInstanceOf(ForbiddenException)
    expect(await snapshot(context)).toEqual(before)
    expect(await snapshot(foreign)).toEqual(foreignBefore)
  })

  it('rejects a later task-code collision atomically, leaving the existing task and JSON unchanged', async () => {
    const context = await fixture()
    await context.service.create(createProjectScheduleTaskCommandSchema.parse({
      projectId: context.projectId, clientRequestId: randomUUID(), level: 'l1', taskCode: 'L1-002',
      name: 'Existing operational task', plannedStart: '2026-09-12', plannedFinish: '2026-09-13',
      parentTaskId: null, predecessorTaskId: null, ownerId: null, plannedLaborMinutes: 0, commitmentWeek: null, commitmentStatus: 'not_set',
    }), context.principal)
    const before = await snapshot(context)
    await expect(context.service.importLegacy(context.projectId, context.command, context.principal)).rejects.toBeInstanceOf(ConflictException)
    expect(await snapshot(context)).toEqual(before)
  })

  it('rolls back all task inserts and an already-written semantic audit when a later audit fails', async () => {
    const context = await fixture()
    const before = await snapshot(context)
    const writeSemantic = context.audit.writeSemantic.bind(context.audit)
    let writes = 0
    const failingAudit = vi.spyOn(context.audit, 'writeSemantic').mockImplementation(async (transaction, params) => {
      await writeSemantic(transaction, params)
      writes += 1
      if (writes === 2) throw new Error('Injected semantic audit failure')
    })
    try {
      await expect(context.service.importLegacy(context.projectId, context.command, context.principal)).rejects.toThrow('Injected semantic audit failure')
      expect(writes).toBe(2)
      expect(await snapshot(context)).toEqual(before)
    } finally { failingAudit.mockRestore() }
    const retry = await context.service.importLegacy(context.projectId, context.command, context.principal)
    expect(retry.created).toBe(true)
    expect((await snapshot(context)).tasks).toHaveLength(3)
  })
})
