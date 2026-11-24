import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  where: vi.fn(),
  set: vi.fn(),
  notifyExternalEmail: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: { select: mocks.select, update: mocks.update },
}))

vi.mock('@third-code-erp/database/schema', () => ({
  poLineItems: {
    po_id: 'po_line_items.po_id',
    tenant_id: 'po_line_items.tenant_id',
    sort_order: 'po_line_items.sort_order',
  },
  purchaseOrders: { id: 'purchase_orders.id', tenant_id: 'purchase_orders.tenant_id' },
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  asc: vi.fn((column: unknown) => ({ asc: column })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
}))

vi.mock('@/lib/operations/notifications', () => ({
  notifyExternalEmail: mocks.notifyExternalEmail,
}))

import { sendSupplierPoEmail, type SupplierPoEmailInput } from './supplier-po-email'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const PO_ID = '44444444-4444-4444-8444-444444444444'

const INPUT: SupplierPoEmailInput = {
  tenantId: TENANT_ID,
  poId: PO_ID,
  poNumber: 'PO-0001',
  totalCents: 313_125,
  vendorId: '66666666-6666-4666-8666-666666666666',
  supplierName: 'Concrete Co',
  supplierEmail: 'supplier@example.com',
}

const LINES = [
  {
    code: 'CEM-40',
    description: 'Cement 40kg',
    unit: 'bag',
    quantityMicros: 12_500_000,
    unitCostCents: 25_050,
    lineTotalCents: 313_125,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const limit = vi.fn().mockResolvedValue(LINES)
  const orderBy = vi.fn().mockReturnValue({ limit })
  const selectWhere = vi.fn().mockReturnValue({ orderBy })
  mocks.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: selectWhere }) })
  mocks.where.mockResolvedValue(undefined)
  mocks.set.mockReturnValue({ where: mocks.where })
  mocks.update.mockReturnValue({ set: mocks.set })
  mocks.notifyExternalEmail.mockResolvedValue({ delivered: true })
})

describe('sendSupplierPoEmail', () => {
  it('says there is no supplier and sends nothing', async () => {
    await expect(sendSupplierPoEmail({ ...INPUT, vendorId: null })).resolves.toBe('no_vendor')
    expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('says the supplier has no email address and sends nothing', async () => {
    await expect(sendSupplierPoEmail({ ...INPUT, supplierEmail: null })).resolves.toBe('no_email')
    expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
  })

  it('emails the lines to the supplier and stamps the send on the tenant-scoped PO', async () => {
    await expect(sendSupplierPoEmail(INPUT)).resolves.toBe('sent')

    expect(mocks.notifyExternalEmail).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      recipientEmail: 'supplier@example.com',
      subject: 'Purchase order PO-0001',
      templateId: 'po-issued',
      templateVars: {
        po_number: 'PO-0001',
        total_php: '3,131.25',
        supplier_name: 'Concrete Co',
        lines_text: '1. CEM-40 Cement 40kg: 12.5 bag at PHP 250.50 = PHP 3,131.25',
      },
    })
    expect(mocks.set).toHaveBeenCalledWith({
      supplier_email_sent_at: expect.any(Date),
      updated_at: expect.any(Date),
    })
    expect(mocks.where).toHaveBeenCalledWith({
      and: [
        { eq: ['purchase_orders.id', PO_ID] },
        { eq: ['purchase_orders.tenant_id', TENANT_ID] },
      ],
    })
  })

  it('reports a provider failure and leaves the send unstamped so it can be retried', async () => {
    mocks.notifyExternalEmail.mockResolvedValue({ delivered: false })

    await expect(sendSupplierPoEmail(INPUT)).resolves.toBe('provider_error')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('never throws when the provider call fails', async () => {
    mocks.notifyExternalEmail.mockRejectedValue(new Error('Resend send failed (500)'))

    await expect(sendSupplierPoEmail(INPUT)).resolves.toBe('provider_error')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('reports a failure when the lines cannot be read instead of sending a thin email', async () => {
    mocks.select.mockImplementation(() => {
      throw new Error('connection lost')
    })

    await expect(sendSupplierPoEmail(INPUT)).resolves.toBe('provider_error')
    expect(mocks.notifyExternalEmail).not.toHaveBeenCalled()
  })

  it('still reports sent when only the evidence stamp fails, so nobody sends a duplicate', async () => {
    mocks.where.mockRejectedValue(new Error('write failed'))

    await expect(sendSupplierPoEmail(INPUT)).resolves.toBe('sent')
  })
})
