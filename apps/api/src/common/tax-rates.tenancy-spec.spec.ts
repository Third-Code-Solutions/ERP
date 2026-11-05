// Spec-derived test for the Core API write-path wrapper (AC-TEN-19; plan §7.4):
// an overlap found at write time fails the write with 409, naming both codes,
// and is logged.
import { ConflictException, Logger } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveTaxRatesForWrite } from './tax-rates'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'

function transactionReturning(rows: unknown[]) {
  return {
    select: vi.fn(() => ({ from: () => ({ where: async () => rows }) })),
  } as unknown as Parameters<typeof resolveTaxRatesForWrite>[0]
}

const activeRow = {
  status: 'active',
  valid_from: '2026-01-01',
  valid_to: null,
  vat_rate_bps: 1200,
  withholding_rate_bps: 200,
  retention_rate_bps: 1000,
  vat_registered: true,
}

describe('resolveTaxRatesForWrite', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns TAX_DEFAULTS with source default when the tenant has no profile (AC-TEN-06)', async () => {
    await expect(
      resolveTaxRatesForWrite(transactionReturning([]), TENANT_ID, new Date('2026-11-04T16:30:00Z'))
    ).resolves.toEqual({
      vatBps: 1200,
      ewtBps: 200,
      retentionBps: 1000,
      vatRegistered: true,
      source: 'default',
      profileId: null,
      profileCode: null,
      asOf: '2026-11-05',
    })
  })

  it('AC-TEN-19 two active profiles on the date → 409 TAX_PROFILE_OVERLAP naming both codes, logged', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const outcome = resolveTaxRatesForWrite(
      transactionReturning([
        { ...activeRow, id: '66666666-6666-4666-8666-666666666666', code: 'PH-B' },
        { ...activeRow, id: '77777777-7777-4777-8777-777777777777', code: 'PH-A' },
      ]),
      TENANT_ID,
      new Date('2026-11-04T04:00:00Z')
    )
    await expect(outcome).rejects.toBeInstanceOf(ConflictException)
    const error = (await outcome.catch((caught: unknown) => caught)) as ConflictException
    expect(error.getStatus()).toBe(409)
    expect(error.message).toContain('TAX_PROFILE_OVERLAP')
    expect(error.message).toContain('PH-A')
    expect(error.message).toContain('PH-B')
    expect(logged).toHaveBeenCalled()
  })

  it('rethrows non-overlap errors unchanged', async () => {
    const failure = new Error('connection reset')
    const transaction = {
      select: vi.fn(() => ({ from: () => ({ where: async () => { throw failure } }) })),
    } as unknown as Parameters<typeof resolveTaxRatesForWrite>[0]
    await expect(resolveTaxRatesForWrite(transaction, TENANT_ID, new Date())).rejects.toBe(failure)
  })
})
