import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { CustomerInvoiceCancelService } from './customer-invoice-cancel.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.test',
}
const INVOICE_ID = '88888888-8888-4888-8888-888888888888'

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED'
        ? enabled
        : tenantIds
    ),
  } as unknown as ConfigService
  const transaction = vi.fn()
  const database = { client: { transaction } } as unknown as DatabaseService
  return {
    service: new CustomerInvoiceCancelService(config, database, {} as AuditService),
    transaction,
  }
}

describe('CustomerInvoiceCancelService migration boundary', () => {
  it('fails closed by default without touching database', async () => {
    const probe = service()
    await expect(
      probe.service.cancel(INVOICE_ID, {}, PRINCIPAL, 'invoice-cancel-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('stays disabled when no tenant allowlist is present', async () => {
    const probe = service(true)
    await expect(
      probe.service.cancel(INVOICE_ID, {}, PRINCIPAL, 'invoice-cancel-1')
    ).rejects.toThrow(
      'Customer invoice cancellation is not enabled for this tenant; no customer invoice was cancelled.'
    )
    expect(probe.transaction).not.toHaveBeenCalled()
  })
})
