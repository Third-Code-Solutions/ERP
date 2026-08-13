import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  requireCapability: vi.fn(),
  createCustomerInvoiceDraftThroughCoreApi: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  getUserProfile: mocks.getUserProfile,
  requireCapability: mocks.requireCapability,
}))

vi.mock('@/lib/erp-core-client', () => ({
  createCustomerInvoiceDraftThroughCoreApi:
    mocks.createCustomerInvoiceDraftThroughCoreApi,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { createInvoice } from './actions'

const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.com',
  fullName: 'Finance User',
}

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const INVOICE_ID = '44444444-4444-4444-8444-444444444444'

function invoiceForm() {
  const formData = new FormData()
  formData.set('billing_pct', '25')
  formData.set('due_date', '2026-08-15')
  formData.set('notes', 'Progress billing')
  return formData
}

describe('createInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockImplementation(() => undefined)
  })

  it('requires the existing finance capability before opening the Core boundary', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden: finance capability required')
    })

    const result = await createInvoice(PROJECT_ID, invoiceForm())

    expect(result).toEqual({ error: 'You do not have permission to create invoices.' })
    expect(mocks.requireCapability).toHaveBeenCalledWith(
      PROFILE,
      'finance.issue_invoice'
    )
    expect(mocks.createCustomerInvoiceDraftThroughCoreApi).not.toHaveBeenCalled()
  })

  it('sends only browser input to Core and preserves the tenant-scoped result', async () => {
    mocks.createCustomerInvoiceDraftThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        invoiceId: INVOICE_ID,
        tenantId: PROFILE.tenantId,
        projectId: PROJECT_ID,
        status: 'draft',
      },
    })

    const result = await createInvoice(PROJECT_ID, invoiceForm())

    expect(result).toEqual({ invoiceId: INVOICE_ID })
    expect(mocks.createCustomerInvoiceDraftThroughCoreApi).toHaveBeenCalledWith(
      PROJECT_ID,
      {
        billingPercentBps: 2500,
        bomId: null,
        dueDate: '2026-08-15',
        notes: 'Progress billing',
      },
      expect.any(String)
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/billing`
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/invoices')
  })

  it('fails closed when Core is unavailable or returns another tenant', async () => {
    mocks.createCustomerInvoiceDraftThroughCoreApi.mockResolvedValue({
      ok: false,
      error: 'ERP Core API is unavailable.',
    })
    await expect(createInvoice(PROJECT_ID, invoiceForm())).resolves.toEqual({
      error: 'ERP Core API is unavailable.',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()

    mocks.createCustomerInvoiceDraftThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        invoiceId: INVOICE_ID,
        tenantId: '99999999-9999-4999-8999-999999999999',
        projectId: PROJECT_ID,
        status: 'draft',
      },
    })
    await expect(createInvoice(PROJECT_ID, invoiceForm())).resolves.toEqual({
      error: 'Customer invoice draft returned an invalid tenant scope.',
    })
  })
})
