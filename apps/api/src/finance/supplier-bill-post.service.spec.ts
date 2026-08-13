import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { SupplierBillPostService } from './supplier-bill-post.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.test',
}

const BILL_ID = '33333333-3333-4333-8333-333333333333'

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED'
        ? enabled
        : tenantIds
    ),
  } as unknown as ConfigService
  const transaction = vi.fn()
  const database = {
    client: { transaction },
  } as unknown as DatabaseService
  return {
    service: new SupplierBillPostService(
      config,
      database,
      {} as AuditService
    ),
    transaction,
  }
}

describe('SupplierBillPostService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    const probe = service()

    await expect(
      probe.service.post(
        BILL_ID,
        { postingDate: '2026-08-02' },
        PRINCIPAL,
        'supplier-bill-post-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('stays disabled when no tenant allowlist is present', async () => {
    const probe = service(true)

    await expect(
      probe.service.post(
        BILL_ID,
        { postingDate: '2026-08-02' },
        PRINCIPAL,
        'supplier-bill-post-1'
      )
    ).rejects.toThrow(
      'Supplier Bill posting is not enabled for this tenant; no supplier bill was posted.'
    )
    expect(probe.transaction).not.toHaveBeenCalled()
  })
})
