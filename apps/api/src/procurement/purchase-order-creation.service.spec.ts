import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { CreatePurchaseOrderCommand } from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { PurchaseOrderCreationService } from './purchase-order-creation.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.test',
}

const COMMAND: CreatePurchaseOrderCommand = {
  projectId: '33333333-3333-4333-8333-333333333333',
  vendorId: null,
  deliveryDate: null,
  notes: null,
  lines: [
    {
      description: 'Concrete',
      quantity: 1,
      unitCostCents: 10_000,
      costCodeId: '44444444-4444-4444-8444-444444444444',
    },
  ],
}

function service(enabled = false) {
  const config = {
    get: vi.fn().mockReturnValue(enabled),
  } as unknown as ConfigService
  return new PurchaseOrderCreationService(config)
}

describe('PurchaseOrderCreationService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    await expect(
      service().create(COMMAND, PRINCIPAL, 'po-create-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('stays disabled even if the provisional flag is set', async () => {
    await expect(
      service(true).create(COMMAND, PRINCIPAL, 'po-create-1')
    ).rejects.toThrow(
      'Purchase Order command migration is not ready; no Purchase Order was created.'
    )
  })
})
