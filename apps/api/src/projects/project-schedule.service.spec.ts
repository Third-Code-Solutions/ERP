import 'reflect-metadata'

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { projectScheduleTasks } from '@third-code-erp/database/schema'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { ProjectScheduleService } from './project-schedule.service'

const PRINCIPAL: ErpPrincipal = { userId: '11111111-1111-4111-8111-111111111111', tenantId: '22222222-2222-4222-8222-222222222222', role: 'pm', email: 'pm@example.test' }
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TASK_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const CREATED_AT = new Date('2026-09-10T00:00:00.000Z')

function task(overrides: Partial<{ status: string; version: number; percentComplete: number; actualFinish: string | null }> = {}) {
  return { id: TASK_ID, projectId: PROJECT_ID, level: 'l1', taskCode: 'A-001', name: 'Mobilize', description: 'Mobilize site.', parentTaskId: null, predecessorTaskId: null, plannedStart: '2026-09-10', plannedFinish: '2026-09-12', actualStart: null, actualFinish: overrides.actualFinish ?? null, percentComplete: overrides.percentComplete ?? 0, plannedLaborMinutes: 120, actualLaborMinutes: 0, status: overrides.status ?? 'planned', commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '', ownerId: null, source: 'manual', version: overrides.version ?? 1, createdBy: PRINCIPAL.userId, createdAt: CREATED_AT, updatedAt: CREATED_AT }
}

function query(result: unknown[]) {
  const builder: Record<string, unknown> = {}
  builder.from = vi.fn().mockReturnValue(builder); builder.where = vi.fn().mockReturnValue(builder); builder.limit = vi.fn().mockReturnValue(builder); builder.offset = vi.fn().mockReturnValue(builder); builder.orderBy = vi.fn().mockReturnValue(builder); builder.for = vi.fn().mockResolvedValue(result); builder.then = (onFulfilled?: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

function harness(selectResults: unknown[], options?: { insertResult?: unknown[]; updateResult?: unknown[] }) {
  const select = vi.fn(() => query((selectResults.shift() as unknown[] | undefined) ?? []))
  const insertQuery: Record<string, unknown> = { values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(options?.insertResult ?? []) }
  const updateQuery: Record<string, unknown> = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(options?.updateResult ?? []) }
  const insert = vi.fn().mockReturnValue(insertQuery); const update = vi.fn().mockReturnValue(updateQuery)
  const transactionClient = { select, insert, update }
  const transaction = vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient))
  const database = { client: { select, transaction } } as unknown as DatabaseService
  const audit = { stampActor: vi.fn().mockResolvedValue(undefined), writeSemantic: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService
  return { service: new ProjectScheduleService(database, audit), audit, insert, update }
}

const membership = [{ tenantId: PRINCIPAL.tenantId, role: PRINCIPAL.role, email: PRINCIPAL.email }]
const project = [{ id: PROJECT_ID }]

const legacyTasks = [
  { name: 'Mobilize', start_date: '2026-09-10', finish_date: '2026-09-12', predecessor_index: null, planned_pct_curve: [0, 100] },
  { name: 'Build', start_date: '2026-09-13', finish_date: '2026-09-15', predecessor_index: 0, planned_pct_curve: [0, 50, 100] },
]
const legacySource = { id: REQUEST_ID, tasks: legacyTasks }

function importHarness(selectResults: unknown[][], failAudit = false) {
  const predicates: SQL[] = []
  const locks: string[] = []
  const select = vi.fn(() => {
    const builder = query(selectResults.shift() ?? [])
    const originalWhere = builder.where
    builder.where = vi.fn((predicate: SQL) => { predicates.push(predicate); return (originalWhere as (predicate: SQL) => unknown)(predicate) })
    const originalFor = builder.for
    builder.for = vi.fn((lock: string) => { locks.push(lock); return (originalFor as (lock: string) => unknown)(lock) })
    return builder
  })
  type InsertRow = typeof projectScheduleTasks.$inferInsert
  let pending: InsertRow[] = []
  let committed: InsertRow[] = []
  const rows = (source = pending) => source.map((row) => ({ ...task(), id: row.id!, taskCode: row.task_code, name: row.name, plannedStart: row.planned_start, plannedFinish: row.planned_finish, predecessorTaskId: row.predecessor_task_id ?? null, plannedLaborMinutes: 0, description: '', source: row.source!, requestHash: row.request_hash, clientRequestId: row.client_request_id }))
  const batches: InsertRow[][] = []
  const insert = vi.fn(() => ({ values: (values: InsertRow[]) => ({ returning: async () => {
    // Model the immediate scope trigger: every predecessor must be visible from
    // an earlier completed statement, rather than relying on VALUES row order.
    for (const row of values) if (row.predecessor_task_id && !pending.some((existing) => existing.id === row.predecessor_task_id)) throw new Error('Predecessor is not visible')
    batches.push(values)
    pending.push(...values)
    return rows(values).map(({ requestHash: _requestHash, clientRequestId: _clientRequestId, ...row }) => row)
  } }) }))
  const client = { select, insert }
  const transaction = vi.fn(async (callback: (tx: typeof client) => Promise<unknown>) => {
    try { const result = await callback(client); committed = [...pending]; return result } catch (error) { pending = []; throw error }
  })
  const audit = { stampActor: vi.fn().mockResolvedValue(undefined), writeSemantic: failAudit ? vi.fn().mockRejectedValue(new Error('audit unavailable')) : vi.fn().mockResolvedValue(undefined) }
  const service = new ProjectScheduleService({ client: { transaction } } as unknown as DatabaseService, audit as unknown as AuditService)
  return { service, insert, select, audit, predicates, locks, rows, batches, committed: () => committed }
}

describe('legacy L1 schedule import', () => {
  it('inserts forward predecessor chains in visible layers but returns stable source order', async () => {
    const tasks = [
      { ...legacyTasks[0]!, name: 'Third', predecessor_index: 2 },
      { ...legacyTasks[0]!, name: 'First', predecessor_index: null },
      { ...legacyTasks[0]!, name: 'Second', predecessor_index: 1 },
      { ...legacyTasks[0]!, name: 'Independent', predecessor_index: null },
    ]
    const probe = importHarness([membership, project, [{ ...legacySource, tasks }], []])
    const result = await probe.service.importLegacy(PROJECT_ID, { sourceScheduleId: REQUEST_ID }, PRINCIPAL)
    expect(probe.batches.map((batch) => batch.map((row) => row.task_code))).toEqual([['L1-002', 'L1-004'], ['L1-003'], ['L1-001']])
    expect(result.rows.map((row) => row.taskCode)).toEqual(['L1-001', 'L1-002', 'L1-003', 'L1-004'])
    expect(result.rows[0]!.predecessorTaskId).toBe(result.rows[2]!.id)
    expect(result.rows[2]!.predecessorTaskId).toBe(result.rows[1]!.id)
    const retry = importHarness([membership, project, [{ ...legacySource, tasks }], probe.rows()])
    await expect(retry.service.importLegacy(PROJECT_ID, { sourceScheduleId: REQUEST_ID }, PRINCIPAL)).resolves.toMatchObject({ created: false, rows: result.rows })
    expect(retry.insert).not.toHaveBeenCalled()
  })
  it('previews only authorized source data and rejects changed content before writing', async () => {
    const probe = harness([membership, project, [legacySource]])
    const preview = await probe.service.previewLegacy(PROJECT_ID, PRINCIPAL)
    expect(preview).toMatchObject({ projectId: PROJECT_ID, sourceScheduleId: REQUEST_ID, tasks: legacyTasks })
    expect(preview.sourceHash).toMatch(/^[a-f0-9]{64}$/)
    expect(probe.insert).not.toHaveBeenCalled()
    const changed = importHarness([membership, project, [{ ...legacySource, tasks: [{ ...legacyTasks[0], name: 'Changed task' }] }]])
    await expect(changed.service.importLegacy(PROJECT_ID, { sourceScheduleId: REQUEST_ID, sourceHash: preview.sourceHash }, PRINCIPAL)).rejects.toThrow('preview again')
    expect(changed.insert).not.toHaveBeenCalled()
    await expect(harness([[{ ...membership[0], role: 'viewer' }]]).service.previewLegacy(PROJECT_ID, PRINCIPAL)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(harness([membership, []]).service.previewLegacy(PROJECT_ID, PRINCIPAL)).rejects.toBeInstanceOf(NotFoundException)
    await expect(harness([membership, project, []]).service.previewLegacy(PROJECT_ID, PRINCIPAL)).rejects.toBeInstanceOf(NotFoundException)
  })
  it('imports one atomic batch with stable identities, predecessors and tenant-qualified source locks', async () => {
    const probe = importHarness([membership, project, [legacySource], []])
    const result = await probe.service.importLegacy(PROJECT_ID, { sourceScheduleId: REQUEST_ID }, PRINCIPAL)
    expect(result).toMatchObject({ created: true, changed: true, sourceScheduleId: REQUEST_ID, rows: [{ taskCode: 'L1-001', source: 'legacy_l1', plannedLaborMinutes: 0 }, { taskCode: 'L1-002', predecessorTaskId: result.rows[0]!.id }] })
    expect(probe.insert).toHaveBeenCalledTimes(2)
    expect(probe.audit.writeSemantic).toHaveBeenCalledTimes(3)
    expect(probe.audit.writeSemantic).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ action: 'create', diff: expect.objectContaining({ operation: 'import_to_schedule', task_count: 2 }) }))
    expect(probe.locks).toEqual(['update', 'update', 'update'])
    const sourceSql = new PgDialect().sqlToQuery(probe.predicates[2]!)
    expect(sourceSql.sql).toContain('"master_schedules"."tenant_id"')
    expect(sourceSql.params).toEqual([PROJECT_ID, PRINCIPAL.tenantId])
    const replayRows = probe.rows().map((row) => ({ ...row, status: 'in_progress', actualLaborMinutes: 45, version: 2 }))
    const retry = importHarness([membership, project, [legacySource], replayRows])
    await expect(retry.service.importLegacy(PROJECT_ID, { sourceScheduleId: REQUEST_ID }, PRINCIPAL)).resolves.toMatchObject({ created: false, changed: false, rows: [{ id: result.rows[0]!.id, actualLaborMinutes: 45, version: 2 }, { id: result.rows[1]!.id }] })
    expect(retry.insert).not.toHaveBeenCalled()
    expect(retry.audit.writeSemantic).not.toHaveBeenCalled()
  })

  it('fails closed for stale snapshots, invalid source graphs, missing source/project, and current role revocation', async () => {
    for (const selections of [
      [membership, project, [{ ...legacySource, id: TASK_ID }]],
      [membership, project, [{ ...legacySource, tasks: [{ ...legacyTasks[0], predecessor_index: 0 }] }]],
    ]) {
      const probe = importHarness(selections)
      await expect(probe.service.importLegacy(PROJECT_ID, { sourceScheduleId: REQUEST_ID }, PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)
      expect(probe.insert).not.toHaveBeenCalled()
    }
    for (const selections of [[membership, []], [membership, project, []]]) {
      const probe = importHarness(selections)
      await expect(probe.service.importLegacy(PROJECT_ID, { sourceScheduleId: REQUEST_ID }, PRINCIPAL)).rejects.toBeInstanceOf(NotFoundException)
      expect(probe.insert).not.toHaveBeenCalled()
    }
    const revoked = importHarness([[{ ...membership[0], role: 'viewer' }]])
    await expect(revoked.service.importLegacy(PROJECT_ID, { sourceScheduleId: REQUEST_ID }, PRINCIPAL)).rejects.toBeInstanceOf(ForbiddenException)
    expect(revoked.select).toHaveBeenCalledTimes(1)
  })

  it('rejects manual code collisions, partial replay and changed content without writes', async () => {
    const initial = importHarness([membership, project, [legacySource], []])
    await initial.service.importLegacy(PROJECT_ID, { sourceScheduleId: REQUEST_ID }, PRINCIPAL)
    for (const existing of [[task()], initial.rows().slice(0, 1), initial.rows().map((row) => ({ ...row, requestHash: 'changed' }))]) {
      const probe = importHarness([membership, project, [legacySource], existing])
      await expect(probe.service.importLegacy(PROJECT_ID, { sourceScheduleId: REQUEST_ID }, PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)
      expect(probe.insert).not.toHaveBeenCalled()
      expect(probe.committed()).toEqual([])
    }
  })

  it('propagates audit failure through the transaction without committing a partial batch', async () => {
    const probe = importHarness([membership, project, [legacySource], []], true)
    await expect(probe.service.importLegacy(PROJECT_ID, { sourceScheduleId: REQUEST_ID }, PRINCIPAL)).rejects.toThrow('audit unavailable')
    expect(probe.insert).toHaveBeenCalledTimes(2)
    expect(probe.committed()).toEqual([])
  })
})

describe('ProjectScheduleService', () => {
  it('creates normalized tasks idempotently and audits the source', async () => {
    const probe = harness([membership, project, [], [], [task()] ], { insertResult: [task()] })
    await expect(probe.service.create({ projectId: PROJECT_ID, clientRequestId: REQUEST_ID, level: 'l1', taskCode: 'A-001', name: 'Mobilize', description: 'Mobilize site.', parentTaskId: null, predecessorTaskId: null, plannedStart: '2026-09-10', plannedFinish: '2026-09-12', plannedLaborMinutes: 120, ownerId: null, commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '' }, PRINCIPAL)).resolves.toMatchObject({ created: true, task: { taskCode: 'A-001' } })
    expect(probe.insert).toHaveBeenCalledWith(projectScheduleTasks)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entityType: 'project_schedule_task', action: 'create' }))
    const inserted = probe.insert.mock.results[0]!.value.values.mock.calls[0]![0] as { request_hash: string }
    const retry = harness([membership, project, [{ ...task(), requestHash: inserted.request_hash }]])
    await expect(retry.service.create({ projectId: PROJECT_ID, clientRequestId: REQUEST_ID, level: 'l1', taskCode: 'A-001', name: 'Mobilize', description: 'Mobilize site.', parentTaskId: null, predecessorTaskId: null, plannedStart: '2026-09-10', plannedFinish: '2026-09-12', plannedLaborMinutes: 120, ownerId: null, commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '' }, PRINCIPAL)).resolves.toMatchObject({ created: false, task: { id: TASK_ID } })
    expect(retry.insert).not.toHaveBeenCalled()
  })

  it('advances status with optimistic concurrency and blocks stale or unauthorized writes', async () => {
    const running = task({ status: 'in_progress', version: 2, percentComplete: 20 })
    const probe = harness([membership, project, [task()]], { updateResult: [running] })
    await expect(probe.service.updateStatus(PROJECT_ID, TASK_ID, { expectedVersion: 1, status: 'in_progress', percentComplete: 20, actualStart: '2026-09-10', actualFinish: null, actualLaborMinutes: 30, commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '' }, PRINCIPAL)).resolves.toMatchObject({ task: { status: 'in_progress', version: 2 } })
    const staleProbe = harness([membership, project, [task({ version: 2 })]])
    await expect(staleProbe.service.updateStatus(PROJECT_ID, TASK_ID, { expectedVersion: 1, status: 'in_progress', percentComplete: 20, actualStart: '2026-09-10', actualFinish: null, actualLaborMinutes: 30, commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '' }, PRINCIPAL)).rejects.toBeInstanceOf(ConflictException)
    const viewer = { ...PRINCIPAL, role: 'viewer' as const }
    const deniedProbe = harness([[{ ...membership[0], role: 'viewer' }]])
    await expect(deniedProbe.service.create({ projectId: PROJECT_ID, clientRequestId: REQUEST_ID, level: 'l1', taskCode: 'A-002', name: 'Task', description: '', parentTaskId: null, predecessorTaskId: null, plannedStart: '2026-09-10', plannedFinish: '2026-09-12', plannedLaborMinutes: 0, ownerId: null, commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '' }, viewer)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
