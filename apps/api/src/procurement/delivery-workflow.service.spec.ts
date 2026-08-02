import 'reflect-metadata'

import { BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { DeliveryWorkflowService } from './delivery-workflow.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'procurement',
  email: 'procurement@example.test',
}

function service(
  enabled = false,
  tenantIds: string[] = [],
  inspectionStartEnabled = false,
  inspectionStartTenantIds: string[] = [],
  inspectionCompleteEnabled = false,
  inspectionCompleteTenantIds: string[] = []
) {
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'ERP_DELIVERY_RECEIPT_WRITES_ENABLED') return enabled
      if (key === 'ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS') return tenantIds
      if (key === 'ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED') {
        return inspectionStartEnabled
      }
      if (key === 'ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS') {
        return inspectionStartTenantIds
      }
      if (key === 'ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_ENABLED') {
        return inspectionCompleteEnabled
      }
      if (key === 'ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS') {
        return inspectionCompleteTenantIds
      }
      return undefined
    }),
  } as unknown as ConfigService
  return new DeliveryWorkflowService(
    config,
    {} as DatabaseService,
    {} as AuditService
  )
}

describe('DeliveryWorkflowService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    await expect(
      service().recordReceipt(
        '33333333-3333-4333-8333-333333333333',
        { notes: null },
        PRINCIPAL,
        'delivery-receipt-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('stays disabled when no tenant allowlist is present', async () => {
    await expect(
      service(true).recordReceipt(
        '33333333-3333-4333-8333-333333333333',
        {},
        PRINCIPAL,
        'delivery-receipt-1'
      )
    ).rejects.toThrow(
      'Delivery receipt is not enabled for this tenant; no delivery was updated.'
    )
  })

  it('validates the idempotency key before the feature gate', async () => {
    await expect(
      service().recordReceipt(
        '33333333-3333-4333-8333-333333333333',
        {},
        PRINCIPAL,
        ' '
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('keeps inspection start closed by default without touching the database', async () => {
    await expect(
      service().startInspection(
        '33333333-3333-4333-8333-333333333333',
        {},
        PRINCIPAL,
        'delivery-inspection-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('stays closed when the inspection tenant allowlist is empty', async () => {
    await expect(
      service(false, [], true).startInspection(
        '33333333-3333-4333-8333-333333333333',
        {},
        PRINCIPAL,
        'delivery-inspection-1'
      )
    ).rejects.toThrow(
      'Delivery inspection start is not enabled for this tenant; no inspection was started.'
    )
  })

  it('validates inspection idempotency keys before the feature gate', async () => {
    await expect(
      service().startInspection(
        '33333333-3333-4333-8333-333333333333',
        {},
        PRINCIPAL,
        ' '
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('keeps inspection completion closed by default without touching the database', async () => {
    await expect(
      service().completeInspection(
        '33333333-3333-4333-8333-333333333333',
        { result: 'pass' },
        PRINCIPAL,
        'delivery-inspection-complete-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('stays closed when the inspection completion tenant allowlist is empty', async () => {
    await expect(
      service(false, [], false, [], true).completeInspection(
        '33333333-3333-4333-8333-333333333333',
        { result: 'partial_pass', acceptanceNotes: 'Conditional acceptance' },
        PRINCIPAL,
        'delivery-inspection-complete-1'
      )
    ).rejects.toThrow(
      'Delivery inspection completion is not enabled for this tenant; no delivery was updated.'
    )
  })

  it('validates inspection completion idempotency keys before the feature gate', async () => {
    await expect(
      service().completeInspection(
        '33333333-3333-4333-8333-333333333333',
        { result: 'pass' },
        PRINCIPAL,
        ' '
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
