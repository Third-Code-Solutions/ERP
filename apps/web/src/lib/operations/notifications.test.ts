import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  select: vi.fn(),
  selectLimit: vi.fn(),
  bomTemplate: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  sendEmail: vi.fn(),
  selectFrom: vi.fn(),
  selectWhere: vi.fn(),
  roleRecipients: vi.fn(),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    insert: mocks.insert,
    select: mocks.select,
    update: mocks.update,
  },
}))

vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: mocks.eq,
}))

vi.mock('./integrations/resend', () => ({
  sendEmail: mocks.sendEmail,
  templates: {
    'bom-portal-link': mocks.bomTemplate,
  },
}))

import { tenants, users } from '@third-code-erp/database/schema'
import { emailRoles, notifyExternalEmail } from './notifications'

describe('external email delivery evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReturnValue({ from: mocks.selectFrom })
    mocks.selectFrom.mockImplementation((table: unknown) =>
      table === users ? { where: mocks.roleRecipients } : { where: mocks.selectWhere }
    )
    mocks.selectWhere.mockReturnValue({ limit: mocks.selectLimit })
    mocks.selectLimit.mockResolvedValue([{ name: 'Northwind Builders' }])
    mocks.bomTemplate.mockReturnValue({
      subject: 'BOM ready',
      html: '<p>BOM ready</p>',
      text: 'BOM ready',
    })
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

  it('builds the email in the name of the tenant that issues it', async () => {
    mocks.sendEmail.mockResolvedValue({ id: 'provider-id', is_dev_stub: false })

    await notifyExternalEmail(input)

    expect(mocks.bomTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ project_name: 'Project', company_name: 'Northwind Builders' })
    )
  })

  it('uses a neutral company name when the tenant row has no name', async () => {
    mocks.sendEmail.mockResolvedValue({ id: 'provider-id', is_dev_stub: false })
    mocks.selectLimit.mockResolvedValue([])

    await notifyExternalEmail(input)

    expect(mocks.bomTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ company_name: 'Your contractor' })
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

  it('reports a delivered email as delivered when stamping its notification fails', async () => {
    mocks.sendEmail.mockResolvedValue({ id: 'provider-id', is_dev_stub: false })
    mocks.updateWhere.mockRejectedValueOnce(new Error('connection reset'))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    // A throw would make the caller retry, and a retried caller can send again.
    await expect(notifyExternalEmail(input)).resolves.toEqual({ delivered: true })
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('"event":"notification_sent_at_stamp_failed"'))
    logged.mockRestore()
  })

  it('keeps delivery evidence pending when the provider fails', async () => {
    mocks.sendEmail.mockRejectedValue(new Error('provider unavailable'))

    await expect(notifyExternalEmail(input)).resolves.toEqual({ delivered: false })
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ sent_at: null })
    )
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('reads the name of the dispatching tenant by its id', async () => {
    mocks.sendEmail.mockResolvedValue({ id: 'provider-id', is_dev_stub: false })

    await notifyExternalEmail(input)

    expect(mocks.selectFrom).toHaveBeenCalledWith(tenants)
    const [condition] = mocks.selectWhere.mock.calls[0] ?? []
    expect(condition.column).toBe(tenants.id)
    expect(condition.value).toBe('tenant-id')
  })

  it('never lets caller-supplied template vars set the issuing company', async () => {
    mocks.sendEmail.mockResolvedValue({ id: 'provider-id', is_dev_stub: false })

    await notifyExternalEmail({
      ...input,
      templateVars: { ...input.templateVars, company_name: 'Spoof Co' },
    })

    expect(mocks.bomTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ company_name: 'Northwind Builders' })
    )
  })

  it('still sends with the neutral name when the tenant read fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.sendEmail.mockResolvedValue({ id: 'provider-id', is_dev_stub: false })
    mocks.selectLimit.mockRejectedValue(new Error('db down'))

    await expect(notifyExternalEmail(input)).resolves.toEqual({ delivered: true })

    expect(mocks.bomTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ company_name: 'Your contractor' })
    )
    expect(mocks.sendEmail).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledOnce()
    error.mockRestore()
  })

  it('reads the tenant name once per role dispatch, not once per recipient', async () => {
    mocks.sendEmail.mockResolvedValue({ id: 'provider-id', is_dev_stub: false })
    mocks.roleRecipients.mockResolvedValue([
      { id: 'u1', email: 'a@example.test' },
      { id: 'u2', email: 'b@example.test' },
    ])

    await emailRoles({
      tenantId: 'tenant-id',
      recipientRoles: ['finance'],
      subject: 'BOM ready',
      alsoEmail: true,
      templateId: 'bom-portal-link',
      templateVars: input.templateVars,
    })

    expect(mocks.sendEmail).toHaveBeenCalledTimes(2)
    expect(mocks.selectLimit).toHaveBeenCalledOnce()
    expect(mocks.bomTemplate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ company_name: 'Northwind Builders' })
    )
  })
})
