import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { CostEntryCreationService } from './cost-entry-creation.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm',
  email: 'pm@example.test',
}

const COMMAND = {
  costCodeId: '44444444-4444-4444-8444-444444444444',
  costCategory: 'material' as const,
  description: 'Concrete delivery',
  amountCents: 125_000,
  quantity: 1,
  unit: null,
  incurredAt: null,
  referenceNumber: null,
  notes: null,
}

describe('CostEntryCreationService', () => {
  it('fails closed before opening a transaction when the canary is disabled', async () => {
    const transaction = vi.fn()
    const service = new CostEntryCreationService(
      {
        get: vi.fn((key: string, fallback: unknown) => fallback),
      } as never,
      { client: { transaction } } as unknown as DatabaseService,
      {} as AuditService
    )

    await expect(
      service.create(
        '33333333-3333-4333-8333-333333333333',
        COMMAND,
        PRINCIPAL,
        'cost-create-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(transaction).not.toHaveBeenCalled()
  })
})
