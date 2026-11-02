import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  select: vi.fn(),
  selectFrom: vi.fn(),
  selectWhere: vi.fn(),
  selectLimit: vi.fn(),
  renderEmailTemplate: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    insert: mocks.insert,
    update: mocks.update,
    select: mocks.select,
  },
}))

vi.mock('./integrations/resend', () => ({
  sendEmail: mocks.sendEmail,
  renderEmailTemplate: mocks.renderEmailTemplate,
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
    mocks.select.mockReturnValue({ from: mocks.selectFrom })
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere })
    mocks.selectWhere.mockReturnValue({ limit: mocks.selectLimit })
    mocks.selectLimit.mockResolvedValue([
      { legal_name: 'Example Builders Corporation' },
    ])
    mocks.renderEmailTemplate.mockReturnValue({
      subject: 'BOM ready',
      html: '<p>BOM ready</p>',
      text: 'BOM ready',
    })
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
    expect(mocks.renderEmailTemplate).toHaveBeenCalledWith(
      'bom-portal-link',
      input.templateVars,
      'Example Builders Corporation'
    )
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
