import 'reflect-metadata'

import { NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { DatabaseService } from '../database/database.service'
import { ProjectHandoverReadinessService } from './project-handover-readiness.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'viewer',
  email: 'viewer@example.test',
}
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

function query(result: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const method of ['from', 'where', 'limit', 'offset', 'orderBy']) builder[method] = vi.fn().mockReturnValue(builder)
  builder.then = (onFulfilled?: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

function harness(selectResults: unknown[]) {
  const select = vi.fn(() => query((selectResults.shift() as unknown[] | undefined) ?? []))
  const database = { client: { select } } as unknown as DatabaseService
  return new ProjectHandoverReadinessService(database)
}

describe('ProjectHandoverReadinessService', () => {
  it('projects turnover, COC, punchlist, and occupancy evidence', async () => {
    const service = harness([
      [{ tenantId: PRINCIPAL.tenantId, role: 'viewer', email: PRINCIPAL.email }],
      [{ id: PROJECT_ID }],
      [{ asBuiltDocumentId: '55555555-5555-4555-8555-555555555555', omManualDocumentId: '66666666-6666-4666-8666-666666666666', warrantyCertDocumentId: '77777777-7777-4777-8777-777777777777', keysLogDocumentId: '88888888-8888-4888-8888-888888888888', compiledAt: new Date() }],
      [{ status: 'signed' }],
      [{ total: 2, open: 0 }],
      [{ status: 'released' }],
    ])
    const result = await service.read(PROJECT_ID, {}, PRINCIPAL)
    expect(result.status).toBe('ready')
    expect(result.attachedSlotCount).toBe(4)
  })

  it('does not read a cross-tenant or deleted project', async () => {
    const service = harness([
      [{ tenantId: PRINCIPAL.tenantId, role: 'viewer', email: PRINCIPAL.email }],
      [],
    ])
    await expect(service.read(PROJECT_ID, {}, PRINCIPAL)).rejects.toBeInstanceOf(NotFoundException)
  })
})
