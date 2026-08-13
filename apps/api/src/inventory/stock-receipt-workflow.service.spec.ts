import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type {
  StockReceiptPostCommand,
  StockReceiptReverseCommand,
} from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { StockReceiptWorkflowService } from './stock-receipt-workflow.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.test',
}

const RECEIPT_ID = '33333333-3333-4333-8333-333333333333'
const POST_COMMAND: StockReceiptPostCommand = { postingDate: '2026-08-02' }
const REVERSE_COMMAND: StockReceiptReverseCommand = {
  postingDate: '2026-08-02',
  reason: 'Supplier correction',
}

function service(
  postEnabled = false,
  postTenantIds: string[] = [],
  reverseEnabled = false,
  reverseTenantIds: string[] = []
) {
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'ERP_INVENTORY_RECEIPT_POST_WRITES_ENABLED') {
        return postEnabled
      }
      if (key === 'ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS') {
        return postTenantIds
      }
      if (key === 'ERP_INVENTORY_RECEIPT_REVERSE_WRITES_ENABLED') {
        return reverseEnabled
      }
      if (key === 'ERP_INVENTORY_RECEIPT_REVERSE_WRITES_TENANT_IDS') {
        return reverseTenantIds
      }
      return undefined
    }),
  } as unknown as ConfigService
  const transaction = vi.fn()
  const database = {
    client: { transaction },
  } as unknown as DatabaseService
  return {
    service: new StockReceiptWorkflowService(
      config,
      database,
      {} as AuditService
    ),
    transaction,
  }
}

describe('StockReceiptWorkflowService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    const probe = service()

    await expect(
      probe.service.post(RECEIPT_ID, POST_COMMAND, PRINCIPAL, 'receipt-post-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(
      probe.service.reverse(
        RECEIPT_ID,
        REVERSE_COMMAND,
        PRINCIPAL,
        'receipt-reverse-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('stays disabled when the selected tenant is absent from either allowlist', async () => {
    const probe = service(true, [], true, [])

    await expect(
      probe.service.post(RECEIPT_ID, POST_COMMAND, PRINCIPAL, 'receipt-post-2')
    ).rejects.toThrow(
      'Stock Receipt posting is not enabled for this tenant; no receipt was posted.'
    )
    await expect(
      probe.service.reverse(
        RECEIPT_ID,
        REVERSE_COMMAND,
        PRINCIPAL,
        'receipt-reverse-2'
      )
    ).rejects.toThrow(
      'Stock Receipt reversal is not enabled for this tenant; no receipt was reversed.'
    )
    expect(probe.transaction).not.toHaveBeenCalled()
  })
})
