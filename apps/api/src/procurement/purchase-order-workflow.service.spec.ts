import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { PurchaseOrderWorkflowCommand } from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { PurchaseOrderWorkflowService } from './purchase-order-workflow.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'commercial',
  email: 'commercial@example.test',
}

const COMMAND: PurchaseOrderWorkflowCommand = {
  action: 'commercial_approve',
}

function service(
  enabled = false,
  tenantIds: string[] = [],
  notificationsEnabled = false,
  notificationTenantIds: string[] = []
) {
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'ERP_PO_WORKFLOW_WRITES_ENABLED') return enabled
      if (key === 'ERP_PO_WORKFLOW_WRITES_TENANT_IDS') return tenantIds
      if (key === 'ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED') {
        return notificationsEnabled
      }
      if (key === 'ERP_PO_WORKFLOW_NOTIFICATIONS_TENANT_IDS') {
        return notificationTenantIds
      }
      return undefined
    }),
  } as unknown as ConfigService
  return new PurchaseOrderWorkflowService(
    config,
    {} as DatabaseService,
    {} as AuditService
  )
}

describe('PurchaseOrderWorkflowService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    await expect(
      service().transition(
        '33333333-3333-4333-8333-333333333333',
        COMMAND,
        PRINCIPAL,
        'po-workflow-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('stays disabled when no tenant allowlist is present', async () => {
    await expect(
      service(true).transition(
        '33333333-3333-4333-8333-333333333333',
        COMMAND,
        PRINCIPAL,
        'po-workflow-1'
      )
    ).rejects.toThrow(
      'Purchase Order workflow is not enabled for this tenant; no status change was committed.'
    )
  })

  it('requires notification parity for an explicitly allowed workflow tenant', async () => {
    await expect(
      service(true, [PRINCIPAL.tenantId]).transition(
        '33333333-3333-4333-8333-333333333333',
        COMMAND,
        PRINCIPAL,
        'po-workflow-1'
      )
    ).rejects.toThrow(
      'Purchase Order workflow notifications are not enabled for this tenant; no status change was committed.'
    )
  })
})
