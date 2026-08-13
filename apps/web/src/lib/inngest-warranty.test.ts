import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  selectFrom: vi.fn(),
  selectWhere: vi.fn(),
  selectLimit: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  notifyExternalEmail: vi.fn(),
  createFunction: vi.fn((config: unknown, handler: unknown) => ({ config, handler })),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
  },
}))

vi.mock('./inngest', () => ({
  inngest: {
    createFunction: mocks.createFunction,
  },
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyExternalEmail: mocks.notifyExternalEmail,
}))

import { dispatchOneSurvey } from './inngest-warranty'

const ticket = {
  id: 'ticket-id',
  tenant_id: 'tenant-id',
  account_id: 'account-id',
  ticket_number: 'WT-000001',
  status: 'closed' as const,
  closed_at: new Date('2026-08-10T00:00:00.000Z'),
  submitted_by_email: 'client@example.test',
}

describe('CNPS survey delivery evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReturnValue({ from: mocks.selectFrom })
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere })
    mocks.selectWhere.mockReturnValue({ limit: mocks.selectLimit })
    mocks.insert.mockReturnValue({ values: mocks.insertValues })
    mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning })
    mocks.update.mockReturnValue({ set: mocks.updateSet })
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere })
    mocks.updateWhere.mockResolvedValue(undefined)
    mocks.notifyExternalEmail.mockResolvedValue({ delivered: true })
  })

  it('stamps sent_at only after real provider delivery', async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([ticket])
      .mockResolvedValueOnce([])
    mocks.insertReturning.mockResolvedValue([{ id: 'survey-id' }])

    await expect(dispatchOneSurvey('ticket-id', 'tenant-id')).resolves.toEqual({
      sent: true,
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ sent_at: null })
    )
    expect(mocks.updateSet).toHaveBeenCalledWith({ sent_at: expect.any(Date) })
  })

  it('leaves a failed provider delivery retryable', async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([ticket])
      .mockResolvedValueOnce([])
    mocks.insertReturning.mockResolvedValue([{ id: 'survey-id' }])
    mocks.notifyExternalEmail.mockResolvedValue({ delivered: false })

    await expect(dispatchOneSurvey('ticket-id', 'tenant-id')).resolves.toEqual({
      sent: false,
      reason: 'email-not-delivered',
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ sent_at: null })
    )
    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  it('reuses an existing pending survey and stamps it only after delivery', async () => {
    mocks.selectLimit
      .mockResolvedValueOnce([ticket])
      .mockResolvedValueOnce([{ id: 'survey-id', sent_at: null }])

    await expect(dispatchOneSurvey('ticket-id', 'tenant-id')).resolves.toEqual({
      sent: true,
    })

    expect(mocks.updateSet).toHaveBeenNthCalledWith(1, {
      sent_at: null,
      response_token_hash: expect.any(String),
    })
    expect(mocks.updateSet).toHaveBeenNthCalledWith(2, {
      sent_at: expect.any(Date),
    })
  })
})
