import 'reflect-metadata'

import { NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { ProjectPerformanceService } from './project-performance.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'viewer',
  email: 'viewer@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

function query(result: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const method of ['from', 'where', 'limit', 'offset', 'orderBy', 'innerJoin']) {
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
  return new ProjectPerformanceService(database)
}

describe('ProjectPerformanceService', () => {
  it('reads approved budget, schedule, progress, and posted actuals into EVM metrics', async () => {
    const service = harness([
      [{ id: PROJECT_ID }],
      [{ totalBudgetCents: 1_000_000, currency: 'PHP' }],
      [
        {
          plannedStart: '2026-09-01',
          plannedFinish: '2026-09-11',
          plannedLaborMinutes: 100,
          percentComplete: 40,
          status: 'in_progress',
        },
      ],
      [
        {
          percentByCategory: { overall_pct: 40 },
          weekEnding: new Date('2026-09-06T00:00:00.000Z'),
        },
      ],
      [{ actualCostCents: '350000', evidenceCount: 4 }],
    ])

    const result = await service.read(PROJECT_ID, {}, PRINCIPAL, new Date('2026-09-06T00:00:00.000Z'))
    expect(result.status).toBe('ready')
    expect(result.baselineCents).toBe(1_000_000)
    expect(result.earnedValueCents).toBe(400_000)
    expect(result.actualCostCents).toBe(350_000)
    expect(result.progressSource).toBe('weekly_progress')
    expect(result.actualCostSource).toBe('posted_supplier_bills')
  })

  it('falls back to normalized task progress and remains explicit about missing evidence', async () => {
    const service = harness([
      [{ id: PROJECT_ID }],
      [],
      [
        {
          plannedStart: '2026-09-01',
          plannedFinish: '2026-09-11',
          plannedLaborMinutes: 100,
          percentComplete: 25,
          status: 'in_progress',
        },
      ],
      [{ percentByCategory: { overall_pct: 'bad' }, weekEnding: new Date() }],
      [{ actualCostCents: 0, evidenceCount: 0 }],
    ])

    const result = await service.read(PROJECT_ID, {}, PRINCIPAL, new Date('2026-09-06T00:00:00.000Z'))
    expect(result.status).toBe('unavailable')
    expect(result.progressSource).toBe('normalized_schedule')
    expect(result.missingEvidence).toContain('approved_budget')
    expect(result.missingEvidence).toContain('posted_supplier_bill_actuals')
  })

  it('does not cross tenant or deleted-project boundaries', async () => {
    const service = harness([[]])
    await expect(service.read(PROJECT_ID, {}, PRINCIPAL)).rejects.toBeInstanceOf(NotFoundException)
  })
})
