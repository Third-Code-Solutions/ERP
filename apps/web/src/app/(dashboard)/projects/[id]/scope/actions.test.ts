import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  can: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  can: mocks.can,
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
  },
}))

vi.mock('@/lib/audit', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

import {
  addScopeItem,
  deleteScopeItem,
  updateScopeItemCost,
} from './actions'

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const ITEM_ID = '22222222-2222-4222-8222-222222222222'

function scopeItemForm(): FormData {
  const formData = new FormData()
  formData.set('description', 'Air handling unit')
  formData.set('quantity', '1')
  return formData
}

describe('legacy scope mutation authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue({
      user: { id: '33333333-3333-4333-8333-333333333333' },
      tenantId: '44444444-4444-4444-8444-444444444444',
      role: 'viewer',
    })
    mocks.can.mockReturnValue(false)
  })

  it('rejects unauthorized item creation before database access', async () => {
    await expect(addScopeItem(PROJECT_ID, scopeItemForm())).resolves.toEqual({
      error: 'Forbidden',
    })

    expect(mocks.can).toHaveBeenCalledWith('viewer', 'bom.edit')
    expectDatabaseNotCalled()
  })

  it('rejects unauthorized cost changes before database access', async () => {
    await expect(
      updateScopeItemCost(ITEM_ID, PROJECT_ID, 12_500)
    ).resolves.toEqual({ error: 'Forbidden' })

    expect(mocks.can).toHaveBeenCalledWith('viewer', 'bom.edit')
    expectDatabaseNotCalled()
  })

  it('rejects unauthorized deletion before database access', async () => {
    await expect(deleteScopeItem(ITEM_ID, PROJECT_ID)).resolves.toEqual({
      error: 'Forbidden',
    })

    expect(mocks.can).toHaveBeenCalledWith('viewer', 'bom.edit')
    expectDatabaseNotCalled()
  })
})

function expectDatabaseNotCalled(): void {
  expect(mocks.select).not.toHaveBeenCalled()
  expect(mocks.insert).not.toHaveBeenCalled()
  expect(mocks.update).not.toHaveBeenCalled()
  expect(mocks.delete).not.toHaveBeenCalled()
}
