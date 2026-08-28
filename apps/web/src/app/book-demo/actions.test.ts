import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  logPlatformAction: vi.fn(),
  revalidatePath: vi.fn(),
  transaction: vi.fn(),
  writePlatformAuditLogInTransaction: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { transaction: mocks.transaction },
}))

vi.mock('@/lib/owner-admin', () => ({
  logPlatformAction: mocks.logPlatformAction,
}))

vi.mock('@/lib/platform-audit', () => ({
  writePlatformAuditLogInTransaction: mocks.writePlatformAuditLogInTransaction,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { submitDemoRequest } from './actions'

const REQUEST_ID = '11111111-1111-4111-8111-111111111111'

function validForm(): FormData {
  const form = new FormData()
  form.set('contactName', 'Ana Reyes')
  form.set('workEmail', 'ANA@EXAMPLE.TEST')
  form.set('companyName', 'Reyes Builders')
  form.set('organizationType', 'construction')
  form.set('useCase', 'Unify handoff records and project cost controls.')
  form.set('privacyConsent', 'on')
  return form
}

describe('public demo request action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects invalid public input before opening a database transaction', async () => {
    const form = validForm()
    form.delete('privacyConsent')

    await expect(submitDemoRequest({ status: 'idle', message: '' }, form)).resolves.toEqual({
      status: 'error',
      message: 'Invalid literal value, expected "on"',
    })

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.writePlatformAuditLogInTransaction).not.toHaveBeenCalled()
  })

  it('acknowledges honeypot submissions without persisting them', async () => {
    const form = validForm()
    form.set('website', 'https://spam.invalid')

    await expect(submitDemoRequest({ status: 'idle', message: '' }, form)).resolves.toEqual({
      status: 'success',
      message: 'Thanks — we received your request and will be in touch shortly.',
    })

    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.logPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'rejected' })
    )
  })

  it('persists a normalized request and its platform audit evidence atomically', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: REQUEST_ID }])
    const values = vi.fn().mockReturnValue({ returning })
    const insert = vi.fn().mockReturnValue({ values })
    const tx = { insert }
    mocks.transaction.mockImplementation(async (callback) => callback(tx))

    await expect(
      submitDemoRequest({ status: 'idle', message: '' }, validForm())
    ).resolves.toEqual({
      status: 'success',
      message: 'Thanks — we received your request and will be in touch shortly.',
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_name: 'Ana Reyes',
        work_email: 'ana@example.test',
        company_name: 'Reyes Builders',
        organization_type: 'construction',
      })
    )
    expect(mocks.writePlatformAuditLogInTransaction).toHaveBeenCalledWith(tx, {
      actorId: null,
      actorEmail: null,
      entityType: 'demo_request',
      entityId: REQUEST_ID,
      action: 'create',
      details: { source: 'book_demo' },
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/owner')
  })

  it('does not acknowledge a request when the atomic persistence operation fails', async () => {
    mocks.transaction.mockRejectedValue(new Error('database unavailable'))

    await expect(
      submitDemoRequest({ status: 'idle', message: '' }, validForm())
    ).resolves.toEqual({
      status: 'error',
      message: 'We could not save your request. Please try again shortly.',
    })

    expect(mocks.logPlatformAction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failed' })
    )
  })
})
