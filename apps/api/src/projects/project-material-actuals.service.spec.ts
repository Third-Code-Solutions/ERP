import 'reflect-metadata'

import { NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { ProjectMaterialActualsService } from './project-material-actuals.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'viewer',
  email: 'viewer@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const MATERIAL_ID = '44444444-4444-4444-8444-444444444444'

function query(result: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const method of ['from', 'where', 'limit', 'offset', 'orderBy', 'innerJoin', 'groupBy']) {
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
  return new ProjectMaterialActualsService(database)
}

describe('ProjectMaterialActualsService', () => {
  it('projects posted receipts and consumption issues without double-counting supplier bills', async () => {
    const service = harness([
      [{ tenantId: PRINCIPAL.tenantId, role: 'viewer', email: PRINCIPAL.email }],
      [{ id: PROJECT_ID }],
      [
        {
          materialItemId: MATERIAL_ID,
          code: 'MAT-001',
          description: 'Concrete',
          unit: 'm3',
          receivedQuantityMicros: '10000000',
          receivedValueCents: '250000',
          receiptLineCount: 2,
        },
      ],
      [
        {
          materialItemId: MATERIAL_ID,
          code: 'MAT-001',
          description: 'Concrete',
          unit: 'm3',
          issuedQuantityMicros: '4000000',
          issuedValueCents: '100000',
          issueLineCount: 1,
        },
      ],
      [{ count: 1 }],
      [{ count: 1 }],
    ])

    const result = await service.read(PROJECT_ID, {}, PRINCIPAL)
    expect(result.status).toBe('ready')
    expect(result.totals.receivedValueCents).toBe(250_000)
    expect(result.totals.issuedValueCents).toBe(100_000)
    expect(result.totals.remainingValueCents).toBe(150_000)
    expect(result.notes).toContain(
      'Inventory issue value is shown as operational evidence and is not added to posted supplier-bill actual cost.',
    )
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
