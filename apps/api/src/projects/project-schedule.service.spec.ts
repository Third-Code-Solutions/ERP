import 'reflect-metadata'

import { ConflictException, ForbiddenException } from '@nestjs/common'
import { projectScheduleTasks } from '@third-code-erp/database/schema'
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

describe('ProjectScheduleService', () => {
  it('creates normalized tasks idempotently and audits the source', async () => {
    const probe = harness([membership, project, [], [], [task()] ], { insertResult: [task()] })
    await expect(probe.service.create({ projectId: PROJECT_ID, clientRequestId: REQUEST_ID, level: 'l1', taskCode: 'A-001', name: 'Mobilize', description: 'Mobilize site.', parentTaskId: null, predecessorTaskId: null, plannedStart: '2026-09-10', plannedFinish: '2026-09-12', plannedLaborMinutes: 120, ownerId: null, commitmentWeek: null, commitmentStatus: 'not_set', constraintReason: '' }, PRINCIPAL)).resolves.toMatchObject({ created: true, task: { taskCode: 'A-001' } })
    expect(probe.insert).toHaveBeenCalledWith(projectScheduleTasks)
    expect(probe.audit.writeSemantic).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entityType: 'project_schedule_task', action: 'create' }))
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
