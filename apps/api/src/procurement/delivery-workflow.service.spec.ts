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
  inspectionCompleteTenantIds: string[] = [],
  cancelEnabled = false,
  cancelTenantIds: string[] = [],
  sitePreparationStartEnabled = false,
  sitePreparationStartTenantIds: string[] = [],
  sitePreparationCompleteEnabled = false,
  sitePreparationCompleteTenantIds: string[] = [],
  markInTransitEnabled = false,
  markInTransitTenantIds: string[] = []
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
      if (key === 'ERP_DELIVERY_CANCEL_WRITES_ENABLED') {
        return cancelEnabled
      }
      if (key === 'ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS') {
        return cancelTenantIds
      }
      if (key === 'ERP_DELIVERY_SITE_PREPARATION_START_WRITES_ENABLED') {
        return sitePreparationStartEnabled
      }
      if (key === 'ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS') {
        return sitePreparationStartTenantIds
      }
      if (key === 'ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_ENABLED') {
        return sitePreparationCompleteEnabled
      }
      if (key === 'ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS') {
        return sitePreparationCompleteTenantIds
      }
      if (key === 'ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_ENABLED') {
        return markInTransitEnabled
      }
      if (key === 'ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_TENANT_IDS') {
        return markInTransitTenantIds
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
  it('keeps the in-transit transition closed by default without touching the database', async () => {
    await expect(
      service().markInTransit(
        '33333333-3333-4333-8333-333333333333',
        {},
        PRINCIPAL,
        'delivery-in-transit-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('stays closed when the in-transit tenant allowlist is empty', async () => {
    await expect(
      service(false, [], false, [], false, [], false, [], false, [], false, [], true).markInTransit(
        '33333333-3333-4333-8333-333333333333',
        {},
        PRINCIPAL,
        'delivery-in-transit-1'
      )
    ).rejects.toThrow(
      'Delivery in-transit transition is not enabled for this tenant; no delivery was updated.'
    )
  })

  it('validates the in-transit idempotency key before the feature gate', async () => {
    await expect(
      service().markInTransit(
        '33333333-3333-4333-8333-333333333333',
        {},
        PRINCIPAL,
        ' '
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })

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

  it('keeps site-preparation start closed by default without touching the database', async () => {
    await expect(
      service().startSitePreparation(
        '33333333-3333-4333-8333-333333333333',
        {},
        PRINCIPAL,
        'delivery-site-preparation-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('stays closed when the site-preparation tenant allowlist is empty', async () => {
    await expect(
      service(false, [], false, [], false, [], false, [], true).startSitePreparation(
        '33333333-3333-4333-8333-333333333333',
        {},
        PRINCIPAL,
        'delivery-site-preparation-1'
      )
    ).rejects.toThrow(
      'Delivery site-preparation start is not enabled for this tenant; no delivery was updated.'
    )
  })

  it('validates site-preparation idempotency keys before the feature gate', async () => {
    await expect(
      service().startSitePreparation(
        '33333333-3333-4333-8333-333333333333',
        {},
        PRINCIPAL,
        ' '
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('keeps site-preparation completion closed by default without touching the database', async () => {
    await expect(
      service().completeSitePreparation(
        '33333333-3333-4333-8333-333333333333',
        {},
        PRINCIPAL,
        'delivery-site-preparation-complete-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('stays closed when the site-preparation completion tenant allowlist is empty', async () => {
    await expect(
      service(
        false,
        [],
        false,
        [],
        false,
        [],
        false,
        [],
        false,
        [],
        true
      ).completeSitePreparation(
        '33333333-3333-4333-8333-333333333333',
        { notes: 'Staging complete' },
        PRINCIPAL,
        'delivery-site-preparation-complete-1'
      )
    ).rejects.toThrow(
      'Delivery site-preparation completion is not enabled for this tenant; no delivery was updated.'
    )
  })

  it('validates site-preparation completion idempotency keys before the feature gate', async () => {
    await expect(
      service().completeSitePreparation(
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

  it('keeps delivery cancellation closed by default without touching the database', async () => {
    await expect(
      service().cancelDelivery(
        '33333333-3333-4333-8333-333333333333',
        { reason: 'Supplier delay' },
        PRINCIPAL,
        'delivery-cancel-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('stays closed when the cancellation tenant allowlist is empty', async () => {
    await expect(
      service(false, [], false, [], false, [], true).cancelDelivery(
        '33333333-3333-4333-8333-333333333333',
        { reason: 'Supplier delay' },
        PRINCIPAL,
        'delivery-cancel-1'
      )
    ).rejects.toThrow(
      'Delivery cancellation is not enabled for this tenant; no delivery was updated.'
    )
  })

  it('validates cancellation idempotency keys before the feature gate', async () => {
    await expect(
      service().cancelDelivery(
        '33333333-3333-4333-8333-333333333333',
        { reason: 'Supplier delay' },
        PRINCIPAL,
        ' '
      )
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
