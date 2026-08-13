import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    insert: mocks.insert,
    update: mocks.update,
  },
}))

vi.mock('./integrations/resend', () => ({
  sendEmail: mocks.sendEmail,
  templates: {
    'bom-portal-link': () => ({
      subject: 'BOM ready',
      html: '<p>BOM ready</p>',
      text: 'BOM ready',
    }),
  },
}))

import { notifyExternalEmail } from './notifications'

describe('external email delivery evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.insert.mockReturnValue({ values: mocks.insertValues })
    mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning })
    mocks.insertReturning.mockResolvedValue([{ id: 'notification-id' }])
    mocks.update.mockReturnValue({ set: mocks.updateSet })
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere })
    mocks.updateWhere.mockResolvedValue(undefined)
  })

  const input = {
    tenantId: 'tenant-id',
    recipientEmail: 'client@example.test',
    subject: 'BOM ready',
    templateId: 'bom-portal-link' as const,
    templateVars: {
      project_name: 'Project',
      portal_url: 'https://example.test/portal',
      valid_until: 'tomorrow',
    },
  }

  it('marks the notification delivered only after a real provider response', async () => {
    mocks.sendEmail.mockResolvedValue({ id: 'provider-id', is_dev_stub: false })

    await notifyExternalEmail(input)

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ sent_at: null })
    )
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ sent_at: expect.any(Date) }))
  })

  it('keeps development-stub delivery pending', async () => {
    mocks.sendEmail.mockResolvedValue({ id: 'dev-email-id', is_dev_stub: true })

    await notifyExternalEmail(input)

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ sent_at: null })
    )
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('keeps delivery evidence pending when the provider fails', async () => {
    mocks.sendEmail.mockRejectedValue(new Error('provider unavailable'))

    await expect(notifyExternalEmail(input)).resolves.toEqual({ delivered: false })
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ sent_at: null })
    )
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
