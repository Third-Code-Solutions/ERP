import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { CashDraftService } from './cash-draft.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.test',
}
const CASH_TRANSACTION_ID = '88888888-8888-4888-8888-888888888888'

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED' ? enabled : tenantIds
    ),
  } as unknown as ConfigService
  const transaction = vi.fn()
  const database = { client: { transaction } } as unknown as DatabaseService
  return {
    service: new CashDraftService(config, database, {} as AuditService),
    transaction,
  }
}

describe('CashDraftService migration boundary', () => {
  it('fails closed by default without touching database', async () => {
    const probe = service()
    await expect(
      probe.service.delete(CASH_TRANSACTION_ID, PRINCIPAL, 'cash-delete-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('stays disabled when no tenant allowlist is present', async () => {
    const probe = service(true)
    await expect(
      probe.service.delete(CASH_TRANSACTION_ID, PRINCIPAL, 'cash-delete-1')
    ).rejects.toThrow(
      'Cash draft workflow is not enabled for this tenant; no cash draft was changed.'
    )
    expect(probe.transaction).not.toHaveBeenCalled()
  })
})
