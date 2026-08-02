import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type {
  CreatePurchaseOrderCommand,
  CreatePurchaseOrderFromBomCommand,
} from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
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

const BOM_COMMAND: CreatePurchaseOrderFromBomCommand = {
  bomId: '55555555-5555-4555-8555-555555555555',
  projectId: COMMAND.projectId,
  vendorId: null,
  deliveryDate: null,
  notes: null,
}

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) => {
      if (
        key === 'ERP_PO_CREATE_WRITES_ENABLED' ||
        key === 'ERP_PO_BOM_CREATE_WRITES_ENABLED'
      ) {
        return enabled
      }
      if (
        key === 'ERP_PO_CREATE_WRITES_TENANT_IDS' ||
        key === 'ERP_PO_BOM_CREATE_WRITES_TENANT_IDS'
      ) {
        return tenantIds
      }
      return undefined
    }),
  } as unknown as ConfigService
  return new PurchaseOrderCreationService(
    config,
    {} as DatabaseService,
    {} as AuditService
  )
}

describe('PurchaseOrderCreationService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    await expect(
      service().create(COMMAND, PRINCIPAL, 'po-create-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('stays disabled when no tenant allowlist is present', async () => {
    await expect(
      service(true).create(COMMAND, PRINCIPAL, 'po-create-1')
    ).rejects.toThrow(
      'Purchase Order command is not enabled for this tenant; no Purchase Order was created.'
    )
  })

  it('fails closed for BOM-to-PO creation by default', async () => {
    await expect(
      service().createFromBom(BOM_COMMAND, PRINCIPAL, 'bom-po-create-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('keeps BOM-to-PO creation disabled without its tenant allowlist', async () => {
    await expect(
      service(true).createFromBom(BOM_COMMAND, PRINCIPAL, 'bom-po-create-1')
    ).rejects.toThrow(
      'BOM Purchase Order command is not enabled for this tenant; no Purchase Order was created.'
    )
  })
})
