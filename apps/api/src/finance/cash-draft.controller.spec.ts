import 'reflect-metadata'

import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { CashDraftController } from './cash-draft.controller'
import {
  CashTransactionDraftDeletePipe,
  CashTransactionDraftPipe,
} from './cash-draft.pipe'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const CASH_TRANSACTION_ID = '88888888-8888-4888-8888-888888888888'

const PRINCIPAL: ErpPrincipal = {
  userId: USER_ID,
  tenantId: TENANT_ID,
  role: 'finance',
  email: 'finance@example.test',
}

const validBody = {
  cashAccountId: '33333333-3333-4333-8333-333333333333',
  direction: 'receipt' as const,
  counterpartyId: '44444444-4444-4444-8444-444444444444',
  referenceNumber: 'RCPT-001',
  transactionDate: '2026-08-03',
  notes: null,
  allocations: [
    {
      allocationType: 'customer_current_due' as const,
      targetId: '55555555-5555-4555-8555-555555555555',
      description: null,
      amountCents: 10_000,
    },
  ],
}

describe('cash draft command controller contract', () => {
  it('rejects missing retry keys and caller authority before the service', async () => {
    const service = { save: vi.fn(), delete: vi.fn() }
    const controller = new CashDraftController(service as never)
    const pipe = new CashTransactionDraftPipe()

    expect(() =>
      controller.save(pipe.transform(validBody), undefined, PRINCIPAL)
    ).toThrow('Idempotency-Key header is required')
    expect(service.save).not.toHaveBeenCalled()
    expect(() => pipe.transform({ ...validBody, tenantId: TENANT_ID })).toThrow(
      'Invalid cash draft command'
    )
  })

  it('forwards validated save/delete commands with the server principal', async () => {
    const service = {
      save: vi.fn().mockResolvedValue({
        cashTransactionId: CASH_TRANSACTION_ID,
        tenantId: TENANT_ID,
        status: 'draft',
      }),
      delete: vi.fn().mockResolvedValue({
        cashTransactionId: CASH_TRANSACTION_ID,
        tenantId: TENANT_ID,
        status: 'deleted',
      }),
    }
    const controller = new CashDraftController(service as never)
    const body = new CashTransactionDraftPipe().transform(validBody)
    const deleteBody = new CashTransactionDraftDeletePipe().transform({})

    await expect(
      controller.save(body, ' cash-draft-1 ', PRINCIPAL)
    ).resolves.toMatchObject({ status: 'draft' })
    await expect(
      controller.delete(
        CASH_TRANSACTION_ID,
        deleteBody,
        ' cash-delete-1 ',
        PRINCIPAL
      )
    ).resolves.toMatchObject({ status: 'deleted' })

    expect(service.save).toHaveBeenCalledWith(
      body,
      PRINCIPAL,
      'cash-draft-1'
    )
    expect(service.delete).toHaveBeenCalledWith(
      CASH_TRANSACTION_ID,
      PRINCIPAL,
      'cash-delete-1'
    )
    expect(() => new CashTransactionDraftDeletePipe().transform({ tenantId: TENANT_ID })).toThrow(
      'Invalid cash draft deletion command'
    )
  })
})
