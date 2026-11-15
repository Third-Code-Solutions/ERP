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

import { createInvoice, createInvoiceDraft } from './actions'

const PROFILE = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'finance',
  email: 'finance@example.com',
  fullName: 'Finance User',
}

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const INVOICE_ID = '44444444-4444-4444-8444-444444444444'

function invoiceForm(billingPct = '25') {
  const formData = new FormData()
  formData.set('billing_pct', billingPct)
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

  it('converts the typed percent to exact half-up bps (D-15)', async () => {
    mocks.createCustomerInvoiceDraftThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        invoiceId: INVOICE_ID,
        tenantId: PROFILE.tenantId,
        projectId: PROJECT_ID,
        status: 'draft',
      },
    })

    // Math.round(parseFloat('1.005') * 100) sent 100 bps
    await createInvoice(PROJECT_ID, invoiceForm('1.005'))
    await createInvoice(PROJECT_ID, invoiceForm('100'))

    const sentBps = mocks.createCustomerInvoiceDraftThroughCoreApi.mock.calls.map(
      ([, command]) => command.billingPercentBps
    )
    expect(sentBps).toEqual([101, 10_000])
  })

  it.each(['0', '0.004', '100.01', '1e2', '-5', '12,5', ''])(
    'rejects billing %% %j before calling Core (D-15)',
    async (billingPct) => {
      await expect(createInvoice(PROJECT_ID, invoiceForm(billingPct))).resolves.toEqual({
        error: 'Billing % must be between 0.01% and 100%',
      })
      expect(mocks.createCustomerInvoiceDraftThroughCoreApi).not.toHaveBeenCalled()
    }
  )
})

describe('createInvoiceDraft (BOM builder billing)', () => {
  const BOM_ID = '55555555-5555-4555-8555-555555555555'
  const draft = (billingPercentBps: number) => ({
    billingPercentBps,
    bomId: BOM_ID,
    dueDate: '2026-08-15',
    notes: null,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUserProfile.mockResolvedValue(PROFILE)
    mocks.requireCapability.mockImplementation(() => undefined)
  })

  it("forwards the builder's BOM id to Core and revalidates the billing views", async () => {
    mocks.createCustomerInvoiceDraftThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        invoiceId: INVOICE_ID,
        tenantId: PROFILE.tenantId,
        projectId: PROJECT_ID,
        status: 'draft',
      },
    })

    await expect(createInvoiceDraft(PROJECT_ID, draft(2500))).resolves.toEqual({
      invoiceId: INVOICE_ID,
    })
    expect(mocks.createCustomerInvoiceDraftThroughCoreApi).toHaveBeenCalledWith(
      PROJECT_ID,
      { billingPercentBps: 2500, bomId: BOM_ID, dueDate: '2026-08-15', notes: null },
      expect.any(String)
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/billing`)
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/invoices')
  })

  it("relays Core's refusal of a BOM that is not the project's latest approved one", async () => {
    mocks.createCustomerInvoiceDraftThroughCoreApi.mockResolvedValue({
      ok: false,
      error: "Only the project's latest approved BOM can be billed",
    })

    await expect(createInvoiceDraft(PROJECT_ID, draft(2500))).resolves.toEqual({
      error: "Only the project's latest approved BOM can be billed",
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it.each([0, -1, 10_001, 12.5, Number.NaN])(
    'rejects a client-sent %j bps before calling Core',
    async (billingPercentBps) => {
      await expect(createInvoiceDraft(PROJECT_ID, draft(billingPercentBps))).resolves.toEqual({
        error: 'Billing % must be between 0.01% and 100%',
      })
      expect(mocks.createCustomerInvoiceDraftThroughCoreApi).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['a non-ISO due date', { dueDate: '15/08/2026' }, 'Due date requires YYYY-MM-DD'],
    ['a malformed BOM id', { bomId: 'not-a-uuid' }, 'Invalid uuid'],
    ['notes over 2,000 characters', { notes: 'x'.repeat(2_001) }, '2000'],
    ['an unknown field', { tenantId: PROFILE.tenantId }, 'tenantId'],
  ])('rejects %s before calling Core', async (_name, override, message) => {
    const result = await createInvoiceDraft(PROJECT_ID, { ...draft(2500), ...override })

    expect(result.error).toContain('Invoice draft is invalid')
    expect(result.error).toContain(message)
    expect(mocks.createCustomerInvoiceDraftThroughCoreApi).not.toHaveBeenCalled()
  })

  it('requires the finance capability before opening the Core boundary', async () => {
    mocks.requireCapability.mockImplementation(() => {
      throw new Error('Forbidden: finance capability required')
    })

    await expect(createInvoiceDraft(PROJECT_ID, draft(2500))).resolves.toEqual({
      error: 'You do not have permission to create invoices.',
    })
    expect(mocks.createCustomerInvoiceDraftThroughCoreApi).not.toHaveBeenCalled()
  })
})
