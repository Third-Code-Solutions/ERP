import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { upsertRateCard } from './actions'

const MATERIAL_ID = '11111111-1111-4111-8111-111111111111'

function rateCardForm(price: string | null): FormData {
  const form = new FormData()
  form.set('material_item_id', MATERIAL_ID)
  if (price !== null) form.set('unit_price_php', price)
  return form
}

describe('upsertRateCard price validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireUserProfile.mockResolvedValue({
      role: 'admin',
      tenantId: '22222222-2222-4222-8222-222222222222',
      user: { id: '33333333-3333-4333-8333-333333333333' },
    })
    mocks.can.mockReturnValue(true)
    // The material-item lookup finds nothing, so a valid price stops there.
    mocks.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    })
  })

  it.each([
    ['a zero price', '0'],
    ['a price that rounds to 0 centavos', '0.004'],
    ['a missing price', null],
    ['a negative price', '-5'],
  ])('rejects %s before touching the database', async (_label, price) => {
    await expect(upsertRateCard(rateCardForm(price))).resolves.toEqual({
      error: 'unit_price_php: price must be at least ₱0.01',
    })
    expect(mocks.select).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('accepts the smallest billable price of ₱0.01', async () => {
    await expect(upsertRateCard(rateCardForm('0.01'))).resolves.toEqual({
      error: 'Material item not found',
    })
    expect(mocks.select).toHaveBeenCalledTimes(1)
  })
})
