import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { CustomerInvoiceIssueService } from './customer-invoice-issue.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.test',
}

const INVOICE_ID = '33333333-3333-4333-8333-333333333333'

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED'
        ? enabled
        : tenantIds
    ),
  } as unknown as ConfigService
  const transaction = vi.fn()
  const database = {
    client: { transaction },
  } as unknown as DatabaseService
  return {
    service: new CustomerInvoiceIssueService(
      config,
      database,
      {} as AuditService
    ),
    transaction,
  }
}

describe('CustomerInvoiceIssueService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    const probe = service()

    await expect(
      probe.service.issue(
        INVOICE_ID,
        { postingDate: '2026-08-02' },
        PRINCIPAL,
        'invoice-issue-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('stays disabled when no tenant allowlist is present', async () => {
    const probe = service(true)

    await expect(
      probe.service.issue(
        INVOICE_ID,
        { postingDate: '2026-08-02' },
        PRINCIPAL,
        'invoice-issue-1'
      )
    ).rejects.toThrow(
      'Customer invoice issuance is not enabled for this tenant; no invoice was issued.'
    )
    expect(probe.transaction).not.toHaveBeenCalled()
  })
})
