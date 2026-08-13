import 'reflect-metadata'

import { ServiceUnavailableException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { JournalReverseService } from './journal-reverse.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.test',
}

const JOURNAL_ID = '33333333-3333-4333-8333-333333333333'
const COMMAND = {
  reason: 'Correct duplicate accrual',
  postingDate: '2026-08-02',
}

function service(enabled = false, tenantIds: string[] = []) {
  const config = {
    get: vi.fn((key: string) =>
      key === 'ERP_FINANCE_JOURNAL_REVERSE_WRITES_ENABLED'
        ? enabled
        : tenantIds
    ),
  } as unknown as ConfigService
  const transaction = vi.fn()
  const database = {
    client: { transaction },
  } as unknown as DatabaseService
  return {
    service: new JournalReverseService(
      config,
      database,
      {} as AuditService
    ),
    transaction,
  }
}

describe('JournalReverseService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    const probe = service()

    await expect(
      probe.service.reverse(JOURNAL_ID, COMMAND, PRINCIPAL, 'journal-reverse-1')
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('stays disabled when the selected tenant is absent from the allowlist', async () => {
    const probe = service(true, [])

    await expect(
      probe.service.reverse(JOURNAL_ID, COMMAND, PRINCIPAL, 'journal-reverse-2')
    ).rejects.toThrow(
      'Finance journal reversal is not enabled for this tenant; no journal was reversed.'
    )
    expect(probe.transaction).not.toHaveBeenCalled()
  })

  it('rejects an invalid idempotency key before the transaction', async () => {
    const probe = service(true, [PRINCIPAL.tenantId])

    await expect(
      probe.service.reverse(JOURNAL_ID, COMMAND, PRINCIPAL, '   ')
    ).rejects.toThrow('Invalid Idempotency-Key header')
    expect(probe.transaction).not.toHaveBeenCalled()
  })
})
