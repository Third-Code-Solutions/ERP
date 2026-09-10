import 'reflect-metadata'

import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { ProjectCloseoutReadinessService } from './project-closeout-readiness.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'viewer',
  email: 'viewer@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

function query(result: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const method of ['from', 'where', 'limit', 'offset', 'orderBy', 'innerJoin']) builder[method] = vi.fn().mockReturnValue(builder)
  builder.then = (onFulfilled?: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

function harness(selectResults: unknown[]) {
  const select = vi.fn(() => query((selectResults.shift() as unknown[] | undefined) ?? []))
  const database = { client: { select } } as unknown as DatabaseService
  return new ProjectCloseoutReadinessService(database)
}

describe('ProjectCloseoutReadinessService', () => {
  it('projects bond, retention, and explicit P&L evidence without inferring contract terms', async () => {
    const service = harness([
      [{ tenantId: PRINCIPAL.tenantId, role: 'viewer', email: PRINCIPAL.email }],
      [{ id: PROJECT_ID }],
      [{
        permitId: '44444444-4444-4444-8444-444444444444',
        permitType: 'performance_bond',
        status: 'refunded',
        expectedReturnAt: new Date('2026-06-01T00:00:00.000Z'),
        actualReturnAt: new Date('2026-06-02T00:00:00.000Z'),
        refundedAt: new Date('2026-06-03T00:00:00.000Z'),
      }],
      [{ value: 2 }],
      [{ value: 125000 }],
      [{ value: 125000 }],
    ])

    const result = await service.read(PROJECT_ID, {}, PRINCIPAL)

    expect(result.status).toBe('partial')
    expect(result.bonds).toMatchObject({ total: 1, refunded: 1, open: 0 })
    expect(result.retention).toMatchObject({ invoiceCount: 2, retainedCentavos: 125000, allocatedCentavos: 125000, openCentavos: 0 })
    expect(result.pnlCloseoutStatus).toBe('unavailable')
    expect(result.blockers).toContain('Project P&L close-out evidence is not represented in the current source records.')
  })

  it('does not read a cross-tenant or deleted project', async () => {
    const service = harness([
      [{ tenantId: PRINCIPAL.tenantId, role: 'viewer', email: PRINCIPAL.email }],
      [],
    ])

    await expect(service.read(PROJECT_ID, {}, PRINCIPAL)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('rejects a principal without a tenant membership', async () => {
    const service = harness([[]])

    await expect(service.read(PROJECT_ID, {}, PRINCIPAL)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
