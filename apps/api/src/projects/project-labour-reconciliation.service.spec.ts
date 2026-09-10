import 'reflect-metadata'

import { NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { ProjectLabourReconciliationService } from './project-labour-reconciliation.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'viewer',
  email: 'viewer@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const TASK_ID = '44444444-4444-4444-8444-444444444444'

function query(result: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const method of ['from', 'where', 'limit', 'offset', 'orderBy']) {
    builder[method] = vi.fn().mockReturnValue(builder)
  }
  builder.then = (
    onFulfilled?: (value: unknown[]) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

function harness(selectResults: unknown[]) {
  const select = vi.fn(() => query((selectResults.shift() as unknown[] | undefined) ?? []))
  const database = { client: { select } } as unknown as DatabaseService
  return new ProjectLabourReconciliationService(database)
}

describe('ProjectLabourReconciliationService', () => {
  it('reconciles normalized schedule labour minutes', async () => {
    const service = harness([
      [{ tenantId: PRINCIPAL.tenantId, role: 'viewer', email: PRINCIPAL.email }],
      [{ id: PROJECT_ID }],
      [{
        taskId: TASK_ID,
        level: 'l1',
        taskCode: 'L1-001',
        name: 'Mobilize',
        taskStatus: 'in_progress',
        plannedLaborMinutes: 1_000,
        actualLaborMinutes: 800,
      }],
    ])

    const result = await service.read(PROJECT_ID, {}, PRINCIPAL)
    expect(result.status).toBe('ready')
    expect(result.totals.varianceMinutes).toBe(-200)
    expect(result.rows[0]?.utilizationBps).toBe(8_000)
  })

  it('does not read a cross-tenant or deleted project', async () => {
    const service = harness([
      [{ tenantId: PRINCIPAL.tenantId, role: 'viewer', email: PRINCIPAL.email }],
      [],
    ])
    await expect(service.read(PROJECT_ID, {}, PRINCIPAL)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
