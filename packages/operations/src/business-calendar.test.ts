import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '@third-code-erp/database'
import { resolveAwardBusinessDayService } from './business-calendar'

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const previousSetting = process.env.BUSINESS_CALENDAR_DB_ENABLED

afterEach(() => {
  if (previousSetting === undefined) delete process.env.BUSINESS_CALENDAR_DB_ENABLED
  else process.env.BUSINESS_CALENDAR_DB_ENABLED = previousSetting
})

describe('award business calendar', () => {
  it('loads tenant holidays through the caller transaction when persisted calendar is enabled', async () => {
    process.env.BUSINESS_CALENDAR_DB_ENABLED = '1'
    const orderBy = vi.fn().mockResolvedValue([])
    const where = vi.fn().mockReturnValue({ orderBy })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    // The calendar resolver uses only this read portion of the transaction.
    const tx = { select } as unknown as DatabaseTransaction

    await expect(resolveAwardBusinessDayService(tx, TENANT_ID)).resolves.toBeDefined()
    expect(select).toHaveBeenCalledOnce()
    expect(where).toHaveBeenCalledOnce()
  })

  it('uses the national seed without a database read when persisted calendar is disabled', async () => {
    delete process.env.BUSINESS_CALENDAR_DB_ENABLED
    const select = vi.fn()
    const tx = { select } as unknown as DatabaseTransaction

    await expect(resolveAwardBusinessDayService(tx, TENANT_ID)).resolves.toBeDefined()
    expect(select).not.toHaveBeenCalled()
  })
})
